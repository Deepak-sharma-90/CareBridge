import jwt from 'jsonwebtoken';
export function signUser(user){return jwt.sign({userId:user.UserId,role:user.Role,clinicId:user.ClinicId},process.env.JWT_SECRET,{expiresIn:'8h'});}
export function auth(req,res,next){try{const h=req.headers.authorization||''; if(!h.startsWith('Bearer ')) return res.status(401).json({message:'Authentication required'}); req.user=jwt.verify(h.slice(7),process.env.JWT_SECRET); next();}catch{return res.status(401).json({message:'Invalid or expired token'});}}
export function roles(...allowed){return (req,res,next)=>allowed.includes(req.user.role)?next():res.status(403).json({message:'Forbidden'});}
