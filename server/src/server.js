import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import {BlobServiceClient} from '@azure/storage-blob';
import 'dotenv/config';
import {getPool,sql} from './db.js';
import {auth,roles,signUser} from './auth.js';
import {calculateTriage} from './triage.js';

const app=express();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024}});
app.use(cors({origin:process.env.CORS_ORIGIN||'*'}));
app.use(express.json());
const blob=process.env.AZURE_STORAGE_CONNECTION_STRING?BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING):null;
async function log(req,action,type,id){
 const p=await getPool();
 await p.request().input('u',sql.Int,req.user?.userId??null).input('a',sql.NVarChar,action).input('t',sql.NVarChar,type).input('i',sql.Int,id??null).query('INSERT INTO ActivityLogs(UserId,Action,EntityType,EntityId) VALUES(@u,@a,@t,@i)');
}
app.get('/api/health',(req,res)=>res.json({ok:true,service:'CareBridge API'}));
app.post('/api/auth/register',async(req,res)=>{try{
 const {fullName,email,password,role='WORKER',clinicId}=req.body;
 if(!fullName||!email||!password)return res.status(400).json({message:'Name, email and password are required'});
 const hash=await bcrypt.hash(password,12);const p=await getPool();
 const assignedClinic=clinicId||(role==='WORKER'||role==='DOCTOR'?(await p.request().query('SELECT TOP 1 ClinicId FROM Clinics ORDER BY ClinicId')).recordset[0]?.ClinicId:null);
 const r=await p.request().input('n',sql.NVarChar,fullName).input('e',sql.NVarChar,email.toLowerCase()).input('h',sql.NVarChar,hash).input('r',sql.NVarChar,role).input('c',sql.Int,assignedClinic||null).query('INSERT INTO Users(FullName,Email,PasswordHash,Role,ClinicId) OUTPUT INSERTED.UserId,INSERTED.FullName,INSERTED.Email,INSERTED.Role,INSERTED.ClinicId VALUES(@n,@e,@h,@r,@c)');
 res.status(201).json({token:signUser(r.recordset[0]),user:r.recordset[0]});
 }catch(e){res.status(400).json({message:e.message});}});
app.post('/api/auth/login',async(req,res)=>{try{
 const p=await getPool();const r=await p.request().input('e',sql.NVarChar,String(req.body.email||'').toLowerCase()).query('SELECT * FROM Users WHERE Email=@e');
 const u=r.recordset[0];if(!u||!(await bcrypt.compare(req.body.password||'',u.PasswordHash)))return res.status(401).json({message:'Invalid credentials'});
 const safe={UserId:u.UserId,FullName:u.FullName,Email:u.Email,Role:u.Role,ClinicId:u.ClinicId};
 res.json({token:signUser(safe),user:safe});
 }catch(e){res.status(500).json({message:e.message});}});
app.get('/api/clinics',auth,async(req,res)=>{const p=await getPool();const r=await p.request().query('SELECT * FROM Clinics ORDER BY ClinicName');res.json(r.recordset);});
app.post('/api/clinics',auth,roles('ADMIN'),async(req,res)=>{const p=await getPool();const r=await p.request().input('n',sql.NVarChar,req.body.name).input('l',sql.NVarChar,req.body.location).query('INSERT INTO Clinics(ClinicName,Location) OUTPUT INSERTED.* VALUES(@n,@l)');res.status(201).json(r.recordset[0]);});
app.post('/api/patients',auth,roles('WORKER','ADMIN'),async(req,res)=>{try{
 const t=calculateTriage(req.body);const p=await getPool();
 const r=await p.request().input('c',sql.Int,req.body.clinicId||req.user.clinicId).input('n',sql.NVarChar,req.body.fullName).input('d',sql.Date,req.body.dateOfBirth||null).input('s',sql.NVarChar,req.body.sex||null).input('ph',sql.NVarChar,req.body.phone||null).input('sy',sql.NVarChar,req.body.symptoms||'').input('temp',sql.Decimal(5,2),req.body.temperature||null).input('hr',sql.Int,req.body.heartRate||null).input('sb',sql.Int,req.body.systolicBP||null).input('db',sql.Int,req.body.diastolicBP||null).input('os',sql.Decimal(5,2),req.body.oxygenSaturation||null).input('ts',sql.Int,t.score).input('tl',sql.NVarChar,t.level).input('by',sql.Int,req.user.userId).query('INSERT INTO Patients(ClinicId,FullName,DateOfBirth,Sex,Phone,Symptoms,Temperature,HeartRate,SystolicBP,DiastolicBP,OxygenSaturation,TriageScore,TriageLevel,CreatedBy) OUTPUT INSERTED.* VALUES(@c,@n,@d,@s,@ph,@sy,@temp,@hr,@sb,@db,@os,@ts,@tl,@by)');
 await log(req,'CREATE_PATIENT','Patient',r.recordset[0].PatientId);res.status(201).json(r.recordset[0]);
 }catch(e){res.status(400).json({message:e.message});}});
