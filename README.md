# CareBridge — Remote Triage & Consultation System

CareBridge is a telehealth MVP connecting rural health workers with specialist doctors. Health workers register patients, record symptoms/vitals and upload medical reports; doctors receive a priority queue, accept cases, schedule consultations and record prescriptions; administrators monitor activity and epidemiological trends.

## Features
1. Role-based authentication: Worker, Doctor, Admin dashboards.
2. Patient triage and priority queue based on vitals/symptoms.
3. Medical document upload to Azure Blob Storage.
4. Conflict-aware consultation scheduling.
5. Epidemiological analytics dashboard.
6. Mandatory activity logging for medical-record access.
7. Parameterized SQL queries, bcrypt password hashing and JWT authorization.

## Architecture
React frontend -> Express REST API -> Azure SQL Database + Azure Blob Storage.

## Project structure
- `client/` React frontend
- `server/` Node/Express backend
- `database/schema.sql` Azure SQL schema
- `.env.example` environment variable template

## Run locally
Backend: `cd server && npm install && cp ../.env.example .env && npm run dev`
Frontend: `cd client && npm install && npm run dev`

Set `VITE_API_URL=http://localhost:5000/api` for the frontend. Run `database/schema.sql` in Azure SQL.

## Important
This is an academic MVP, not a certified medical system. Do not use real patient data until appropriate security, privacy, compliance, clinical-safety, backup and penetration testing is complete.