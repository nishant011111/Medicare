# MediCore – Unified Healthcare Platform & ECG Loading System

A multi-hospital healthcare management platform uniting a **Kotlin + Jetpack Compose Android Patient App** (`/app`), a **React + Vite Web Staff & Admin Console** (`/web`), a shared **Express.js + TypeScript Backend** (`/backend`) with atomic disk persistence & Prisma/PostgreSQL schema, and a shared **Firebase Firestore** database (`ai-studio-medicare-8567e0e2-d4bb-4849-9f8b-f0a01b6a07e0`).

---

## Architecture Overview

| Layer | Technology | Scope & Responsibility |
|---|---|---|
| **Android Patient App (`/app`)** | Kotlin, Jetpack Compose, MVVM, Retrofit, Moshi, Room/DataStore, Keystore AES-256-GCM, Firebase Auth/Firestore | Patient onboarding, Ranchi Hospital Contact Directory (29 facilities), doctor discovery, appointment booking, EHR, prescriptions, medication reminders, vitals/health tracking, notifications, doctor messaging, billing/payments/receipts, and multi-role dashboard views. |
| **Web Staff Console (`/web`)** | React 19, TypeScript, Vite, Tailwind CSS, Firebase Auth/Firestore | Hospital Admin, Super Admin, Doctor, Nurse, Receptionist, Pharmacist, Lab Technician, and Accountant operational workflows backed by the shared backend & Firestore database. |
| **Shared Backend API (`/backend`)** | Node.js 22, Express.js, TypeScript, Zod, Helmet, Rate Limiter | Centralized REST API (`/api/v1`) enforcing JWT auth, OTP/Google authentication, RBAC, multi-hospital isolation, Razorpay/sandbox payment verification, PDF generation, TOTP MFA, AI safety, and structured PII-redacted logging. |
| **Unified Persistence** | Atomic JSON snapshot (`backend/storage/medicore-unified-db.json`), Prisma/PostgreSQL schema, & Shared Firestore DB | Single source of truth across Web and Android for users, Ranchi hospital directory records (`RNC001`–`RNC029`), clinical records, appointments, vitals, medications, notifications, billing invoices, payments, receipts, and audit logs. |

---

## MediCore ECG Universal Loading System

A unified medical-monitor-inspired ECG heartbeat waveform animation providing consistent loading feedback across both Android (Jetpack Compose Canvas) and Web (React SVG).

### Design Identity

| Property | Value |
|---|---|
| Product | MediCore |
| Feature | ECG Universal Loading System |
| Primary colour | `#0878D1` |
| Secondary colour | `#123B63` |
| Background | `#FFFFFF` |
| Animation style | P-Q-R-S-T ECG heartbeat waveform |
| Accessibility | Reduced-motion support (`Settings.Global.ANIMATOR_DURATION_SCALE` on Android, `prefers-reduced-motion` on Web) |

### Component Architecture

- **Android (`app/src/main/java/com/example/core/designsystem/components/MediCoreECGLoader.kt`)**:
  - `LoadingState<T>` (`Idle`, `Loading`, `Success`, `Error`)
  - `MediCoreECGLoader`, `MediCoreFullScreenLoader`, `MediCorePageLoader`, `MediCoreInlineLoader`, `MediCoreButtonLoader`, `MediCoreSplashLoader`, `MediCoreErrorState`, `MediCoreStateContainer`
- **Web (`web/src/components/ui/MediCoreECGLoader.tsx`)**:
  - `MediCoreECGLoader`, `MediCorePageLoader`, `MediCoreInlineLoader`, `MediCoreButtonLoader`, and `OfficialLogoLoader` integration

### Loading Duration Policy

- The Android splash experience uses a configurable minimum display duration of 3 seconds.
- Normal operations start the ECG animation when an operation begins, clear it upon completion, and display a retryable error state on failure without artificial delays.

---

## Core Platform Modules

- **Authentication & RBAC**: Passwordless Phone/Email OTP + Google Sign-In, Argon2id staff password hashing, JWT access + rotating refresh token families, Android Keystore encrypted token storage, and TOTP MFA.
- **Ranchi Hospital Contact Directory (`RNC001`–`RNC029`)**: Authentic 29-hospital Ranchi directory (from RIMS through Anvi Newborn and Child Hospital) with idempotent JSON/CSV import, blank contact fields preserved as `null`, and Super Admin verification workflows.
- **Clinical & Operations**: Slot-accurate appointment booking with double-booking prevention, EHR, lab reports, health vitals/BMI, medication adherence reminders, lock-screen PHI-redacted notifications, and integer-paise billing with HMAC-SHA256 verified payments and `%PDF-1.4` receipts.
- **Security & Deployment**: `allowBackup="false"`, HTTPS-only `network_security_config.xml`, strict CORS, brute-force lockout, deployed `firestore.rules`, and CI/CD pipelines (`.github/workflows/`).

---

## Quick Verification Commands

```bash
# Backend tests, build & Web lint
npm --workspace=backend test
npm run build
npm run lint

# Android debug build & lint
gradle :app:assembleDebug :app:lintDebug
```

## Documentation Index
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Security Checklist](docs/SECURITY_CHECKLIST.md)
- [Backup & Recovery](docs/BACKUP_AND_RECOVERY.md)
- [API Documentation](docs/API_DOCUMENTATION.md)
- [Privacy & DPDP Readiness](docs/PRIVACY_AND_DPDP_READINESS.md)
