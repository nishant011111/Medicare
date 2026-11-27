# MediCore Database & Clinical Document Backup & Recovery Strategy (Phase 15)

## 1. Recovery Objectives
- **Recovery Point Objective (RPO):** <= 15 minutes via PostgreSQL continuous WAL archiving / Neon Point-in-Time Recovery (PITR).
- **Recovery Time Objective (RTO):** <= 30 minutes verified via periodic non-production recovery drills.

## 2. PostgreSQL Database Backups (Neon / Managed PostgreSQL)
1. **Point-in-Time Recovery & Branching:** Enable continuous WAL history in Neon for instant point-in-time branch restores prior to any schema migration (`prisma migrate deploy`).
2. **Automated Daily Logical Snapshots:** Daily encrypted `pg_dump -Fc` exports stored in versioned, KMS-encrypted private object storage:
   - Daily retention: 30 days
   - Weekly retention: 12 months
   - Compliance retention: aligned with applicable statutory healthcare rules
3. **Zero Destructive Migration Policy:** Production and staging databases must never execute `prisma migrate reset`, `prisma db push --force-reset`, or unreviewed table drops.

## 3. Private Document & Receipt Storage
- Clinical documents (`clinical_documents`), KYC verification uploads, and generated billing receipts remain strictly in private object storage (with bucket versioning and TLS-only access). No PHI documents are stored on public URLs or Android external shared storage.

## 4. Non-Production Restoration Drill Procedure
1. Create an isolated Neon restore branch or staging PostgreSQL database.
2. Restore the latest encrypted dump (or PITR branch timestamp):
   ```bash
   pg_restore --clean --no-owner -d "$STAGING_DATABASE_URL" latest_encrypted_backup.dump
   ```
3. Verify schema & API integrity:
   ```bash
   cd backend
   npx prisma migrate status
   npm test
   ```
4. Verify `/health/ready` returns `200 OK` with `"database": "connected"` and record the drill outcome in audit logs.
