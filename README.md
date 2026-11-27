# MediCore Healthcare Platform (Phases 1–15)

A multi-hospital patient healthcare platform built with a **Kotlin + Jetpack Compose** Android Patient Application, a shared **Express.js + TypeScript** REST backend, and **PostgreSQL + Prisma ORM** as the single source of truth.

> **Workspace Note (Phase 15 Audit):** The Android patient app (`/app`) and shared Express/Prisma backend (`/backend`) reside in this repository. The **React + Vite** staff/admin web application directory (`/web`) is not present in this workspace and must be included from its frontend repository before combined web deployment.

---

## Architecture Overview

| Layer | Technology | Scope & Responsibility |
|---|---|---|
| **Android Patient App** | Kotlin, Jetpack Compose, MVVM, Retrofit, Moshi, Room/DataStore, Keystore AES-256-GCM | Exclusively for patients: onboarding, hospital/doctor discovery, appointment booking, EHR, prescriptions, medication reminders, vitals/health tracking, notifications, doctor messaging, billing/payments/receipts. |
| **Shared Backend API** | Node.js 22, Express.js, TypeScript, Zod, Helmet, Rate Limiter | Centralized REST API (`/api/v1`) enforcing JWT auth, RBAC, multi-hospital isolation, Razorpay/payment verification, PDF generation, TOTP MFA, AI safety, and structured PII-redacted logging. |
| **Database** | PostgreSQL + Prisma ORM (`/backend/prisma/schema.prisma`) | Single source of truth for users, hospitals, clinical records, appointments, vitals, medications, notifications, messaging, billing invoices, payments, receipts, audit logs, and SaaS entitlements. |
| **Staff Web Portal** | React + Vite *(external/not present in this workspace)* | Role-based clinical & hospital admin console backed by the same Express API + PostgreSQL DB. |

---

## Core Patient & Platform Modules

- **Phases 2–5**: Multi-hospital RBAC, Argon2id password hashing, JWT access + rotating refresh token families, Android Keystore encrypted token storage, patient onboarding & profile management.
- **Phases 6–7**: Hospital & Doctor Discovery (with verified 25-facility Ranchi reference directory) and slot-accurate Appointment Booking with concurrency double-booking prevention.
- **Phases 8–10**: Clinical EHR, Lab Reports, Health Vitals/BMI tracking, and Medication Adherence + exact local dose reminders (`MedicationDashboardScreen`, `MedicationDetailScreen`, `AddEditReminderScreen`).
- **Phases 11–12**: Lock-screen PHI-redacted Notifications and authorized Patient–Doctor Messaging.
- **Phase 13**: Patient Billing, Invoices & Verified Payments (`BillingDashboardScreen`, `InvoiceDetailScreen`, `PaymentCheckoutScreen`, `PaymentStatusScreen`, `PaymentHistoryScreen`, `ReceiptViewerScreen`), integer paise arithmetic, server-side HMAC-SHA256 gateway & webhook signature verification, idempotent order creation, and `%PDF-1.4` invoice/receipt downloads.
- **Phases 14–15**: Security & Privacy hardening (`allowBackup="false"`, `network_security_config.xml` HTTPS-only, ProGuard log stripping, strict CORS, brute-force login lockout, TOTP MFA, composite DB indexes, `Cache-Control: private, no-store`, graceful SIGTERM shutdown) and Vercel deployment readiness (`backend/vercel.json`, `backend/api/index.ts`).

---

## Quick Verification Commands

### Backend (`/backend`)
```bash
cd backend
npm ci
npx prisma validate && npm run prisma:generate
npm run build
npm test
```

### Android (`/app`)
```bash
gradle :app:testDebugUnitTest
gradle :app:assembleDebug
```

---

## Documentation Index
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md) — Vercel serverless Express setup, Neon PostgreSQL pooled + direct URLs, Android signed release instructions, and environment variable checklist.
- [Security Checklist](docs/SECURITY_CHECKLIST.md) — Phase 14 audit controls, RBAC/IDOR/payment protections, and pre-launch operational requirements.
- [Backup & Recovery](docs/BACKUP_AND_RECOVERY.md) — PostgreSQL WAL/PITR strategy, object storage versioning, and staging restore drill verification.
- [API Documentation](docs/API_DOCUMENTATION.md) — REST API reference (`/api/v1`).
- [Privacy & DPDP Readiness](docs/PRIVACY_AND_DPDP_READINESS.md) — Patient consent, data minimization, and notification redaction controls.