app.get('/api/triage',auth,roles('DOCTOR','ADMIN'),async(req,res)=>{const p=await getPool();const r=await p.request().query("SELECT p.*,c.ClinicName FROM Patients p JOIN Clinics c ON p.ClinicId=c.ClinicId WHERE p.Status='QUEUED' ORDER BY CASE p.TriageLevel WHEN 'CRITICAL' THEN 1 WHEN 'URGENT' THEN 2 ELSE 3 END,p.CreatedAt");res.json(r.recordset);});
app.get('/api/patients',auth,roles('WORKER','DOCTOR','ADMIN'),async(req,res)=>{try{
 const p=await getPool();const q=req.user.role==='ADMIN'?'':'WHERE ClinicId=@c';const r=await p.request().input('c',sql.Int,req.user.clinicId).query(`SELECT PatientId,FullName,ClinicId,TriageLevel,Status FROM Patients ${q} ORDER BY CreatedAt DESC`);res.json(r.recordset);
 }catch(e){res.status(500).json({message:e.message});}});
app.get('/api/doctors',auth,roles('WORKER','DOCTOR','ADMIN'),async(req,res)=>{try{
 const p=await getPool();const q=req.user.role==='ADMIN'?'WHERE Role=\'DOCTOR\'':'WHERE Role=\'DOCTOR\' AND ClinicId=@c';const r=await p.request().input('c',sql.Int,req.user.clinicId).query(`SELECT UserId,FullName FROM Users ${q} ORDER BY FullName`);res.json(r.recordset);
 }catch(e){res.status(500).json({message:e.message});}});
app.post('/api/consultations',auth,roles('WORKER','DOCTOR','ADMIN'),async(req,res)=>{const {patientId,doctorId,start,end,notes=''}=req.body;const startDate=new Date(start),endDate=new Date(end);if(!patientId||!start||!end||Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime())||endDate<=startDate)return res.status(400).json({message:'Select a patient and valid start/end times.'});const p=await getPool();const tx=new sql.Transaction(p);try{
 await tx.begin();
 const patient=await new sql.Request(tx).input('p',sql.Int,patientId).query('SELECT PatientId,ClinicId FROM Patients WHERE PatientId=@p');
 if(!patient.recordset.length){await tx.rollback();return res.status(404).json({message:'Patient not found.'});}
 const patientClinic=patient.recordset[0].ClinicId;
 if(req.user.role!=='ADMIN'&&req.user.clinicId!==patientClinic){await tx.rollback();return res.status(403).json({message:'You can only schedule patients from your clinic.'});}
 const assignedDoctor=req.user.role==='DOCTOR'?req.user.userId:Number(doctorId);
 if(!assignedDoctor){await tx.rollback();return res.status(400).json({message:'Select a doctor for this consultation.'});}
 const doctor=await new sql.Request(tx).input('d',sql.Int,assignedDoctor).query("SELECT UserId,ClinicId FROM Users WHERE UserId=@d AND Role='DOCTOR'");
 if(!doctor.recordset.length){await tx.rollback();return res.status(400).json({message:'Selected doctor was not found.'});}
 if(req.user.role!=='ADMIN'&&doctor.recordset[0].ClinicId!==patientClinic){await tx.rollback();return res.status(400).json({message:'Patient and doctor must belong to the same clinic.'});}
 const existing=await new sql.Request(tx).input('d',sql.Int,assignedDoctor).input('s',sql.DateTime2,startDate).input('e',sql.DateTime2,endDate).query("SELECT ConsultationId FROM Consultations WHERE DoctorId=@d AND Status IN ('PENDING','SCHEDULED') AND ScheduledStart < @e AND ScheduledEnd > @s");
 if(existing.recordset.length){await tx.rollback();return res.status(409).json({message:'Selected doctor already has a consultation during this time.'});}
 const r=await new sql.Request(tx).input('p',sql.Int,patientId).input('d',sql.Int,assignedDoctor).input('c',sql.Int,patientClinic).input('s',sql.DateTime2,startDate).input('e',sql.DateTime2,endDate).input('n',sql.NVarChar(sql.MAX),notes).query("INSERT INTO Consultations(PatientId,DoctorId,ClinicId,ScheduledStart,ScheduledEnd,Status,Notes) OUTPUT INSERTED.* VALUES(@p,@d,@c,@s,@e,'SCHEDULED',@n)");
 await new sql.Request(tx).input('id',sql.Int,patientId).query("UPDATE Patients SET Status='SCHEDULED' WHERE PatientId=@id");
 await tx.commit();await log(req,'SCHEDULE_CONSULTATION','Consultation',r.recordset[0].ConsultationId);res.status(201).json(r.recordset[0]);
 }catch(e){try{await tx.rollback()}catch{}res.status(400).json({message:e.message});}});app.get('/api/consultations',auth,async(req,res)=>{const p=await getPool();const q=req.user.role==='DOCTOR'?'WHERE c.DoctorId=@d':'WHERE c.ClinicId=@c';const r=await p.request().input('d',sql.Int,req.user.userId).input('c',sql.Int,req.user.clinicId).query(`SELECT c.*,p.FullName PatientName FROM Consultations c JOIN Patients p ON c.PatientId=p.PatientId ${q} ORDER BY c.ScheduledStart DESC`);res.json(r.recordset);});
