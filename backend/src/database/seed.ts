import crypto from 'crypto';
import { db } from './prisma';
import { hashPassword } from '../utils/crypto';
import { HospitalDirectoryImportService, directoryStore } from '../modules/directory/directory.service';
import { clinicalStore } from '../modules/clinical/clinical.service';
import { opsStore } from '../modules/operations/operations.service';
import { securityStore } from '../modules/security/security.service';
import { saasStore } from '../modules/saas/saas.service';
import { aiStore } from '../modules/ai/ai.service';

const FICTIONAL_DEMO_HOSPITAL_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];

const FICTIONAL_DEMO_USER_IDS = [
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '55555555-5555-4555-8555-555555555555',
];

/**
 * Controlled database cleanup that removes fictional demo/placeholder records while preserving
 * real user-created records, system configuration, and imported Ranchi Hospital Directory records.
 */
export function purgeFictionalDemoRecords() {
  let removedHospitals = 0;
  for (const id of FICTIONAL_DEMO_HOSPITAL_IDS) {
    if (db.hospitals.delete(id)) removedHospitals += 1;
  }

  let removedUsers = 0;
  for (const uid of FICTIONAL_DEMO_USER_IDS) {
    if (db.users.delete(uid)) removedUsers += 1;
  }

  for (const [mId, m] of db.memberships.entries()) {
    if (FICTIONAL_DEMO_HOSPITAL_IDS.includes(m.hospitalId) || FICTIONAL_DEMO_USER_IDS.includes(m.userId)) {
      db.memberships.delete(mId);
    }
  }

  for (const [rId, ur] of db.userRoles.entries()) {
    if (
      (ur.hospitalId && FICTIONAL_DEMO_HOSPITAL_IDS.includes(ur.hospitalId)) ||
      FICTIONAL_DEMO_USER_IDS.includes(ur.userId)
    ) {
      db.userRoles.delete(rId);
    }
  }

  db.logAudit({
    userId: null,
    hospitalId: null,
    action: 'CONTROLLED_DEMO_DATA_CLEANUP',
    entityType: 'SystemDatabase',
    entityId: 'demo-cleanup-v1',
    ipAddress: null,
    userAgent: null,
    metadata: {
      removedFictionalHospitals: removedHospitals,
      removedPlaceholderUsers: removedUsers,
      preservedRealUserRecords: true,
    },
  });
}

const OFFICIAL_RANCHI_DIRECTORY_COUNT = 29;
const OFFICIAL_RNC001_NAME = 'RIMS – Rajendra Institute of Medical Sciences';

export async function seedDatabaseIfEmpty(): Promise<boolean> {
  const rnc001 = Array.from(directoryStore.records.values()).find(
    (r) => r.directoryCode === 'RNC001'
  );
  const hasLatestDirectory =
    directoryStore.records.size >= OFFICIAL_RANCHI_DIRECTORY_COUNT &&
    rnc001?.displayName === OFFICIAL_RNC001_NAME;

  if (hasLatestDirectory && db.users.size > 0) return false;

  const now = new Date();
  const hasRealPersistedData =
    db.users.size > 0 ||
    db.patientProfiles.size > 0 ||
    clinicalStore.patients.size > 0 ||
    clinicalStore.appointments.size > 0;

  purgeFictionalDemoRecords();

  // Only reset operational stores on a fresh empty boot so persisted Web & Android records are never wiped
  if (!hasRealPersistedData) {
    clinicalStore.reset();
    opsStore.reset();
    securityStore.reset();
    saasStore.resetPlansOnly();
    aiStore.conversations.clear();
    aiStore.clinicalDrafts.clear();
    aiStore.usageLogs = [];
  }

  // Bootstrap platform SUPER_ADMIN system account for platform administration & directory verification
  const superAdminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if (!db.users.has(superAdminId)) {
    const defaultPassHash = await hashPassword('MediCore@2026');
    db.users.set(superAdminId, {
      id: superAdminId,
      fullName: 'MediCore Platform Administrator',
      email: 'superadmin@medicore.org',
      phone: '+919000000001',
      passwordHash: defaultPassHash,
      isEmailVerified: true,
      isPhoneVerified: true,
      isActive: true,
      activeHospitalId: null,
      createdAt: now,
      updatedAt: now,
    });

    db.userRoles.set(crypto.randomUUID(), {
      id: crypto.randomUUID(),
      userId: superAdminId,
      roleCode: 'SUPER_ADMIN',
      hospitalId: null,
      membershipId: null,
      assignedAt: now,
    });
  }

  // Replace stale/outdated unverified directory drafts with the official 29-record Ranchi Hospital Contact Directory
  if (!hasLatestDirectory) {
    for (const [recId, rec] of Array.from(directoryStore.records.entries())) {
      if (!rec.isActiveTenant && rec.verificationStatus !== 'VERIFIED') {
        directoryStore.records.delete(recId);
        const hosp = db.hospitals.get(recId);
        if (hosp && hosp.status === 'PENDING' && !hosp.createdByUserId) {
          db.hospitals.delete(recId);
        }
      }
    }
    HospitalDirectoryImportService.importBundledRanchiDataset('JSON', superAdminId);
  }

  return true;
}
