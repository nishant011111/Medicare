# MediCore Production Security & Privacy Checklist (Phases 14–15)

## 1. Verified Security Controls Implemented
- [x] **Authentication & Brute-Force Protection:** Argon2id password hashing, progressive login lockout (`ACCOUNT_LOGIN_LOCKED`), short-lived JWT access tokens, rotating refresh token families with reuse detection, and full device revocation on password reset.
- [x] **Optional TOTP MFA:** RFC 6238 TOTP MFA setup/verification/disable flows in `/api/v1/security/mfa/*`.
- [x] **Strict RBAC & Multi-Tenant Isolation:** `requireHospitalAccess` validates `userId`, active `HospitalMembership`, and `RoleCode` on every tenant request (`X-Hospital-Id` or route/query param) against PostgreSQL. Patient endpoints enforce `patientId` ownership and never expose staff hubs on Android.
- [x] **Android Client Hardening:**
  - `android:allowBackup="false"` with explicit `backup_rules.xml` & `data_extraction_rules.xml` exclusions for session DataStore, alarm preferences, and local Room cache.
  - `network_security_config.xml` sets `cleartextTrafficPermitted="false"`.
  - OkHttp response disk cache disabled (`cache(null)`), HTTP logs gated to `BuildConfig.DEBUG` with header redaction, and ProGuard strips verbose debug logs.
  - `SecureTokenStorage` stores session tokens encrypted via Android Keystore AES-256-GCM.
  - Private invoice/receipt PDFs saved strictly inside app-private `cacheDir/docs` and shared via scoped `FileProvider`.
- [x] **Billing & Payment Integrity:** Exact integer minor units (`paise`), idempotent order creation, server-side HMAC-SHA256 verification for checkout & webhooks (`X-Razorpay-Signature`), and receipts gated behind `SUCCESS`/`CAPTURED` payment verification.
- [x] **Privacy & Log Redaction:** `StructuredLogger` strips sensitive PHI/payment/credential keys (`password`, `token`, `gatewaySignature`, etc.); lock-screen notifications redact clinical details.
- [x] **HTTP Security & Caching Headers:** Helmet protections, strict allowlist `CORS_ORIGIN`, `1mb` JSON limit + raw body capture for webhooks, `Cache-Control: private, no-store` on `/api/*`, `X-Content-Type-Options: nosniff`, and tiered rate limiters (auth, billing, messaging, global).

## 2. Known Risks & Mandatory Pre-Launch Actions
1. **Dependency Advisory (`zod` / transitive audit):** Ensure `npm audit` is monitored cleanly before release; upgrade `zod` when compatible with schema validators.
2. **Production Secrets Rotation:** Generate fresh `JWT_ACCESS_SECRET` (>= 32 chars), `JWT_REFRESH_SECRET` (>= 32 chars), and upload keystore credentials in secret managers before launch.
3. **Facility Directory Verification:** Confirm all `PENDING_VERIFICATION` Ranchi directory records directly with each facility before `SUPER_ADMIN` sets `VERIFIED`.
4. **React + Vite Web Repository:** Perform equivalent security/build verification on the separate staff/admin web codebase before releasing web traffic.
