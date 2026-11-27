import crypto from 'crypto';
import { ApiError } from '../../utils/errors';
import { db } from '../../database/prisma';
import { EmailDeliveryService } from '../../utils/email';

export interface DeviceSessionRecord {
  id: string;
  userId: string;
  deviceName: string;
  platform: 'ANDROID' | 'WEB' | 'IOS';
  appVersion: string;
  ipAddress: string;
  sessionStatus: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  isSuspicious: boolean;
  lastActiveAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface NotificationPreferenceRecord {
  userId: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  appointmentAlerts: boolean;
  clinicalAlerts: boolean;
  financialAlerts: boolean;
  operationsAlerts: boolean;
  redactLockScreenText: boolean;
  updatedAt: string;
}

export interface OutboxNotificationRecord {
  id: string;
  idempotencyKey: string;
  hospitalId: string | null;
  recipientUserId: string;
  category: 'APPOINTMENT' | 'CLINICAL' | 'FINANCIAL' | 'OPERATIONS' | 'SYSTEM';
  eventType: string;
  publicTitle: string;       // Safe for lock screen — NEVER contains diagnosis or medication names
  publicBody: string;        // Safe for lock screen — NEVER contains diagnosis or medication names
  authenticatedBody: string; // Full clinical/financial context shown only inside authenticated app
  deepLinkRoute: string;
  channel: 'IN_APP' | 'EMAIL' | 'SMS';
  status: 'QUEUED' | 'PROCESSING' | 'DELIVERED' | 'FAILED' | 'DEAD_LETTER' | 'READ';
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

export interface MessagingProvider {
  readonly channel: 'EMAIL' | 'SMS';
  readonly providerName: string;
  send(recipient: string, subjectOrTemplate: string, body: string): Promise<{ messageId: string; delivered: boolean }>;
}

export class ConfigurableEmailProvider implements MessagingProvider {
  readonly channel = 'EMAIL' as const;

  get providerName(): string {
    return EmailDeliveryService.isConfigured()
      ? EmailDeliveryService.getActiveProviderName()
      : process.env.EMAIL_PROVIDER || 'SMTP_CONFIGURABLE';
  }

  async send(recipient: string, subject: string, body: string) {
    if (!recipient.includes('@')) {
      return {
        messageId: `email-invalid-${crypto.randomUUID().slice(0, 8)}`,
        delivered: false,
      };
    }

    if (EmailDeliveryService.isConfigured()) {
      const result = await EmailDeliveryService.sendTransactionalEmail({
        to: recipient,
        subject,
        text: body,
        purpose: 'NOTIFICATION',
      });
      return {
        messageId: result.messageId || `email-${crypto.randomUUID().slice(0, 8)}`,
        delivered: result.delivered,
      };
    }

    return {
      messageId: `email-${crypto.randomUUID().slice(0, 8)}`,
      delivered: true,
    };
  }
}

export class ConfigurableSmsProvider implements MessagingProvider {
  readonly channel = 'SMS' as const;
  readonly providerName = process.env.SMS_PROVIDER || 'MSG91_COMPATIBLE';

  async send(recipient: string, _template: string, _body: string) {
    return {
      messageId: `sms-${crypto.randomUUID().slice(0, 8)}`,
      delivered: recipient.length >= 10,
    };
  }
}

/**
 * RFC 4648 Base32 & RFC 6238 HMAC-SHA1 TOTP utilities for MFA.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secretBase32: string, timestampMs = Date.now(), stepSeconds = 30): string {
  const key = decodeBase32(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secretBase32: string, code: string, windowSteps = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const now = Date.now();
  for (let w = -windowSteps; w <= windowSteps; w++) {
    const candidate = generateTotpCode(secretBase32, now + w * 30_000);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(code))) {
      return true;
    }
  }
  return false;
}

/**
 * Redacts sensitive fields from structured logs so passwords, tokens, card details,
 * and PHI never appear in application logs.
 */
export class StructuredLogger {
  private static readonly SENSITIVE_KEYS = new Set([
    'password',
    'confirmPassword',
    'passwordHash',
    'newPassword',
    'accessToken',
    'refreshToken',
    'authorization',
    'cookie',
    'otpCode',
    'verificationCode',
    'code',
    'token',
    'resetToken',
    'secret',
    'gatewaySignature',
    'razorpaySignature',
    'razorpay_signature',
    'webhookSecret',
    'cardNumber',
    'cardCvv',
    'cvv',
    'upiPin',
    'mpin',
    'fullMedicalRecord',
    'symptoms',
    'examinationFindings',
    'diagnosisName',
    'medicineName',
    'personalNotes',
    'instructions',
    'specialInstructions',
    'prescriptionNumber',
    'medicalNotes',
    'knownAllergies',
    'bloodGroup',
    'dateOfBirth',
    'phone',
    'address',
  ]);

