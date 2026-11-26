CREATE TABLE Users (
  UserId INT IDENTITY(1,1) PRIMARY KEY,
  FullName NVARCHAR(120) NOT NULL,
  Email NVARCHAR(255) NOT NULL UNIQUE,
  PasswordHash NVARCHAR(255) NOT NULL,
  Role NVARCHAR(20) NOT NULL CHECK (Role IN ('WORKER','DOCTOR','ADMIN')),
  ClinicId INT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE TABLE Clinics (
  ClinicId INT IDENTITY(1,1) PRIMARY KEY,
  ClinicName NVARCHAR(150) NOT NULL,
  Location NVARCHAR(200) NOT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
ALTER TABLE Users ADD CONSTRAINT FK_Users_Clinics FOREIGN KEY (ClinicId) REFERENCES Clinics(ClinicId);
CREATE TABLE Patients (
  PatientId INT IDENTITY(1,1) PRIMARY KEY,
  ClinicId INT NOT NULL,
  FullName NVARCHAR(120) NOT NULL,
  DateOfBirth DATE NULL,
  Sex NVARCHAR(20) NULL,
  Phone NVARCHAR(30) NULL,
  Symptoms NVARCHAR(MAX) NOT NULL,
  Temperature DECIMAL(5,2) NULL,
  HeartRate INT NULL,
  SystolicBP INT NULL,
  DiastolicBP INT NULL,
  OxygenSaturation DECIMAL(5,2) NULL,
  TriageScore INT NOT NULL DEFAULT 0,
  TriageLevel NVARCHAR(20) NOT NULL DEFAULT 'LOW',
  Status NVARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  CreatedBy INT NOT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  FOREIGN KEY (ClinicId) REFERENCES Clinics(ClinicId),
  FOREIGN KEY (CreatedBy) REFERENCES Users(UserId)
);
CREATE TABLE Consultations (
  ConsultationId INT IDENTITY(1,1) PRIMARY KEY,
  PatientId INT NOT NULL,
  DoctorId INT NULL,
  ClinicId INT NOT NULL,
  ScheduledStart DATETIME2 NULL,
  ScheduledEnd DATETIME2 NULL,
  Status NVARCHAR(20) NOT NULL DEFAULT 'PENDING',
  Notes NVARCHAR(MAX) NULL,
  Prescription NVARCHAR(MAX) NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  FOREIGN KEY (PatientId) REFERENCES Patients(PatientId),
  FOREIGN KEY (DoctorId) REFERENCES Users(UserId),
  FOREIGN KEY (ClinicId) REFERENCES Clinics(ClinicId)
);
CREATE TABLE MedicalDocuments (
  DocumentId INT IDENTITY(1,1) PRIMARY KEY,
  PatientId INT NOT NULL,
  UploadedBy INT NOT NULL,
  FileName NVARCHAR(255) NOT NULL,
  BlobName NVARCHAR(500) NOT NULL,
  ContentType NVARCHAR(120) NULL,
  UploadedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  FOREIGN KEY (PatientId) REFERENCES Patients(PatientId),
  FOREIGN KEY (UploadedBy) REFERENCES Users(UserId)
);
CREATE TABLE ActivityLogs (
  LogId BIGINT IDENTITY(1,1) PRIMARY KEY,
  UserId INT NULL,
  Action NVARCHAR(100) NOT NULL,
  EntityType NVARCHAR(50) NULL,
  EntityId INT NULL,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  FOREIGN KEY (UserId) REFERENCES Users(UserId)
);
CREATE INDEX IX_Patients_Triage ON Patients(Status, TriageScore DESC, CreatedAt ASC);
CREATE INDEX IX_Consultations_DoctorTime ON Consultations(DoctorId, ScheduledStart, ScheduledEnd);
CREATE INDEX IX_ActivityLogs_CreatedAt ON ActivityLogs(CreatedAt);
CREATE VIEW dbo.V_Epidemiology AS
SELECT c.ClinicName, p.TriageLevel, COUNT(*) AS CaseCount,
       CAST(p.CreatedAt AS DATE) AS CaseDate
FROM Patients p JOIN Clinics c ON p.ClinicId=c.ClinicId
GROUP BY c.ClinicName, p.TriageLevel, CAST(p.CreatedAt AS DATE);
