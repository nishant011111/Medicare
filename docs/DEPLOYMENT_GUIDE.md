# MediCore Cloud Deployment & Android Release Guide (Phase 15)

## 1. Infrastructure & Database Preparation (PostgreSQL / Neon)

1. Provision a managed **PostgreSQL 16** database (e.g., Neon) with TLS enabled (`sslmode=require`).
2. Obtain two connection strings from your database provider:
   - **`DATABASE_URL`**: Pooled connection URI (e.g., Neon `-pooler` host with `?sslmode=require&pgbouncer=true&connection_limit=20&pool_timeout=15`) for runtime queries.
   - **`DIRECT_URL`**: Direct unpooled connection URI (`?sslmode=require`) required by Prisma CLI migrations (`migrate deploy`).
3. **Never run destructive commands (`prisma migrate reset` or `--force-reset`) on staging/production.** Apply schema migrations safely:
   ```bash
   cd backend
   npx prisma validate
   npx prisma migrate deploy
   ```

---

## 2. Backend Deployment on Vercel (`/backend`)

The backend is prepared for Vercel serverless Express execution via `/backend/vercel.json` and `/backend/api/index.ts`.

### Required Environment Variables (Set in Vercel Project Settings — never commit `.env`)
Refer to `/backend/.env.example`:
- `NODE_ENV=production`
- `TRUST_PROXY=true`
- `DATABASE_URL` & `DIRECT_URL`
- `JWT_ACCESS_SECRET` & `JWT_REFRESH_SECRET` (minimum 32 cryptographically random characters each; distinct values)
- `JWT_ISSUER=medicore-api`, `JWT_AUDIENCE=medicore-clients`
- `CORS_ORIGIN` (comma-separated allowed HTTPS web origins)
- `PAYMENT_GATEWAY_MODE=sandbox`
- `SMTP_*`, `SMS_PROVIDER` as configured for production notifications

### Vercel Build Configuration
- **Root Directory**: `backend`
- **Install Command**: `npm ci`
- **Build Command**: `npm run prisma:generate && npm run build`
- **Post-Deploy Health Checks**:
  - `GET /health/live` -> `200 OK`
  - `GET /health/ready` -> `200 OK` (confirms active `SELECT 1` against PostgreSQL)

### Note on Staff/Admin Web Application (React + Vite)
No `/web` directory exists in this repository workspace. Deploy the separate React + Vite staff/admin web project to Vercel pointing its `VITE_API_BASE_URL` to the deployed backend `/api/v1` origin and add its production URL to `CORS_ORIGIN`.

---

## 3. Android Patient App Release Preparation (`/app`)

1. Point `NetworkClientProvider` production base URL (`DEFAULT_BASE_URL`) to the final production HTTPS backend domain before cutting a Play Store build.
2. Confirm `AndroidManifest.xml` retains:
   - `android:allowBackup="false"`
   - `android:networkSecurityConfig="@xml/network_security_config"` (`cleartextTrafficPermitted="false"`)
   - Least-privilege permissions only (`INTERNET`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`).
3. Provide release upload keystore credentials via secure CI environment variables (never committed):
   - `KEYSTORE_PATH` (defaults to `my-upload-key.jks`)
   - `STORE_PASSWORD`
   - `KEY_PASSWORD`
4. Run unit & Robolectric verification and assemble signed release AAB:
   ```bash
   gradle :app:testDebugUnitTest
   gradle :app:bundleRelease
   ```

---

## 4. Controlled Rollback Procedure
- **Backend**: Promote the previous immutable Vercel deployment in the Vercel dashboard immediately on elevated 5xx or failed `/health/ready` probes.
- **Database**: Restore the pre-migration Neon branch snapshot / WAL point-in-time recovery snapshot if a migration causes regression.
- **Android**: Halt staged Play Console rollout and push a patched versionCode if crash/ANR thresholds exceed SLA.