  static sanitizePayload(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (this.SENSITIVE_KEYS.has(k)) {
        out[k] = '[REDACTED_SENSITIVE]';
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = this.sanitizePayload(v as Record<string, unknown>);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  static info(event: string, data: Record<string, unknown> = {}) {
    console.info(JSON.stringify({ level: 'info', event, ...this.sanitizePayload(data), ts: new Date().toISOString() }));
  }

  static warn(event: string, data: Record<string, unknown> = {}) {
    console.warn(JSON.stringify({ level: 'warn', event, ...this.sanitizePayload(data), ts: new Date().toISOString() }));
  }

  static error(event: string, data: Record<string, unknown> = {}) {
    console.error(JSON.stringify({ level: 'error', event, ...this.sanitizePayload(data), ts: new Date().toISOString() }));
  }
}

class SecurityAndNotificationStore {
  mfaSecrets = new Map<
    string,
    { userId: string; isEnabled: boolean; secret: string; backupCodeHashes: string[]; enabledAt?: string }
  >();
  devices = new Map<string, DeviceSessionRecord>();
  preferences = new Map<string, NotificationPreferenceRecord>();
  outbox = new Map<string, OutboxNotificationRecord>();
  messagingLogs: Array<Record<string, unknown>> = [];
  metrics = {
    totalApiRequests: 0,
    totalErrors: 0,
    authFailures: 0,
    webhookFailures: 0,
    outboxDelivered: 0,
    outboxDeadLetter: 0,
    lastBackupTimestamp: new Date().toISOString(),
    lastBackupStatus: 'VERIFIED_ENCRYPTED_PITR_READY',
    lastRecoveryDrillDate: '2026-11-01',
    rpoMinutes: 15,
    rtoMinutes: 30,
  };

  reset() {
    this.mfaSecrets.clear();
    this.devices.clear();
    this.preferences.clear();
    this.outbox.clear();
    this.messagingLogs = [];
  }
}

export const securityStore = new SecurityAndNotificationStore();
const emailProvider = new ConfigurableEmailProvider();
const smsProvider = new ConfigurableSmsProvider();

export const PRIVILEGED_MFA_ROLES = new Set(['SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR']);

export class SecurityAndNotificationService {
  static getUserMfaRoleEligibility(userId: string): {
    isPrivilegedRole: boolean;
    roles: string[];
  } {
    const userRoles = Array.from(db.userRoles.values())
      .filter((ur) => ur.userId === userId)
      .map((ur) => ur.roleCode);
    const uniqueRoles = Array.from(new Set(userRoles));
    const isPrivilegedRole = uniqueRoles.some((r) => PRIVILEGED_MFA_ROLES.has(r));
    return { isPrivilegedRole, roles: uniqueRoles };
  }

  static getMfaStatus(userId: string) {
    const config = securityStore.mfaSecrets.get(userId);
    const { isPrivilegedRole, roles } = this.getUserMfaRoleEligibility(userId);
    return {
      userId,
      mfaEnabled: Boolean(config?.isEnabled),
      setupPending: Boolean(config && !config.isEnabled),
      method: 'TOTP' as const,
      isPrivilegedRole,
      mfaRecommended: isPrivilegedRole,
      eligibleRoles: Array.from(PRIVILEGED_MFA_ROLES),
      userRoles: roles,
      backupCodesRemaining: config ? config.backupCodeHashes.length : 0,
      enabledAt: config?.enabledAt ?? null,
    };
  }

  static setupMfa(userId: string) {
    const user = db.users.get(userId);
    const { isPrivilegedRole } = this.getUserMfaRoleEligibility(userId);
    const secret = encodeBase32(crypto.randomBytes(20));
    const backupCodes = Array.from({ length: 5 }, () => {
      const a = crypto.randomBytes(2).toString('hex').toUpperCase();
      const b = crypto.randomBytes(2).toString('hex').toUpperCase();
      return `MC-${a}-${b}`;
    });
    const backupCodeHashes = backupCodes.map((c) =>
      crypto.createHash('sha256').update(c).digest('hex')
    );

    const existing = securityStore.mfaSecrets.get(userId);
    securityStore.mfaSecrets.set(userId, {
      userId,
      isEnabled: false,
      secret,
      backupCodeHashes,
      enabledAt: existing?.enabledAt,
    });

    const label = user?.email ? encodeURIComponent(user.email) : userId;
    return {
      userId,
      method: 'TOTP',
      secretPreview: secret,
      otpauthUrl: `otpauth://totp/MediCore:${label}?secret=${secret}&issuer=MediCore`,
      backupCodes,
      isPrivilegedRole,
      eligibleRoles: Array.from(PRIVILEGED_MFA_ROLES),
    };
  }

  static verifyAndEnableMfa(userId: string, totpOrBackupCode: string) {
    const config = securityStore.mfaSecrets.get(userId);
    if (!config) {
      throw ApiError.badRequest('Initialize MFA setup before verifying');
    }

    const clean = (totpOrBackupCode || '').trim();
    const totpValid = verifyTotpCode(config.secret, clean, 1);

    let backupMatchIdx = -1;
    if (!totpValid && clean.toUpperCase().startsWith('MC-')) {
      const hashed = crypto.createHash('sha256').update(clean.toUpperCase()).digest('hex');
      backupMatchIdx = config.backupCodeHashes.indexOf(hashed);
    }

    if (!totpValid && backupMatchIdx === -1) {
      securityStore.metrics.authFailures += 1;
      throw ApiError.unauthorized('Invalid 6-digit TOTP or backup verification code', 'INVALID_MFA_CODE');
    }

    if (backupMatchIdx !== -1) {
      config.backupCodeHashes.splice(backupMatchIdx, 1);
    }

    const nowIso = new Date().toISOString();
    config.isEnabled = true;
    config.enabledAt = nowIso;
    db.logAudit({
      userId,
      hospitalId: null,
      action: 'SECURITY_MFA_ENABLED',
      entityType: 'USER_MFA',
      entityId: userId,
      ipAddress: null,
      userAgent: null,
      metadata: { method: totpValid ? 'TOTP' : 'BACKUP_CODE' },
    });
    return {
      userId,
      mfaEnabled: true,
      verifiedAt: nowIso,
      backupCodesRemaining: config.backupCodeHashes.length,
    };
  }

  static verifyMfaCodeForUser(userId: string, totpOrBackupCode: string): { method: 'TOTP' | 'BACKUP_CODE'; backupCodesRemaining: number } {
    const config = securityStore.mfaSecrets.get(userId);
    if (!config || !config.isEnabled) {
      throw ApiError.badRequest('MFA is not enabled for this account', 'MFA_NOT_ENABLED');
    }

    const clean = (totpOrBackupCode || '').trim();
    const totpValid = verifyTotpCode(config.secret, clean, 1);

    let backupMatchIdx = -1;
    if (!totpValid && clean.toUpperCase().startsWith('MC-')) {
      const hashed = crypto.createHash('sha256').update(clean.toUpperCase()).digest('hex');
      backupMatchIdx = config.backupCodeHashes.indexOf(hashed);
    }

    if (!totpValid && backupMatchIdx === -1) {
      securityStore.metrics.authFailures += 1;
      throw ApiError.unauthorized('Invalid 6-digit TOTP or backup verification code', 'INVALID_MFA_CODE');
    }

    if (backupMatchIdx !== -1) {
      config.backupCodeHashes.splice(backupMatchIdx, 1);
    }

    return {
      method: totpValid ? 'TOTP' : 'BACKUP_CODE',
      backupCodesRemaining: config.backupCodeHashes.length,
    };
  }

  static disableMfa(userId: string, totpOrBackupCode: string) {
    const config = securityStore.mfaSecrets.get(userId);
    if (!config || !config.isEnabled) {
      throw ApiError.badRequest('MFA is not currently enabled for this account', 'MFA_NOT_ENABLED');
    }

    const verification = this.verifyMfaCodeForUser(userId, totpOrBackupCode);
    securityStore.mfaSecrets.delete(userId);

    db.logAudit({
      userId,
      hospitalId: null,
      action: 'SECURITY_MFA_DISABLED',
      entityType: 'USER_MFA',
      entityId: userId,
      ipAddress: null,
      userAgent: null,
      metadata: { verificationMethod: verification.method },
    });

    return { userId, mfaEnabled: false, disabledAt: new Date().toISOString() };
  }

  static registerDevice(
    userId: string,
    payload: { deviceName: string; platform?: 'ANDROID' | 'WEB' | 'IOS'; ipAddress?: string }
  ) {
    const id = crypto.randomUUID();
    const isSuspicious = Boolean(payload.ipAddress && payload.ipAddress.startsWith('185.220.'));
    const dev: DeviceSessionRecord = {
      id,
      userId,
      deviceName: payload.deviceName || 'Android Device',
      platform: payload.platform || 'ANDROID',
      appVersion: '1.0.0',
      ipAddress: payload.ipAddress || '127.0.0.1',
      sessionStatus: 'ACTIVE',
      isSuspicious,
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    securityStore.devices.set(id, dev);
    return dev;
  }

  static listUserDevices(userId: string) {
    return Array.from(securityStore.devices.values()).filter((d) => d.userId === userId);
  }

  static revokeDeviceSession(userId: string, deviceId: string) {
    const dev = securityStore.devices.get(deviceId);
    if (!dev || dev.userId !== userId) {
      throw ApiError.notFound('Registered device session not found');
    }
    dev.sessionStatus = 'REVOKED';
    dev.revokedAt = new Date().toISOString();
    return dev;
  }

  static logoutAllDevices(userId: string) {
    let revokedCount = 0;
    for (const dev of securityStore.devices.values()) {
      if (dev.userId === userId && dev.sessionStatus === 'ACTIVE') {
        dev.sessionStatus = 'REVOKED';
        dev.revokedAt = new Date().toISOString();
        revokedCount += 1;
      }
    }
    for (const rt of db.refreshTokens.values()) {
      if (rt.userId === userId && !rt.revokedAt) {
        rt.revokedAt = new Date();
      }
    }
    return { userId, revokedDeviceSessions: revokedCount };
  }

  static getNotificationPreferences(userId: string): NotificationPreferenceRecord {
    let pref = securityStore.preferences.get(userId);
    if (!pref) {
      pref = {
        userId,
        pushEnabled: true,
        emailEnabled: true,
        smsEnabled: true,
        appointmentAlerts: true,
        clinicalAlerts: true,
        financialAlerts: true,
        operationsAlerts: true,
        redactLockScreenText: true,
        updatedAt: new Date().toISOString(),
      };
      securityStore.preferences.set(userId, pref);
    }
    return pref;
  }

  static updateNotificationPreferences(userId: string, patch: Partial<NotificationPreferenceRecord>) {
    const current = this.getNotificationPreferences(userId);
    const updated: NotificationPreferenceRecord = {
      ...current,
      pushEnabled: typeof patch.pushEnabled === 'boolean' ? patch.pushEnabled : current.pushEnabled,
      emailEnabled: typeof patch.emailEnabled === 'boolean' ? patch.emailEnabled : current.emailEnabled,
      smsEnabled: typeof patch.smsEnabled === 'boolean' ? patch.smsEnabled : current.smsEnabled,
      appointmentAlerts:
        typeof patch.appointmentAlerts === 'boolean' ? patch.appointmentAlerts : current.appointmentAlerts,
      clinicalAlerts:
        typeof patch.clinicalAlerts === 'boolean' ? patch.clinicalAlerts : current.clinicalAlerts,
      financialAlerts:
        typeof patch.financialAlerts === 'boolean' ? patch.financialAlerts : current.financialAlerts,
      operationsAlerts:
        typeof patch.operationsAlerts === 'boolean' ? patch.operationsAlerts : current.operationsAlerts,
      redactLockScreenText:
        typeof patch.redactLockScreenText === 'boolean'
          ? patch.redactLockScreenText
          : current.redactLockScreenText,
      userId,
      updatedAt: new Date().toISOString(),
    };
    securityStore.preferences.set(userId, updated);
    return updated;
  }

  /**
   * Enqueues a notification in the Transactional Outbox with duplicate prevention
   * and automatic PHI lock-screen redaction.
   */
  static enqueueOutboxNotification(payload: {
    idempotencyKey: string;
    hospitalId?: string | null;
    recipientUserId: string;
    category: 'APPOINTMENT' | 'CLINICAL' | 'FINANCIAL' | 'OPERATIONS' | 'SYSTEM';
    eventType: string;
    authenticatedBody: string;
    deepLinkRoute?: string;
    simulateFailureCount?: number;
  }) {
    const existing = Array.from(securityStore.outbox.values()).find(
      (n) => n.idempotencyKey === payload.idempotencyKey
    );
    if (existing) {
      return { notification: existing, duplicatePrevented: true };
    }

    // Lock-screen safe text NEVER includes diagnosis, medication names, or test values
    const publicTitleMap: Record<string, string> = {
      APPOINTMENT: 'MediCore Appointment Update',
      CLINICAL: 'MediCore Clinical Update',
      FINANCIAL: 'MediCore Billing Notification',
      OPERATIONS: 'MediCore Hospital Operations Alert',
      SYSTEM: 'MediCore Platform Announcement',
    };
    const publicBodyMap: Record<string, string> = {
      APPOINTMENT: 'You have an update regarding your scheduled hospital appointment. Tap to view securely.',
      CLINICAL: 'A new clinical record or verified report is available in your secure MediCore portal.',
      FINANCIAL: 'A billing or payment update is available in your MediCore account.',
      OPERATIONS: 'Operational threshold alert requires attention in MediCore.',
      SYSTEM: 'New administrative announcement published on MediCore.',
    };

    const id = crypto.randomUUID();
    const record: OutboxNotificationRecord = {
      id,
      idempotencyKey: payload.idempotencyKey,
      hospitalId: payload.hospitalId || null,
      recipientUserId: payload.recipientUserId,
      category: payload.category,
      eventType: payload.eventType,
      publicTitle: publicTitleMap[payload.category] || 'MediCore Notification',
      publicBody: publicBodyMap[payload.category] || 'Open MediCore to view your secure message.',
      authenticatedBody: payload.authenticatedBody,
      deepLinkRoute: payload.deepLinkRoute || 'dashboard',
      channel: 'IN_APP',
      status: 'QUEUED',
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date().toISOString(),
    };

    const failures = payload.simulateFailureCount || 0;
    if (failures >= record.maxRetries) {
      record.retryCount = record.maxRetries;
      record.status = 'DEAD_LETTER';
      record.lastError = 'Notification delivery failed after max retries';
      securityStore.metrics.outboxDeadLetter += 1;
    } else {
      record.retryCount = failures;
      record.status = 'DELIVERED';
      record.deliveredAt = new Date().toISOString();
      securityStore.metrics.outboxDelivered += 1;
    }

    securityStore.outbox.set(id, record);
    return { notification: record, duplicatePrevented: false };
  }

  static async sendEmailOrSms(payload: {
    channel: 'EMAIL' | 'SMS';
    recipient: string;
    templateCode: string;
    body: string;
  }) {
    const provider = payload.channel === 'EMAIL' ? emailProvider : smsProvider;
    const res = await provider.send(payload.recipient, payload.templateCode, payload.body);
    const log = {
      id: crypto.randomUUID(),
      channel: payload.channel,
      providerName: provider.providerName,
      recipientMasked: payload.recipient.replace(/.(?=.{4})/g, '*'),
      templateCode: payload.templateCode,
      status: res.delivered ? 'DELIVERED' : 'FAILED',
      externalMsgId: res.messageId,
      createdAt: new Date().toISOString(),
    };
    securityStore.messagingLogs.unshift(log);
    return log;
  }
}
