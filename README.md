# Meridian Clinical — MERN Full-Stack Hospital Management System

A full-stack **MERN** (MongoDB, Express.js, React 19, Node.js) Hospital Management System engineered as a modern dark clinical operations console.

## Features

- **Role-Based Staff Console (JWT + bcrypt)** — Dedicated access tiers for **Admin**, **Doctor**, and **Reception** enforced on both Express API middleware and React UI views.
- **Operations Overview** — Live KPI dashboard, active outpatient triage queue, inpatient ward occupancy breakdown, diagnostic alerts, and pharmacy reorder alerts.
- **Patients & Electronic Health Records (EHR)** — Patient registry with auto-generated MRNs and a slide-over EHR workspace covering vitals flowsheets, clinical encounter notes, prescriptions (with automatic pharmacy stock deduction), lab results, and billing history.
- **Doctors, Departments & Shift Schedules** — Physician roster, department filters, real-time duty status controls, and an interactive 7-day shift schedule editor.
- **Appointments & Outpatient Queue** — Appointment scheduling with automatic physician fee lookup and live queue progression (`Scheduled` → `Checked In` → `In Consultation` → `Completed` / `Cancelled`).
- **Inpatient Wards & Bed Allocation** — Interactive bed map across ICU, General Medicine, Surgical, Pediatrics, and Maternity units with admission, round notes, bed transfer, maintenance controls, and discharge-to-invoice handoff.
- **Pharmacy Inventory & Diagnostic Lab Reports** — Formulary stock management with restock/dispense adjustments and low-stock filtering, plus a lab order pipeline with structured result entry, critical flags, and printable reports.
- **Billing, Invoices & Payment Status** — Multi-line itemized invoice builder, insurance coverage deductions, partial/full payment recording, and printable hospital billing statements.
- **Staff Account Provisioning** — Admin console for creating and activating/deactivating staff accounts.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite, Lucide Icons
- **Backend**: Node.js, Express.js, TypeScript (`tsx`)
- **Database**: MongoDB via **Mongoose** (automatically falls back to a disk-persisted local JSON document store in `data/meridian-hms.json` when `MONGODB_URI` is omitted)
- **Authentication**: JSON Web Tokens (`jsonwebtoken`) & password hashing (`bcryptjs`)

## Getting Started Locally

### 1. Clone and install dependencies

```bash
git clone <your-github-repo-url>
cd meridian-clinical-hms
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

- **With MongoDB (Atlas or local `mongod`)**: Set `MONGODB_URI` in `.env` (e.g., `MONGODB_URI="mongodb+srv://..."` or `mongodb://127.0.0.1:27017/meridian_hms`).
- **Zero-config local mode**: Leave `MONGODB_URI` blank to run immediately using the built-in local persistent store.

### 3. Run in development

```bash
npm run dev
```

Open `http://localhost:3000`.

### 4. Build for production

```bash
npm run build
NODE_ENV=production npm start
```

## Pre-Seeded Staff Accounts

On first launch against an empty database, Meridian Clinical seeds realistic hospital data and three demo staff logins:

| Role      | Email                          | Password        |
|-----------|--------------------------------|-----------------|
| Admin     | `admin@meridianclinical.org`   | `Admin@123`     |
| Doctor    | `doctor@meridianclinical.org`  | `Doctor@123`    |
| Reception | `reception@meridianclinical.org` | `Reception@123` |

## API Overview

- `GET /api/health` — Server and database storage mode health check
- `POST /api/auth/login` · `GET /api/auth/me` — Staff authentication & session verification
- `GET /api/dashboard` — Aggregated hospital KPIs, ward capacity, and live queue
- `GET/POST /api/patients` · `GET/PATCH/DELETE /api/patients/:id` · `POST /api/patients/:id/{vitals,notes,prescriptions}`
- `GET/POST /api/doctors` · `PATCH/DELETE /api/doctors/:id`
- `GET/POST /api/appointments` · `PATCH/DELETE /api/appointments/:id`
- `GET /api/wards` · `POST /api/wards/:id/{admit,discharge,transfer,rounds}` · `PATCH /api/wards/:id/status`
- `GET/POST /api/pharmacy` · `POST /api/pharmacy/:id/adjust` · `DELETE /api/pharmacy/:id`
- `GET/POST /api/labs` · `PATCH /api/labs/:id`
- `GET/POST /api/billing` · `POST /api/billing/:id/payments` · `DELETE /api/billing/:id`
- `GET/POST /api/staff` · `PATCH /api/staff/:id` (Admin only)