app.post('/api/documents/:patientId',auth,roles('WORKER','DOCTOR','ADMIN'),upload.single('file'),async(req,res)=>{if(!req.file)return res.status(400).json({message:'File required'});if(!blob)return res.status(500).json({message:'Azure Blob Storage is not configured'});const container=blob.getContainerClient(process.env.AZURE_BLOB_CONTAINER||'medical-documents');await container.createIfNotExists();const safe=req.file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_');const blobName=`patient-${req.params.patientId}/${Date.now()}-${safe}`;const b=container.getBlockBlobClient(blobName);await b.uploadData(req.file.buffer,{blobHTTPHeaders:{blobContentType:req.file.mimetype}});const p=await getPool();const r=await p.request().input('p',sql.Int,req.params.patientId).input('u',sql.Int,req.user.userId).input('f',sql.NVarChar,req.file.originalname).input('b',sql.NVarChar,blobName).input('ct',sql.NVarChar,req.file.mimetype).query('INSERT INTO MedicalDocuments(PatientId,UploadedBy,FileName,BlobName,ContentType) OUTPUT INSERTED.* VALUES(@p,@u,@f,@b,@ct)');await log(req,'UPLOAD_MEDICAL_DOCUMENT','Patient',Number(req.params.patientId));res.status(201).json(r.recordset[0]);});
app.get('/api/documents/:patientId',auth,async(req,res)=>{const p=await getPool();const r=await p.request().input('id',sql.Int,req.params.patientId).query('SELECT DocumentId,FileName,ContentType,UploadedAt,BlobName FROM MedicalDocuments WHERE PatientId=@id ORDER BY UploadedAt DESC');await log(req,'VIEW_MEDICAL_DOCUMENTS','Patient',Number(req.params.patientId));res.json(r.recordset);});
app.get('/api/analytics',auth,roles('ADMIN'),async(req,res)=>{const p=await getPool();const r=await p.request().query('SELECT * FROM dbo.V_Epidemiology ORDER BY CaseDate DESC');res.json(r.recordset);});
app.get('/api/activity-logs',auth,roles('ADMIN'),async(req,res)=>{const p=await getPool();const r=await p.request().query('SELECT TOP 200 l.*,u.FullName FROM ActivityLogs l LEFT JOIN Users u ON l.UserId=u.UserId ORDER BY l.CreatedAt DESC');res.json(r.recordset);});
app.use((err,req,res,next)=>res.status(500).json({message:'Unexpected server error'}));
app.listen(process.env.PORT||5000,()=>console.log(`CareBridge API running on ${process.env.PORT||5000}`));
