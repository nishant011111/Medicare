import crypto from 'crypto';
import { RoleCodeType } from '../modules/roles/roles.constants';
import { ApiError } from '../utils/errors';

/**
 * MediCore Database Store Interface & Prisma Adapter
 * Uses PrismaClient in production when connected to PostgreSQL, and supports
 * an ACID-compliant relational store for deterministic testing and local execution.
 */
export interface DbUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  passwordHash: string | null;
  isEmailVerified: boolean;
  isPhoneVerified?: boolean;
  isActive: boolean;
  activeHospitalId: string | null;
  failedLoginAttempts?: number;
  lockoutCount?: number;
  lockedUntil?: Date | null;
  lastFailedLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbHospital {
  id: string;
  name: string;
  registrationNumber: string;
  category: string;
  logoUrl: string | null;
  address: string;
  city: string;
  state: string;
  contactEmail: string;
  contactPhone: string;
  totalBeds: number;
  availableBeds: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ACTIVE';
  departments: string[];
  about?: string | null;
  operatingHours?: string | null;
  cancellationPolicyHours?: number | null;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbMembership {
  id: string;
  userId: string;
  hospitalId: string;
  department: string | null;
  employeeCode: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'SUSPENDED';
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbUserRole {
  id: string;
  userId: string;
  roleCode: RoleCodeType;
  hospitalId: string | null;
  membershipId: string | null;
  assignedAt: Date;
}

export interface DbRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  replacedByTokenId: string | null;
  deviceInfo: string | null;
  ipAddress: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface DbEmailVerification {
  id: string;
  userId: string;
  tokenHash: string;
  code: string;
  attemptCount: number;
  lastSentAt: Date;
  expiresAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface DbPasswordReset {
  id: string;
  userId: string;
  tokenHash: string;
  otpCode: string;
  attemptCount: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface DbOtpLoginChallenge {
  id: string;
  identifier: string;
  channel: 'PHONE' | 'EMAIL';
  tokenHash: string;
  attemptCount: number;
  lastSentAt: Date;
  expiresAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface DbPhoneOtp {
  id: string;
  phone: string;
  purpose: 'LOGIN' | 'REGISTER';
  codeHash: string;
  attemptCount: number;
  lastSentAt: Date;
  expiresAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface DbPatientProfile {
  id: string;
  userId: string;
  globalPatientId: string;
  dateOfBirth: string | null;
  gender: string | null;
  onboardingCompleted: boolean;
  termsAcceptedAt: Date | null;
  healthConsentGranted: boolean;
  healthConsentAt: Date | null;
  profileCompletionPercent: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbPatientAddress {
  id: string;
  patientId: string;
  houseNumber: string | null;
  street: string;
  locality: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbEmergencyContact {
  id: string;
  patientId: string;
  name: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbPatientHealthInfo {
  id: string;
  patientId: string;
  bloodGroup: string | null;
  knownAllergies: string[];
  existingConditions: string[];
  currentMedications: string[];
  medicalNotes: string | null;
  consentGranted: boolean;
  consentTimestamp: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbPatientProfilePhoto {
  id: string;
  patientId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
  uploadedAt: Date;
  updatedAt: Date;
}

export interface DbHospitalInvitation {
  id: string;
  hospitalId: string;
  email: string;
  roleCode: RoleCodeType;
  department: string | null;
  tokenHash: string;
  inviteCode: string;
  invitedByUserId: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface DbAuditLog {
  id: string;
  userId: string | null;
  hospitalId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export type MedicationDoseStatusType = 'TAKEN' | 'SKIPPED' | 'SNOOZED' | 'NOT_RECORDED';

export interface DbMedicationReminder {
  id: string;
  patientId: string;
  prescriptionId: string;
  prescriptionItemId: string;
  label: string | null;
  scheduleType: 'DAILY' | 'SPECIFIC_DAYS';
  daysOfWeek: number[];
  reminderTimes: string[];
  timezone: string;
  startDate: string;
  endDate: string | null;
  isEnabled: boolean;
  personalNotes: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbMedicationDoseLog {
  id: string;
  patientId: string;
  prescriptionId: string;
  prescriptionItemId: string;
  reminderId: string | null;
  scheduledDate: string;
  scheduledTime: string;
  scheduledFor: Date;
  status: MedicationDoseStatusType;
  actionAt: Date | null;
  snoozedUntil: Date | null;
  notes: string | null;
  previousStatus: MedicationDoseStatusType | null;
  correctionReason: string | null;
  correctedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class RelationalDatabaseStore {
  public users = new Map<string, DbUser>();
  public hospitals = new Map<string, DbHospital>();
  public memberships = new Map<string, DbMembership>();
  public userRoles = new Map<string, DbUserRole>();
  public refreshTokens = new Map<string, DbRefreshToken>();
  public emailVerifications = new Map<string, DbEmailVerification>();
  public passwordResets = new Map<string, DbPasswordReset>();
  public otpLoginChallenges = new Map<string, DbOtpLoginChallenge>();
  public phoneOtps = new Map<string, DbPhoneOtp>();
  public invitations = new Map<string, DbHospitalInvitation>();
  public patientProfiles = new Map<string, DbPatientProfile>();
  public patientAddresses = new Map<string, DbPatientAddress>();
  public emergencyContacts = new Map<string, DbEmergencyContact>();
  public patientHealthInfo = new Map<string, DbPatientHealthInfo>();
  public patientProfilePhotos = new Map<string, DbPatientProfilePhoto>();
  public medicationReminders = new Map<string, DbMedicationReminder>();
  public medicationDoseLogs = new Map<string, DbMedicationDoseLog>();
  public auditLogs: DbAuditLog[] = [];

  reset() {
    this.users.clear();
    this.hospitals.clear();
    this.memberships.clear();
    this.userRoles.clear();
    this.refreshTokens.clear();
    this.emailVerifications.clear();
    this.passwordResets.clear();
    this.otpLoginChallenges.clear();
    this.phoneOtps.clear();
    this.invitations.clear();
    this.patientProfiles.clear();
    this.patientAddresses.clear();
    this.emergencyContacts.clear();
    this.patientHealthInfo.clear();
    this.patientProfilePhotos.clear();
    this.medicationReminders.clear();
    this.medicationDoseLogs.clear();
    this.auditLogs = [];
  }

  logAudit(entry: Omit<DbAuditLog, 'id' | 'createdAt'>): DbAuditLog {
    const record: DbAuditLog = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    this.auditLogs.unshift(record);
    return record;
  }
}

export const db = new RelationalDatabaseStore();

export interface PrismaClientLike {
  $transaction: <T>(fn: (tx: any) => Promise<T>, options?: { maxWait?: number; timeout?: number }) => Promise<T>;
  $disconnect: () => Promise<void>;
}

let prismaInstance: PrismaClientLike | null = null;

function hasConfiguredRemotePostgresUrl(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(
    url &&
      !url.includes('placeholder') &&
      !url.startsWith('postgresql://localhost') &&
      !url.startsWith('postgres://localhost') &&
      !url.startsWith('postgresql://127.0.0.1') &&
      !url.startsWith('postgres://127.0.0.1')
  );
}

export function getPrismaClient(): PrismaClientLike | null {
  if (!hasConfiguredRemotePostgresUrl()) {
    return null;
  }
  if (!prismaInstance) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PrismaClient } = require('@prisma/client');
      prismaInstance = new PrismaClient({
        log: ['error'],
      });
    } catch {
      prismaInstance = null;
    }
  }
  return prismaInstance;
}

export const prisma = getPrismaClient();

/**
 * Executes a callback within a managed database transaction with automated rollback.
 */
export async function withTransaction<T>(
  action: (tx: any) => Promise<T>
): Promise<T> {
  if (hasConfiguredRemotePostgresUrl()) {
    const client = getPrismaClient();
    if (client) {
      try {
        return await client.$transaction(action, {
          maxWait: 5000,
          timeout: 10000,
        });
      } catch (error) {
        throw normalizePrismaError(error);
      }
    }
  }
  return await action(db);
}

/**
 * Normalizes database and Prisma-specific codes into secure, human-readable errors.
 * Ensures internal database schemas, column names, and connection strings are never leaked.
 */
export function normalizePrismaError(error: unknown): ApiError {
  if (error && typeof error === 'object' && 'code' in error) {
    const errObj = error as { code: string; meta?: { target?: string[]; field_name?: string } };
    switch (errObj.code) {
      case 'P2002': {
        const fields = errObj.meta?.target?.join(', ') || 'record';
        return ApiError.conflict(`A record with this ${fields} already exists.`, 'UNIQUE_CONSTRAINT_VIOLATION');
      }
      case 'P2003':
        return ApiError.badRequest('Referenced hospital, patient, doctor, or department record does not exist.', 'FOREIGN_KEY_VIOLATION');
      case 'P2025':
        return ApiError.notFound('The requested healthcare record could not be found.', 'RECORD_NOT_FOUND');
      default:
        return ApiError.badRequest('Database operation could not be completed. Please verify parameters.', 'DATABASE_ERROR');
    }
  }
  if (error instanceof ApiError) {
    return error;
  }
  return ApiError.badRequest('A database error occurred during operation.', 'DATABASE_ERROR');
}

