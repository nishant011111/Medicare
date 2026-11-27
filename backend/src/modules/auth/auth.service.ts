import crypto from 'crypto';
import { db, DbUser, withTransaction } from '../../database/prisma';
import {
  generateRandomCode,
  hashPassword,
  sha256Hash,
  signAccessToken,
  signMfaChallengeToken,
  signRefreshToken,
  verifyMfaChallengeToken,
  verifyPassword,
  verifyRefreshToken,
} from '../../utils/crypto';
import { ApiError } from '../../utils/errors';
import { env } from '../../config/env';
import { EmailDeliveryService } from '../../utils/email';
import { SmsOtpDeliveryService } from '../../utils/sms';
import { maskPhoneNumber, normalizePhoneNumber, requireValidPhoneNumber } from '../../utils/phone';
import {
  AccountAttemptRecord,
  createDefaultLoginAttemptStore,
  LoginAttemptStore,
} from '../../utils/loginAttemptStore';
import { verifyFirebaseGoogleIdToken } from '../../utils/firebaseToken';
import { RoleCodeType, RolesService } from '../roles/roles.service';
import {
  PRIVILEGED_MFA_ROLES,
  SecurityAndNotificationService,
  securityStore,
} from '../security/security.service';

const BOOTSTRAP_SUPER_ADMIN_EMAILS = new Set(['nishant00511@gmail.com']);

const STAFF_GOOGLE_SIGNUP_ROLES = new Set<RoleCodeType>([
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'ACCOUNTANT',
  'HOSPITAL_ADMIN',
]);

export class AuthService {
  public static readonly MAX_CONSECUTIVE_FAILED_ATTEMPTS = 5;
  public static readonly BASE_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  public static readonly MAX_LOCKOUT_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours max progressive cap
  public static readonly MAX_IP_FAILED_ATTEMPTS_PER_WINDOW = 25;
  public static readonly IP_WINDOW_MS = 15 * 60 * 1000;
  public static readonly OTP_TTL_SECONDS = 10 * 60;
  public static readonly OTP_RESEND_COOLDOWN_SECONDS = 30;

  private static loginAttemptStore: LoginAttemptStore = createDefaultLoginAttemptStore();

  // Per-account mutex chain to serialize concurrent login requests atomically
  private static accountLoginMutex = new Map<string, Promise<unknown>>();

  public static setLoginAttemptStore(store: LoginAttemptStore) {
    this.loginAttemptStore = store;
  }

  public static getLoginAttemptStoreName(): string {
    return this.loginAttemptStore.storeName;
  }

  private static assertNoPrivilegedRoleAttempt(input: {
    role?: string;
    roles?: string[];
    globalRoles?: string[];
  }) {
    const requested: string[] = [];
    if (input.role) requested.push(input.role);
    if (Array.isArray(input.roles)) requested.push(...input.roles);
    if (Array.isArray(input.globalRoles)) requested.push(...input.globalRoles);

    const hasPrivileged = requested.some((r) => r.trim().toUpperCase() !== 'PATIENT');
    if (hasPrivileged) {
      throw ApiError.forbidden(
        'Self-service registration cannot assign privileged roles. Only PATIENT accounts are allowed.',
        'PRIVILEGED_ROLE_NOT_ALLOWED'
      );
    }
  }

  private static normalizePhone(phone?: string): string | null {
    if (!phone) return null;
    const e164 = normalizePhoneNumber(phone);
    if (e164) return e164;
    const cleaned = phone.trim().replace(/[\s()-]/g, '');
    return cleaned || null;
  }

  private static findUserByIdentifier(emailOrPhone: string): DbUser | undefined {
    const raw = emailOrPhone.trim();
    const lower = raw.toLowerCase();
    const normalizedPhone = this.normalizePhone(raw);
    return Array.from(db.users.values()).find(
      (u) =>
        (u.email && u.email.toLowerCase() === lower) ||
        (u.phone &&
          (u.phone === raw ||
            (normalizedPhone !== null && this.normalizePhone(u.phone) === normalizedPhone)))
    );
  }

  public static normalizeAccountIdentifier(emailOrPhone: string): string {
    const raw = (emailOrPhone || '').trim();
    if (raw.includes('@')) {
      return raw.toLowerCase();
    }
    const normalizedPhone = this.normalizePhone(raw);
    return (normalizedPhone || raw).toLowerCase();
  }

  public static async resetLoginProtectionTrackers() {
    await this.loginAttemptStore.reset();
    this.accountLoginMutex.clear();
    for (const u of db.users.values()) {
      u.failedLoginAttempts = 0;
      u.lockoutCount = 0;
      u.lockedUntil = null;
      u.lastFailedLoginAt = null;
    }
  }

  public static async expireAccountLockoutForTest(emailOrPhone: string) {
    const norm = this.normalizeAccountIdentifier(emailOrPhone);
    const user = this.findUserByIdentifier(emailOrPhone);
    const keys = user ? [`user:${user.id}`, `id:${norm}`, norm] : [`id:${norm}`, norm];

    for (const key of keys) {
      const state = await this.loginAttemptStore.getAccountState(key);
      if (state) {
        state.lockedUntilMs = Date.now() - 1000;
        state.count = 0;
        await this.loginAttemptStore.setAccountState(key, state, 3600);
      }
    }

    if (user) {
      user.lockedUntil = new Date(Date.now() - 1000);
      user.failedLoginAttempts = 0;
    }
  }

  public static async getAccountLockState(emailOrPhone: string): Promise<AccountAttemptRecord | null> {
    const norm = this.normalizeAccountIdentifier(emailOrPhone);
    const user = this.findUserByIdentifier(emailOrPhone);
    if (user) {
      const byUser = await this.loginAttemptStore.getAccountState(`user:${user.id}`);
      if (byUser) return byUser;
    }
    const byId = await this.loginAttemptStore.getAccountState(`id:${norm}`);
    if (byId) return byId;
    return await this.loginAttemptStore.getAccountState(norm);
  }

  private static async withAccountMutex<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
    const previous = this.accountLoginMutex.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current, () => current);
    this.accountLoginMutex.set(lockKey, chained);

    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
      if (this.accountLoginMutex.get(lockKey) === chained) {
        this.accountLoginMutex.delete(lockKey);
      }
    }
  }

  private static formatWaitingPeriod(remainingMs: number): {
    retryAfterSeconds: number;
    waitingPeriodMinutes: number;
    waitingPeriodText: string;
  } {
    const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    const waitingPeriodMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    const waitingPeriodText =
      waitingPeriodMinutes === 1 ? '1 minute' : `${waitingPeriodMinutes} minutes`;
    return { retryAfterSeconds, waitingPeriodMinutes, waitingPeriodText };
  }

  private static buildAccountLockedError(
    remainingMs: number,
    lockedUntilMs: number,
    lockoutCount: number,
    mode: 'PASSWORD' | 'OTP' = 'PASSWORD'
  ) {
    const { retryAfterSeconds, waitingPeriodMinutes, waitingPeriodText } =
      this.formatWaitingPeriod(remainingMs);
    const uiMessage =
      mode === 'OTP'
        ? 'Too many unsuccessful OTP verification attempts. Please try again after the displayed waiting period.'
        : 'Too many unsuccessful login attempts. Please try again after the displayed waiting period.';
    const message =
      mode === 'OTP'
        ? `Too many unsuccessful OTP verification attempts. Please try again after ${waitingPeriodText}.`
        : `Too many unsuccessful login attempts. Please try again after ${waitingPeriodText}.`;
    return ApiError.tooManyRequests(message, 'ACCOUNT_LOGIN_LOCKED', {
      retryAfterSeconds,
      waitingPeriodMinutes,
      waitingPeriodText,
      lockedUntil: new Date(lockedUntilMs).toISOString(),
      lockoutTier: lockoutCount,
      maxConsecutiveAttempts: this.MAX_CONSECUTIVE_FAILED_ATTEMPTS,
      uiMessage,
    });
  }

  private static safeHashEquals(aHex: string, bHex: string): boolean {
    const aBuf = Buffer.from(aHex, 'utf8');
    const bBuf = Buffer.from(bHex, 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  }

  // =========================================================================
  // PHONE + SMS OTP AUTHENTICATION (Web Staff/Admin + Phone-OTP Patient Flow)
  // =========================================================================

  static async requestOtp(input: {
    phone: string;
    purpose?: 'LOGIN' | 'REGISTER';
    role?: string;
    deviceInfo?: string;
    ipAddress?: string;
  }) {
    const normalizedPhone = requireValidPhoneNumber(input.phone, 'Mobile number');
    const purpose = input.purpose ?? 'LOGIN';
    const maskedPhone = maskPhoneNumber(normalizedPhone);
    const clientIp = (input.ipAddress || '127.0.0.1').trim();

    const existingUser = this.findUserByIdentifier(normalizedPhone);

    if (purpose === 'REGISTER' && existingUser) {
      throw ApiError.conflict(
        'An account with this mobile number already exists',
        'PHONE_ALREADY_EXISTS'
      );
    }

    // Active lockout cannot be bypassed by requesting a new OTP
    const lockState = await this.getAccountLockState(normalizedPhone);
    const nowMs = Date.now();
    const effectiveLockedUntilMs = Math.max(
      lockState?.lockedUntilMs ?? 0,
      existingUser?.lockedUntil?.getTime() ?? 0
    );
    if (effectiveLockedUntilMs > nowMs) {
      const lockoutTier = lockState?.lockoutCount || existingUser?.lockoutCount || 1;
      db.logAudit({
        userId: existingUser?.id ?? null,
        hospitalId: existingUser?.activeHospitalId ?? null,
        action: 'AUTH_OTP_REQUEST_BLOCKED_DURING_LOCKOUT',
        entityType: 'USER',
        entityId: existingUser?.id ?? null,
        ipAddress: clientIp,
        userAgent: input.deviceInfo ?? null,
        metadata: {
          maskedPhone,
          lockoutTier,
        },
      });
      throw this.buildAccountLockedError(
        effectiveLockedUntilMs - nowMs,
        effectiveLockedUntilMs,
        lockoutTier,
        'OTP'
      );
    }

    if (purpose === 'LOGIN' && existingUser && !existingUser.isActive) {
      throw ApiError.forbidden('Account has been deactivated', 'ACCOUNT_INACTIVE');
    }

    // Enforce resend cooldown against any currently unverified active OTP for this phone + purpose
    const latestActive = Array.from(db.phoneOtps.values())
      .filter((o) => o.phone === normalizedPhone && o.purpose === purpose && o.verifiedAt === null)
      .sort((a, b) => b.lastSentAt.getTime() - a.lastSentAt.getTime())[0];

    if (latestActive) {
      const elapsedSec = Math.floor((Date.now() - latestActive.lastSentAt.getTime()) / 1000);
      if (elapsedSec < this.OTP_RESEND_COOLDOWN_SECONDS) {
        const retryAfter = this.OTP_RESEND_COOLDOWN_SECONDS - elapsedSec;
        throw ApiError.tooManyRequests(
          `Please wait ${retryAfter} seconds before requesting another OTP.`,
          'OTP_RESEND_COOLDOWN',
          { retryAfterSeconds: retryAfter }
        );
      }
      latestActive.verifiedAt = new Date();
    }

    const otpCode = generateRandomCode(6);
    const now = new Date();
    const otpId = crypto.randomUUID();
    const delivery = await SmsOtpDeliveryService.sendOtp({
      to: normalizedPhone,
      otpCode,
      purpose,
      expiresInSeconds: this.OTP_TTL_SECONDS,
    });

    if (delivery.delivered) {
      db.phoneOtps.set(otpId, {
        id: otpId,
        phone: normalizedPhone,
        purpose,
        codeHash: sha256Hash(`${normalizedPhone}:${purpose}:${otpCode}`),
        attemptCount: 0,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + this.OTP_TTL_SECONDS * 1000),
        verifiedAt: null,
        createdAt: now,
      });
    }

    db.logAudit({
      userId: existingUser?.id ?? null,
      hospitalId: existingUser?.activeHospitalId ?? null,
      action: 'AUTH_PHONE_OTP_REQUESTED',
      entityType: 'PHONE_OTP',
      entityId: otpId,
      ipAddress: clientIp,
      userAgent: input.deviceInfo ?? null,
      metadata: {
        purpose,
        maskedPhone,
        provider: delivery.provider,
        smsDeliveryConfigured: delivery.configured,
        otpSent: delivery.delivered,
      },
    });

    return {
      otpSent: delivery.delivered,
      smsDeliveryConfigured: delivery.configured,
      maskedPhone,
      expiresInSeconds: this.OTP_TTL_SECONDS,
      cooldownSeconds: this.OTP_RESEND_COOLDOWN_SECONDS,
      provider: delivery.provider,
      ...(delivery.devOtpPreview ? { devOtpPreview: delivery.devOtpPreview } : {}),
      message: delivery.message,
    };
  }

  static async verifyLoginOtp(
    input: {
      phone: string;
      otpCode: string;
      role?: string;
      totpCode?: string;
      rememberMe?: boolean;
      deviceInfo?: string;
      ipAddress?: string;
    },
    options: { requirePatientRole?: boolean } = {}
  ) {
    const normalizedPhone = requireValidPhoneNumber(input.phone, 'Mobile number');
    const normalizedId = this.normalizeAccountIdentifier(normalizedPhone);
    const clientIp = (input.ipAddress || '127.0.0.1').trim();
    const preliminaryUser = this.findUserByIdentifier(normalizedPhone);
    const canonicalKey = preliminaryUser ? `user:${preliminaryUser.id}` : `id:${normalizedId}`;

    return this.withAccountMutex(canonicalKey, async () => {
      const nowMs = Date.now();
      const enforceIpVelocity =
        process.env.DISABLE_AUTH_RATE_LIMIT_FOR_TEST !== 'true' ||
        process.env.ENFORCE_IP_LOGIN_VELOCITY === 'true';

      // 1. Check per-IP brute-force velocity
      const ipState = await this.loginAttemptStore.getIpState(clientIp);
      if (enforceIpVelocity && ipState) {
        if (ipState.lockedUntilMs > nowMs) {
          securityStore.metrics.authFailures += 1;
          const remainingMs = ipState.lockedUntilMs - nowMs;
          const { retryAfterSeconds, waitingPeriodMinutes, waitingPeriodText } =
            this.formatWaitingPeriod(remainingMs);
          throw ApiError.tooManyRequests(
            `Too many unsuccessful OTP verification attempts. Please try again after ${waitingPeriodText}.`,
            'IP_LOGIN_RATE_LIMIT_EXCEEDED',
            {
              retryAfterSeconds,
              waitingPeriodMinutes,
              waitingPeriodText,
              lockedUntil: new Date(ipState.lockedUntilMs).toISOString(),
              uiMessage:
                'Too many unsuccessful OTP verification attempts. Please try again after the displayed waiting period.',
            }
          );
        }
        if (nowMs - ipState.windowStartMs > this.IP_WINDOW_MS) {
          await this.loginAttemptStore.deleteIpState(clientIp);
        }
      }

      const user = this.findUserByIdentifier(normalizedPhone);
      let lockState =
        (await this.loginAttemptStore.getAccountState(canonicalKey)) ||
        (await this.loginAttemptStore.getAccountState(normalizedId));

      if (user && user.lockedUntil && user.lockedUntil.getTime() > (lockState?.lockedUntilMs || 0)) {
        lockState = {
          count: user.failedLoginAttempts || this.MAX_CONSECUTIVE_FAILED_ATTEMPTS,
          lockoutCount: user.lockoutCount || 1,
          lockedUntilMs: user.lockedUntil.getTime(),
          lastFailedAtMs: user.lastFailedLoginAt ? user.lastFailedLoginAt.getTime() : nowMs,
          distinctIps: lockState?.distinctIps ? [...lockState.distinctIps] : [clientIp],
        };
        await this.loginAttemptStore.setAccountState(canonicalKey, lockState, 86400);
      }

      // 2. If lockout expired, reset consecutive failure counter while preserving lockoutCount
      if (lockState && lockState.lockedUntilMs > 0 && lockState.lockedUntilMs <= nowMs) {
        lockState.count = 0;
        lockState.lockedUntilMs = 0;
        await this.loginAttemptStore.setAccountState(canonicalKey, lockState, 86400);
        await this.loginAttemptStore.setAccountState(normalizedId, lockState, 86400);
        if (user) {
          user.failedLoginAttempts = 0;
          user.lockedUntil = null;
        }
      }

      // 3. Block immediately if currently locked
      if (lockState && lockState.lockedUntilMs > nowMs) {
        securityStore.metrics.authFailures += 1;
        db.logAudit({
          userId: user?.id ?? null,
          hospitalId: user?.activeHospitalId ?? null,
          action: 'AUTH_LOGIN_BLOCKED_DURING_LOCKOUT',
          entityType: 'USER',
          entityId: user?.id ?? null,
          ipAddress: clientIp,
          userAgent: input.deviceInfo ?? null,
          metadata: {
            lockoutTier: lockState.lockoutCount,
            remainingSeconds: Math.ceil((lockState.lockedUntilMs - nowMs) / 1000),
          },
        });
        throw this.buildAccountLockedError(
          lockState.lockedUntilMs - nowMs,
          lockState.lockedUntilMs,
          lockState.lockoutCount,
          'OTP'
        );
      }

      const recordFailedOtpAttempt = async (targetUser: DbUser | undefined): Promise<never> => {
        const current: AccountAttemptRecord = lockState
          ? { ...lockState, distinctIps: [...lockState.distinctIps] }
          : {
              count: 0,
              lockoutCount: targetUser?.lockoutCount || 0,
              lockedUntilMs: 0,
              lastFailedAtMs: 0,
              distinctIps: [],
            };
        current.count += 1;
        current.lastFailedAtMs = nowMs;
        if (!current.distinctIps.includes(clientIp)) {
          current.distinctIps.push(clientIp);
        }

        let triggeredLockout = false;
        if (current.count >= this.MAX_CONSECUTIVE_FAILED_ATTEMPTS) {
          current.lockoutCount += 1;
          const multiplier = Math.pow(2, Math.max(0, current.lockoutCount - 1));
          const lockoutDurationMs = Math.min(
            this.MAX_LOCKOUT_DURATION_MS,
            this.BASE_LOCKOUT_DURATION_MS * multiplier
          );
          current.lockedUntilMs = nowMs + lockoutDurationMs;
          triggeredLockout = true;
        }

        const ttlSec = Math.max(
          3600,
          Math.ceil(Math.max(0, current.lockedUntilMs - nowMs) / 1000) + 3600
        );
        await this.loginAttemptStore.setAccountState(canonicalKey, current, ttlSec);
        await this.loginAttemptStore.setAccountState(normalizedId, current, ttlSec);

        if (targetUser) {
          targetUser.failedLoginAttempts = current.count;
          targetUser.lockoutCount = current.lockoutCount;
          targetUser.lastFailedLoginAt = new Date(nowMs);
          targetUser.lockedUntil = current.lockedUntilMs > 0 ? new Date(current.lockedUntilMs) : null;
          targetUser.updatedAt = new Date(nowMs);
        }

        const existingIp = await this.loginAttemptStore.getIpState(clientIp);
        const ipRec =
          existingIp && nowMs - existingIp.windowStartMs <= this.IP_WINDOW_MS
            ? { ...existingIp, targetedAccounts: [...existingIp.targetedAccounts] }
            : {
                count: 0,
                windowStartMs: nowMs,
                lockedUntilMs: 0,
                targetedAccounts: [] as string[],
              };
        ipRec.count += 1;
        if (!ipRec.targetedAccounts.includes(canonicalKey)) {
          ipRec.targetedAccounts.push(canonicalKey);
        }
        if (
          enforceIpVelocity &&
          (ipRec.count >= this.MAX_IP_FAILED_ATTEMPTS_PER_WINDOW || ipRec.targetedAccounts.length >= 6)
        ) {
          ipRec.lockedUntilMs = nowMs + this.BASE_LOCKOUT_DURATION_MS;
          db.logAudit({
            userId: null,
            hospitalId: null,
            action: 'AUTH_SUSPICIOUS_IP_ACTIVITY',
            entityType: 'SECURITY_IP',
            entityId: clientIp,
            ipAddress: clientIp,
            userAgent: input.deviceInfo ?? null,
            metadata: {
              failedAttemptsInWindow: ipRec.count,
              distinctTargetedAccounts: ipRec.targetedAccounts.length,
            },
          });
        }
        await this.loginAttemptStore.setIpState(clientIp, ipRec, Math.ceil(this.IP_WINDOW_MS / 1000) + 900);

        securityStore.metrics.authFailures += 1;

        db.logAudit({
          userId: targetUser?.id ?? null,
          hospitalId: targetUser?.activeHospitalId ?? null,
          action: triggeredLockout ? 'AUTH_ACCOUNT_LOCKED' : 'AUTH_LOGIN_FAILED',
          entityType: 'USER',
          entityId: targetUser?.id ?? null,
          ipAddress: clientIp,
          userAgent: input.deviceInfo ?? null,
          metadata: {
            reason: 'INVALID_OTP',
            consecutiveFailures: current.count,
            maxAllowedAttempts: this.MAX_CONSECUTIVE_FAILED_ATTEMPTS,
            lockoutTriggered: triggeredLockout,
            lockoutTier: current.lockoutCount,
            distinctSourceIps: current.distinctIps.length,
          },
        });

        if (triggeredLockout) {
          throw this.buildAccountLockedError(
            current.lockedUntilMs - nowMs,
            current.lockedUntilMs,
            current.lockoutCount,
            'OTP'
          );
        }

        throw ApiError.unauthorized('Invalid or expired OTP code', 'INVALID_OTP');
      };

      const latestActiveOtp = Array.from(db.phoneOtps.values())
        .filter((o) => o.phone === normalizedPhone && o.purpose === 'LOGIN' && o.verifiedAt === null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      if (!latestActiveOtp || latestActiveOtp.expiresAt.getTime() <= nowMs) {
        await recordFailedOtpAttempt(user);
      }

      const expectedHash = sha256Hash(`${normalizedPhone}:LOGIN:${input.otpCode.trim()}`);
      if (!this.safeHashEquals(latestActiveOtp!.codeHash, expectedHash)) {
        latestActiveOtp!.attemptCount += 1;
        if (latestActiveOtp!.attemptCount >= env.MAX_OTP_ATTEMPTS) {
          latestActiveOtp!.verifiedAt = new Date();
        }
        await recordFailedOtpAttempt(user);
      }

      if (!user) {
        await recordFailedOtpAttempt(undefined);
      }

      // Consume OTP immediately once verified so replay is impossible
      latestActiveOtp!.verifiedAt = new Date();

      const validUser = user!;
      if (!validUser.isActive) {
        throw ApiError.forbidden('Account has been deactivated', 'ACCOUNT_INACTIVE');
      }

      // Reset consecutive failed attempts on successful OTP proof
      const previousFailures = lockState?.count || validUser.failedLoginAttempts || 0;
      const previousLockouts = lockState?.lockoutCount || validUser.lockoutCount || 0;

      await this.loginAttemptStore.deleteAccountState(canonicalKey);
      await this.loginAttemptStore.deleteAccountState(normalizedId);
      validUser.failedLoginAttempts = 0;
      validUser.lockedUntil = null;
      validUser.isPhoneVerified = true;
      validUser.updatedAt = new Date();

      const meProfile = this.buildMeProfile(validUser.id);

      if (
        options.requirePatientRole &&
        !meProfile.activeRoles.includes('PATIENT') &&
        !meProfile.globalRoles.includes('PATIENT')
      ) {
        db.logAudit({
          userId: validUser.id,
          hospitalId: validUser.activeHospitalId,
          action: 'AUTH_PATIENT_LOGIN_ROLE_REJECTED',
          entityType: 'USER',
          entityId: validUser.id,
          ipAddress: clientIp,
          userAgent: input.deviceInfo ?? null,
          metadata: { actualRoles: meProfile.activeRoles },
        });
        throw ApiError.forbidden(
          'This mobile application is exclusively for patients. Staff members must use the MediCore Web Portal.',
          'PATIENT_ROLE_REQUIRED'
        );
      }

      if (input.role && input.role.trim() !== '' && input.role.trim().toUpperCase() !== 'ANY') {
        const requestedRole = input.role.trim().toUpperCase();
        const hasRole =
          meProfile.globalRoles.includes(requestedRole as RoleCodeType) ||
          meProfile.activeRoles.includes(requestedRole as RoleCodeType) ||
          meProfile.globalRoles.includes('SUPER_ADMIN');

        if (!hasRole) {
          db.logAudit({
            userId: validUser.id,
            hospitalId: validUser.activeHospitalId,
            action: 'AUTH_LOGIN_ROLE_MISMATCH',
            entityType: 'USER',
            entityId: validUser.id,
            ipAddress: clientIp,
            userAgent: input.deviceInfo ?? null,
            metadata: { requestedRole, actualRoles: meProfile.activeRoles },
          });
          throw ApiError.forbidden(
            `Access denied. This account does not possess the required role (${requestedRole}). Please select your correct role or contact your Hospital Administrator.`,
            'ROLE_MISMATCH'
          );
        }
      }

      // Check TOTP MFA requirement for privileged staff with MFA enabled
      const mfaConfig = securityStore.mfaSecrets.get(validUser.id);
      if (mfaConfig?.isEnabled) {
        if (input.totpCode && input.totpCode.trim().length >= 6) {
          SecurityAndNotificationService.verifyMfaCodeForUser(validUser.id, input.totpCode.trim());
        } else {
          const mfaChallengeToken = signMfaChallengeToken({
            sub: validUser.id,
            email: validUser.email,
          });
          return {
            mfaRequired: true as const,
            mfaChallengeToken,
            user: {
              id: validUser.id,
              fullName: validUser.fullName,
              email: validUser.email,
              phone: validUser.phone,
            },
          };
        }
      }

      const tokens = this.issueTokens(validUser, input.deviceInfo, clientIp);

      if (previousFailures > 0 || previousLockouts > 0) {
        db.logAudit({
          userId: validUser.id,
          hospitalId: validUser.activeHospitalId,
          action: 'AUTH_LOGIN_RECOVERED_AFTER_FAILURES',
          entityType: 'USER',
          entityId: validUser.id,
          ipAddress: clientIp,
          userAgent: input.deviceInfo ?? null,
          metadata: {
            previousConsecutiveFailures: previousFailures,
            previousLockoutTier: previousLockouts,
          },
        });
      }

      db.logAudit({
        userId: validUser.id,
        hospitalId: validUser.activeHospitalId,
        action: options.requirePatientRole ? 'AUTH_PATIENT_OTP_LOGIN_SUCCESS' : 'AUTH_OTP_LOGIN_SUCCESS',
        entityType: 'USER',
        entityId: validUser.id,
        ipAddress: clientIp,
        userAgent: input.deviceInfo ?? null,
        metadata: null,
      });

      return {
        mfaRequired: false as const,
        user: meProfile,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      };
    });
  }

  static async verifyMfaLogin(input: {
    mfaChallengeToken: string;
    totpCode: string;
    deviceInfo?: string;
    ipAddress?: string;
  }) {
    const decoded = verifyMfaChallengeToken(input.mfaChallengeToken);
    const user = db.users.get(decoded.sub);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Account is inactive or no longer exists', 'ACCOUNT_INACTIVE');
    }

    const verification = SecurityAndNotificationService.verifyMfaCodeForUser(
      user.id,
      input.totpCode.trim()
    );

    const tokens = this.issueTokens(user, input.deviceInfo, input.ipAddress);

    db.logAudit({
      userId: user.id,
      hospitalId: user.activeHospitalId,
      action: 'AUTH_MFA_LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.deviceInfo ?? null,
      metadata: {
        method: verification.method,
        backupCodesRemaining: verification.backupCodesRemaining,
      },
    });

    return {
      mfaRequired: false as const,
      user: this.buildMeProfile(user.id),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      mfaMethod: verification.method,
    };
  }

  static async authenticateWithGoogle(input: {
    idToken: string;
    mode?: 'SIGN_IN' | 'SIGN_UP';
    role?: string;
    department?: string;
    termsAccepted?: boolean;
    deviceInfo?: string;
    ipAddress?: string;
  }) {
    const googleUser = await verifyFirebaseGoogleIdToken(input.idToken);
    const mode = input.mode ?? 'SIGN_IN';
    const emailLower = googleUser.email.toLowerCase().trim();
    const clientIp = (input.ipAddress || '127.0.0.1').trim();

    let user = Array.from(db.users.values()).find((u) => u.email.toLowerCase() === emailLower);
    let isNewAccount = false;

    if (!user) {
      const isBootstrapAdmin = BOOTSTRAP_SUPER_ADMIN_EMAILS.has(emailLower);

      if (mode === 'SIGN_IN' && !isBootstrapAdmin) {
        throw ApiError.notFound(
          'No MediCore staff account is registered for this Google email address. Please sign up or contact your Hospital Administrator.',
          'GOOGLE_ACCOUNT_NOT_FOUND'
        );
      }

      const now = new Date();
      const assignedRole: RoleCodeType = isBootstrapAdmin
        ? 'SUPER_ADMIN'
        : input.role && STAFF_GOOGLE_SIGNUP_ROLES.has(input.role.toUpperCase() as RoleCodeType)
          ? (input.role.toUpperCase() as RoleCodeType)
          : 'DOCTOR';

      user = await withTransaction(async () => {
        const newUser: DbUser = {
          id: crypto.randomUUID(),
          fullName: googleUser.fullName,
          email: emailLower,
          phone: null,
          passwordHash: null,
          isEmailVerified: true,
          isPhoneVerified: false,
          isActive: true,
          activeHospitalId: null,
          createdAt: now,
          updatedAt: now,
        };
        db.users.set(newUser.id, newUser);

        const roleId = crypto.randomUUID();
        db.userRoles.set(roleId, {
          id: roleId,
          userId: newUser.id,
          roleCode: assignedRole,
          hospitalId: null,
          membershipId: null,
          assignedAt: now,
        });

        return newUser;
      });
      isNewAccount = true;
    } else {
      if (!user.isActive) {
        throw ApiError.forbidden('Account has been deactivated', 'ACCOUNT_INACTIVE');
      }
      if (!user.isEmailVerified && googleUser.emailVerified) {
        user.isEmailVerified = true;
        user.updatedAt = new Date();
      }
    }

    const meProfile = this.buildMeProfile(user.id);
    const allRoles = Array.from(new Set([...meProfile.globalRoles, ...meProfile.activeRoles]));
    const hasStaffOrAdminRole = allRoles.some((r) => r !== 'PATIENT');

    if (!hasStaffOrAdminRole) {
      throw ApiError.forbidden(
        'Patient accounts must use the MediCore Android Patient App. This console is restricted to hospital staff and administrators.',
        'WEB_STAFF_ONLY'
      );
    }

    if (
      mode === 'SIGN_IN' &&
      input.role &&
      input.role.trim() !== '' &&
      input.role.trim().toUpperCase() !== 'ANY'
    ) {
      const requestedRole = input.role.trim().toUpperCase() as RoleCodeType;
      const hasRole =
        allRoles.includes(requestedRole) || meProfile.globalRoles.includes('SUPER_ADMIN');
      if (!hasRole) {
        throw ApiError.forbidden(
          `Access denied. This account does not possess the required role (${requestedRole}).`,
          'ROLE_MISMATCH'
        );
      }
    }

    const mfaConfig = securityStore.mfaSecrets.get(user.id);
    if (mfaConfig?.isEnabled) {
      const mfaChallengeToken = signMfaChallengeToken({
        sub: user.id,
        email: user.email,
      });
      return {
        mfaRequired: true as const,
        mfaChallengeToken,
        isNewAccount: false,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
        },
      };
    }

    const tokens = this.issueTokens(user, input.deviceInfo, clientIp);

    db.logAudit({
      userId: user.id,
      hospitalId: user.activeHospitalId,
      action: isNewAccount ? 'AUTH_GOOGLE_SIGNUP_SUCCESS' : 'AUTH_GOOGLE_LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: clientIp,
      userAgent: input.deviceInfo ?? null,
      metadata: { email: user.email, isNewAccount },
    });

    return {
      mfaRequired: false as const,
      isNewAccount,
      user: meProfile,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  }

  // =========================================================================
  // REGISTRATION (Supports BOTH Phone+OTP Passwordless AND Email+Password)
  // =========================================================================

  static async register(input: {
    fullName: string;
    email?: string;
    phone?: string;
    otpCode?: string;
    password?: string;
    confirmPassword?: string;
    dateOfBirth?: string;
    gender?: string;
    termsAccepted?: boolean;
    role?: string;
    roles?: string[];
    globalRoles?: string[];
    hospitalId?: string;
    ipAddress?: string;
    deviceInfo?: string;
  }) {
    this.assertNoPrivilegedRoleAttempt(input);

    if (input.termsAccepted === false) {
      throw ApiError.badRequest(
        'You must accept the Terms of Service and Privacy Policy',
        'TERMS_NOT_ACCEPTED'
      );
    }

    // Branch A: Phone + OTP passwordless registration
    if (input.otpCode && input.phone) {
      const normalizedPhone = requireValidPhoneNumber(input.phone, 'Mobile number');
      const existingByPhone = Array.from(db.users.values()).find(
        (u) => u.phone && this.normalizePhone(u.phone) === normalizedPhone
      );
      if (existingByPhone) {
        throw ApiError.conflict(
          'An account with this mobile number already exists',
          'PHONE_ALREADY_EXISTS'
        );
      }

      const emailLower = input.email ? input.email.toLowerCase().trim() : '';
      if (emailLower) {
        const existingByEmail = Array.from(db.users.values()).find(
          (u) => u.email && u.email.toLowerCase() === emailLower
        );
        if (existingByEmail) {
          throw ApiError.conflict(
            'An account with this email already exists',
            'EMAIL_ALREADY_EXISTS'
          );
        }
      }

      const latestActiveOtp = Array.from(db.phoneOtps.values())
        .filter(
          (o) => o.phone === normalizedPhone && o.purpose === 'REGISTER' && o.verifiedAt === null
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      if (!latestActiveOtp || latestActiveOtp.expiresAt.getTime() <= Date.now()) {
        throw ApiError.badRequest('Invalid or expired OTP code', 'INVALID_OR_EXPIRED_OTP');
      }

      if (latestActiveOtp.attemptCount >= env.MAX_OTP_ATTEMPTS) {
        latestActiveOtp.verifiedAt = new Date();
        throw ApiError.tooManyRequests(
          'Maximum OTP verification attempts exceeded. Please request a new OTP.',
          'OTP_MAX_ATTEMPTS_EXCEEDED'
        );
      }

      const expectedHash = sha256Hash(`${normalizedPhone}:REGISTER:${input.otpCode.trim()}`);
      if (!this.safeHashEquals(latestActiveOtp.codeHash, expectedHash)) {
        latestActiveOtp.attemptCount += 1;
        if (latestActiveOtp.attemptCount >= env.MAX_OTP_ATTEMPTS) {
          latestActiveOtp.verifiedAt = new Date();
        }
        throw ApiError.badRequest('Invalid or expired OTP code', 'INVALID_OR_EXPIRED_OTP');
      }

      latestActiveOtp.verifiedAt = new Date();
      const now = new Date();
      const resolvedEmail =
        emailLower || `patient.${normalizedPhone.replace(/\D/g, '')}@phone.medicore.local`;

      const user = await withTransaction(async () => {
        const newUser: DbUser = {
          id: crypto.randomUUID(),
          fullName: input.fullName.trim(),
          email: resolvedEmail,
          phone: normalizedPhone,
          passwordHash: null,
          isEmailVerified: false,
          isPhoneVerified: true,
          isActive: true,
          activeHospitalId: null,
          createdAt: now,
          updatedAt: now,
        };
        db.users.set(newUser.id, newUser);

        const globalRoleId = crypto.randomUUID();
        db.userRoles.set(globalRoleId, {
          id: globalRoleId,
          userId: newUser.id,
          roleCode: 'PATIENT',
          hospitalId: null,
          membershipId: null,
          assignedAt: now,
        });

        const patientId = crypto.randomUUID();
        db.patientProfiles.set(patientId, {
          id: patientId,
          userId: newUser.id,
          globalPatientId: `MC-PAT-${newUser.id.slice(0, 8).toUpperCase()}`,
          dateOfBirth: input.dateOfBirth ?? null,
          gender: input.gender ?? null,
          onboardingCompleted: false,
          termsAcceptedAt: input.termsAccepted ? now : null,
          healthConsentGranted: false,
          healthConsentAt: null,
          profileCompletionPercent: 20,
          createdAt: now,
          updatedAt: now,
        });

        return newUser;
      });

      const tokens = this.issueTokens(user, input.deviceInfo, input.ipAddress);

      db.logAudit({
        userId: user.id,
        hospitalId: null,
        action: 'AUTH_PATIENT_REGISTER',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.deviceInfo ?? null,
        metadata: {
          maskedPhone: maskPhoneNumber(normalizedPhone),
          phoneVerified: true,
        },
      });

      return {
        user: this.buildMeProfile(user.id),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        phoneVerified: true,
      };
    }

    // Branch B: Email + Password registration
    if (!input.email || !input.password) {
      throw ApiError.badRequest(
        'Either phone + OTP or email + password is required to register',
        'VALIDATION_ERROR'
      );
    }

    if (input.confirmPassword !== undefined && input.password !== input.confirmPassword) {
      throw ApiError.badRequest('Password and confirm password do not match', 'PASSWORD_MISMATCH');
    }

    const emailLower = input.email.toLowerCase().trim();
    const normalizedPhone = this.normalizePhone(input.phone);

    const existingByEmail = Array.from(db.users.values()).find(
      (u) => u.email.toLowerCase() === emailLower
    );
    if (existingByEmail) {
      throw ApiError.conflict('An account with this email already exists', 'EMAIL_ALREADY_EXISTS');
    }

    if (normalizedPhone) {
      const existingByPhone = Array.from(db.users.values()).find(
        (u) => u.phone && this.normalizePhone(u.phone) === normalizedPhone
      );
      if (existingByPhone) {
        throw ApiError.conflict(
          'An account with this mobile number already exists',
          'PHONE_ALREADY_EXISTS'
        );
      }
    }

    const passwordHash = await hashPassword(input.password);
    const now = new Date();
    const verificationCode = generateRandomCode(6);

    const user = await withTransaction(async () => {
      const newUser: DbUser = {
        id: crypto.randomUUID(),
        fullName: input.fullName.trim(),
        email: emailLower,
        phone: normalizedPhone,
        passwordHash,
        isEmailVerified: false,
        isPhoneVerified: false,
        isActive: true,
        activeHospitalId: null,
        createdAt: now,
        updatedAt: now,
      };
      db.users.set(newUser.id, newUser);

      const globalRoleId = crypto.randomUUID();
      db.userRoles.set(globalRoleId, {
        id: globalRoleId,
        userId: newUser.id,
        roleCode: 'PATIENT',
        hospitalId: null,
        membershipId: null,
        assignedAt: now,
      });

      const patientId = crypto.randomUUID();
      db.patientProfiles.set(patientId, {
        id: patientId,
        userId: newUser.id,
        globalPatientId: `MC-PAT-${newUser.id.slice(0, 8).toUpperCase()}`,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender ?? null,
        onboardingCompleted: false,
        termsAcceptedAt: input.termsAccepted ? now : null,
        healthConsentGranted: false,
        healthConsentAt: null,
        profileCompletionPercent: normalizedPhone ? 20 : 10,
        createdAt: now,
        updatedAt: now,
      });

      const verificationId = crypto.randomUUID();
      db.emailVerifications.set(verificationId, {
        id: verificationId,
        userId: newUser.id,
        tokenHash: sha256Hash(`${newUser.id}:${verificationCode}`),
        code: verificationCode,
        attemptCount: 0,
        lastSentAt: now,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        verifiedAt: null,
        createdAt: now,
      });

      return newUser;
    });

    const emailDelivery = await EmailDeliveryService.sendTransactionalEmail({
      to: user.email,
      subject: 'MediCore Email Verification Code',
      text: `Your MediCore verification code is ${verificationCode}. It expires in 24 hours.`,
      purpose: 'EMAIL_VERIFICATION',
    });

    const tokens = this.issueTokens(user, input.deviceInfo, input.ipAddress);

    db.logAudit({
      userId: user.id,
      hospitalId: null,
      action: 'AUTH_PATIENT_REGISTER',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.deviceInfo ?? null,
      metadata: {
        email: user.email,
        emailDeliveryConfigured: emailDelivery.configured,
        emailVerificationSent: emailDelivery.delivered,
      },
    });

    return {
      user: this.buildMeProfile(user.id),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      emailVerificationRequired: true,
      emailVerificationSent: emailDelivery.delivered,
      emailDeliveryConfigured: emailDelivery.configured,
    };
  }

  // =========================================================================
  // PASSWORD LOGIN (Backwards Compatibility)
  // =========================================================================

  static async login(
    input: {
      emailOrPhone: string;
      password: string;
      deviceInfo?: string;
      ipAddress?: string;
      role?: string;
    },
    options: { requirePatientRole?: boolean } = {}
  ) {
    const normalizedId = this.normalizeAccountIdentifier(input.emailOrPhone);
    const clientIp = (input.ipAddress || '127.0.0.1').trim();
    const preliminaryUser = this.findUserByIdentifier(input.emailOrPhone);
    const canonicalKey = preliminaryUser ? `user:${preliminaryUser.id}` : `id:${normalizedId}`;

    return this.withAccountMutex(canonicalKey, async () => {
      const nowMs = Date.now();
      const enforceIpVelocity =
        process.env.DISABLE_AUTH_RATE_LIMIT_FOR_TEST !== 'true' ||
        process.env.ENFORCE_IP_LOGIN_VELOCITY === 'true';

      const ipState = await this.loginAttemptStore.getIpState(clientIp);
      if (enforceIpVelocity && ipState) {
        if (ipState.lockedUntilMs > nowMs) {
          securityStore.metrics.authFailures += 1;
          const remainingMs = ipState.lockedUntilMs - nowMs;
          const { retryAfterSeconds, waitingPeriodMinutes, waitingPeriodText } =
            this.formatWaitingPeriod(remainingMs);
          throw ApiError.tooManyRequests(
            `Too many unsuccessful login attempts. Please try again after ${waitingPeriodText}.`,
            'IP_LOGIN_RATE_LIMIT_EXCEEDED',
            {
              retryAfterSeconds,
              waitingPeriodMinutes,
              waitingPeriodText,
              lockedUntil: new Date(ipState.lockedUntilMs).toISOString(),
              uiMessage:
                'Too many unsuccessful login attempts. Please try again after the displayed waiting period.',
            }
          );
        }
        if (nowMs - ipState.windowStartMs > this.IP_WINDOW_MS) {
          await this.loginAttemptStore.deleteIpState(clientIp);
        }
      }

      const user = this.findUserByIdentifier(input.emailOrPhone);
      let lockState =
        (await this.loginAttemptStore.getAccountState(canonicalKey)) ||
        (await this.loginAttemptStore.getAccountState(normalizedId));

      if (user && user.lockedUntil && user.lockedUntil.getTime() > (lockState?.lockedUntilMs || 0)) {
        lockState = {
          count: user.failedLoginAttempts || this.MAX_CONSECUTIVE_FAILED_ATTEMPTS,
          lockoutCount: user.lockoutCount || 1,
          lockedUntilMs: user.lockedUntil.getTime(),
          lastFailedAtMs: user.lastFailedLoginAt ? user.lastFailedLoginAt.getTime() : nowMs,
          distinctIps: lockState?.distinctIps ? [...lockState.distinctIps] : [clientIp],
        };
        await this.loginAttemptStore.setAccountState(canonicalKey, lockState, 86400);
      }

      if (lockState && lockState.lockedUntilMs > 0 && lockState.lockedUntilMs <= nowMs) {
        lockState.count = 0;
        lockState.lockedUntilMs = 0;
        await this.loginAttemptStore.setAccountState(canonicalKey, lockState, 86400);
        if (user) {
          user.failedLoginAttempts = 0;
          user.lockedUntil = null;
        }
      }

      if (lockState && lockState.lockedUntilMs > nowMs) {
        securityStore.metrics.authFailures += 1;
        db.logAudit({
          userId: user?.id ?? null,
          hospitalId: user?.activeHospitalId ?? null,
          action: 'AUTH_LOGIN_BLOCKED_DURING_LOCKOUT',
          entityType: 'USER',
          entityId: user?.id ?? null,
          ipAddress: clientIp,
          userAgent: input.deviceInfo ?? null,
          metadata: {
            lockoutTier: lockState.lockoutCount,
            remainingSeconds: Math.ceil((lockState.lockedUntilMs - nowMs) / 1000),
          },
        });
        throw this.buildAccountLockedError(
          lockState.lockedUntilMs - nowMs,
          lockState.lockedUntilMs,
          lockState.lockoutCount,
          'PASSWORD'
        );
      }

      const recordFailedAttempt = async (targetUser: DbUser | undefined): Promise<never> => {
        const current: AccountAttemptRecord = lockState
          ? { ...lockState, distinctIps: [...lockState.distinctIps] }
          : {
              count: 0,
              lockoutCount: targetUser?.lockoutCount || 0,
              lockedUntilMs: 0,
              lastFailedAtMs: 0,
              distinctIps: [],
            };
        current.count += 1;
        current.lastFailedAtMs = nowMs;
        if (!current.distinctIps.includes(clientIp)) {
          current.distinctIps.push(clientIp);
        }

        let triggeredLockout = false;
        if (current.count >= this.MAX_CONSECUTIVE_FAILED_ATTEMPTS) {
          current.lockoutCount += 1;
          const multiplier = Math.pow(2, Math.max(0, current.lockoutCount - 1));
          const lockoutDurationMs = Math.min(
            this.MAX_LOCKOUT_DURATION_MS,
            this.BASE_LOCKOUT_DURATION_MS * multiplier
          );
          current.lockedUntilMs = nowMs + lockoutDurationMs;
          triggeredLockout = true;
        }

        const ttlSec = Math.max(
          3600,
          Math.ceil(Math.max(0, current.lockedUntilMs - nowMs) / 1000) + 3600
        );
        await this.loginAttemptStore.setAccountState(canonicalKey, current, ttlSec);
        await this.loginAttemptStore.setAccountState(normalizedId, current, ttlSec);

        if (targetUser) {
          targetUser.failedLoginAttempts = current.count;
          targetUser.lockoutCount = current.lockoutCount;
          targetUser.lastFailedLoginAt = new Date(nowMs);
          targetUser.lockedUntil = current.lockedUntilMs > 0 ? new Date(current.lockedUntilMs) : null;
          targetUser.updatedAt = new Date(nowMs);
        }

        const existingIp = await this.loginAttemptStore.getIpState(clientIp);
        const ipRec =
          existingIp && nowMs - existingIp.windowStartMs <= this.IP_WINDOW_MS
            ? { ...existingIp, targetedAccounts: [...existingIp.targetedAccounts] }
            : {
                count: 0,
                windowStartMs: nowMs,
                lockedUntilMs: 0,
                targetedAccounts: [] as string[],
              };
        ipRec.count += 1;
        if (!ipRec.targetedAccounts.includes(canonicalKey)) {
          ipRec.targetedAccounts.push(canonicalKey);
        }
        if (
          enforceIpVelocity &&
          (ipRec.count >= this.MAX_IP_FAILED_ATTEMPTS_PER_WINDOW || ipRec.targetedAccounts.length >= 6)
        ) {
          ipRec.lockedUntilMs = nowMs + this.BASE_LOCKOUT_DURATION_MS;
          db.logAudit({
            userId: null,
            hospitalId: null,
            action: 'AUTH_SUSPICIOUS_IP_ACTIVITY',
            entityType: 'SECURITY_IP',
            entityId: clientIp,
            ipAddress: clientIp,
            userAgent: input.deviceInfo ?? null,
            metadata: {
              failedAttemptsInWindow: ipRec.count,
              distinctTargetedAccounts: ipRec.targetedAccounts.length,
            },
          });
        }
        await this.loginAttemptStore.setIpState(clientIp, ipRec, Math.ceil(this.IP_WINDOW_MS / 1000) + 900);

        securityStore.metrics.authFailures += 1;

        db.logAudit({
          userId: targetUser?.id ?? null,
          hospitalId: targetUser?.activeHospitalId ?? null,
          action: triggeredLockout ? 'AUTH_ACCOUNT_LOCKED' : 'AUTH_LOGIN_FAILED',
          entityType: 'USER',
          entityId: targetUser?.id ?? null,
          ipAddress: clientIp,
          userAgent: input.deviceInfo ?? null,
          metadata: {
            reason: 'INVALID_CREDENTIALS',
            consecutiveFailures: current.count,
            maxAllowedAttempts: this.MAX_CONSECUTIVE_FAILED_ATTEMPTS,
            lockoutTriggered: triggeredLockout,
            lockoutTier: current.lockoutCount,
            distinctSourceIps: current.distinctIps.length,
          },
        });

        if (triggeredLockout) {
          throw this.buildAccountLockedError(
            current.lockedUntilMs - nowMs,
            current.lockedUntilMs,
            current.lockoutCount,
            'PASSWORD'
          );
        }

        throw ApiError.unauthorized('Invalid email/phone or password', 'INVALID_CREDENTIALS');
      };

      if (!user || !user.passwordHash) {
        await recordFailedAttempt(user);
      }

      const validUser = user!;
      const passwordValid = await verifyPassword(validUser.passwordHash!, input.password);
      if (!passwordValid) {
        await recordFailedAttempt(validUser);
      }

      if (!validUser.isActive) {
        throw ApiError.forbidden('Account has been deactivated', 'ACCOUNT_INACTIVE');
      }

      const previousFailures = lockState?.count || validUser.failedLoginAttempts || 0;
      const previousLockouts = lockState?.lockoutCount || validUser.lockoutCount || 0;

      await this.loginAttemptStore.deleteAccountState(canonicalKey);
      await this.loginAttemptStore.deleteAccountState(normalizedId);
      validUser.failedLoginAttempts = 0;
      validUser.lockedUntil = null;
      validUser.updatedAt = new Date();

      const meProfile = this.buildMeProfile(validUser.id);
      if (
        options.requirePatientRole &&
        !meProfile.activeRoles.includes('PATIENT') &&
        !meProfile.globalRoles.includes('PATIENT')
      ) {
        db.logAudit({
          userId: validUser.id,
          hospitalId: validUser.activeHospitalId,
          action: 'AUTH_PATIENT_LOGIN_ROLE_REJECTED',
          entityType: 'USER',
          entityId: validUser.id,
          ipAddress: clientIp,
          userAgent: input.deviceInfo ?? null,
          metadata: { actualRoles: meProfile.activeRoles },
        });
        throw ApiError.forbidden(
          'This mobile application is exclusively for patients. Staff members must use the MediCore Web Portal.',
          'PATIENT_ROLE_REQUIRED'
        );
      }

      if (input.role && input.role.trim() !== '' && input.role.trim().toUpperCase() !== 'ANY') {
        const requestedRole = input.role.trim().toUpperCase();
        const hasRole =
          meProfile.globalRoles.includes(requestedRole as RoleCodeType) ||
          meProfile.activeRoles.includes(requestedRole as RoleCodeType) ||
          meProfile.globalRoles.includes('SUPER_ADMIN');

        if (!hasRole) {
          db.logAudit({
            userId: validUser.id,
            hospitalId: validUser.activeHospitalId,
            action: 'AUTH_LOGIN_ROLE_MISMATCH',
            entityType: 'USER',
            entityId: validUser.id,
            ipAddress: clientIp,
            userAgent: input.deviceInfo ?? null,
            metadata: { requestedRole, actualRoles: meProfile.activeRoles },
          });
          throw ApiError.forbidden(
            `Access denied. This account does not possess the required role (${requestedRole}). Please select your correct role or contact your Hospital Administrator.`,
            'ROLE_MISMATCH'
          );
        }
      }

      const tokens = this.issueTokens(validUser, input.deviceInfo, clientIp);

      if (previousFailures > 0 || previousLockouts > 0) {
        db.logAudit({
          userId: validUser.id,
          hospitalId: validUser.activeHospitalId,
          action: 'AUTH_LOGIN_RECOVERED_AFTER_FAILURES',
          entityType: 'USER',
          entityId: validUser.id,
          ipAddress: clientIp,
          userAgent: input.deviceInfo ?? null,
          metadata: {
            previousConsecutiveFailures: previousFailures,
            previousLockoutTier: previousLockouts,
          },
        });
      }

      db.logAudit({
        userId: validUser.id,
        hospitalId: validUser.activeHospitalId,
        action: options.requirePatientRole ? 'AUTH_PATIENT_LOGIN_SUCCESS' : 'AUTH_LOGIN_SUCCESS',
        entityType: 'USER',
        entityId: validUser.id,
        ipAddress: clientIp,
        userAgent: input.deviceInfo ?? null,
        metadata: null,
      });

      return {
        user: meProfile,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      };
    });
  }

  // =========================================================================
  // ANDROID PATIENT EMAIL / PHONE OTP AUTHENTICATION
  // =========================================================================

  private static resolveOtpChannel(
    rawIdentifier: string,
    requestedChannel?: 'PHONE' | 'EMAIL'
  ): { channel: 'PHONE' | 'EMAIL'; normalizedIdentifier: string; maskedDestination: string } {
    const trimmed = rawIdentifier.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (isEmail) {
      if (requestedChannel === 'PHONE') {
        throw ApiError.badRequest('Please enter a valid phone number', 'INVALID_PHONE_NUMBER');
      }
      const lower = trimmed.toLowerCase();
      const [local, domain] = lower.split('@');
      const maskedLocal = local.length <= 2 ? `${local[0] || '*'}*` : `${local.slice(0, 2)}***`;
      return {
        channel: 'EMAIL',
        normalizedIdentifier: lower,
        maskedDestination: `${maskedLocal}@${domain}`,
      };
    }

    if (requestedChannel === 'EMAIL') {
      throw ApiError.badRequest('Please enter a valid email address', 'INVALID_EMAIL_ADDRESS');
    }

    const normalizedPhone = this.normalizePhone(trimmed);
    const digitsOnly = (normalizedPhone || '').replace(/\D/g, '');
    if (!normalizedPhone || digitsOnly.length < 8 || digitsOnly.length > 15) {
      throw ApiError.badRequest(
        'Please enter a valid mobile number or email address',
        'INVALID_IDENTIFIER'
      );
    }

    const tail = digitsOnly.slice(-4);
    const maskedPhone = `${normalizedPhone.startsWith('+') ? '+' : ''}******${tail}`;
    return {
      channel: 'PHONE',
      normalizedIdentifier: normalizedPhone,
      maskedDestination: maskedPhone,
    };
  }

  static async requestPatientOtp(input: {
    emailOrPhone: string;
    channel?: 'PHONE' | 'EMAIL';
    ipAddress?: string;
  }) {
    const { channel, normalizedIdentifier, maskedDestination } = this.resolveOtpChannel(
      input.emailOrPhone,
      input.channel
    );

    const existingUser = this.findUserByIdentifier(normalizedIdentifier);
    if (existingUser) {
      if (!existingUser.isActive) {
        throw ApiError.forbidden('Account has been deactivated', 'ACCOUNT_INACTIVE');
      }
      const meProfile = this.buildMeProfile(existingUser.id);
      if (!meProfile.activeRoles.includes('PATIENT') && !meProfile.globalRoles.includes('PATIENT')) {
        throw ApiError.forbidden(
          'This mobile application is exclusively for patients. Staff members must use the MediCore Web Portal.',
          'PATIENT_ROLE_REQUIRED'
        );
      }
    }

    const cooldownSeconds = this.OTP_RESEND_COOLDOWN_SECONDS;
    const latestActive = Array.from(db.otpLoginChallenges.values())
      .filter((c) => c.identifier === normalizedIdentifier && c.verifiedAt === null)
      .sort((a, b) => b.lastSentAt.getTime() - a.lastSentAt.getTime())[0];

    if (latestActive) {
      const elapsedSec = Math.floor((Date.now() - latestActive.lastSentAt.getTime()) / 1000);
      if (elapsedSec < cooldownSeconds) {
        const retryAfter = cooldownSeconds - elapsedSec;
        throw ApiError.tooManyRequests(
          `Please wait ${retryAfter} seconds before requesting another OTP.`,
          'OTP_RESEND_COOLDOWN'
        );
      }
      latestActive.verifiedAt = new Date();
    }

    const otpCode = generateRandomCode(6);
    const now = new Date();
    const expiresInSeconds = this.OTP_TTL_SECONDS;
    const challengeId = crypto.randomUUID();

    db.otpLoginChallenges.set(challengeId, {
      id: challengeId,
      identifier: normalizedIdentifier,
      channel,
      tokenHash: sha256Hash(`${normalizedIdentifier}:${otpCode}`),
      attemptCount: 0,
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
      verifiedAt: null,
      createdAt: now,
    });

    let deliveryConfigured = false;
    let delivered = false;
    let devOtpPreview: string | undefined;

    if (channel === 'EMAIL') {
      const emailDelivery = await EmailDeliveryService.sendTransactionalEmail({
        to: normalizedIdentifier,
        subject: 'MediCore One-Time Login Code',
        text: `Your MediCore patient sign-in code is ${otpCode}. It expires in 10 minutes. Never share this code with anyone.`,
        purpose: 'PATIENT_OTP_LOGIN',
      });
      deliveryConfigured = emailDelivery.configured;
      delivered = emailDelivery.delivered;
      if (!delivered && (process.env.NODE_ENV || env.NODE_ENV).toLowerCase() === 'development') {
        devOtpPreview = otpCode;
      }
    } else {
      const smsDelivery = await SmsOtpDeliveryService.sendOtp({
        to: normalizedIdentifier,
        otpCode,
        purpose: 'LOGIN',
        expiresInSeconds,
      });
      deliveryConfigured = smsDelivery.configured || Boolean(process.env.SMS_PROVIDER_API_KEY);
      delivered = smsDelivery.delivered || Boolean(process.env.SMS_PROVIDER_API_KEY);
      devOtpPreview = smsDelivery.devOtpPreview;
    }

    db.logAudit({
      userId: existingUser?.id ?? null,
      hospitalId: existingUser?.activeHospitalId ?? null,
      action: 'AUTH_PATIENT_OTP_REQUESTED',
      entityType: 'OTP_CHALLENGE',
      entityId: challengeId,
      ipAddress: input.ipAddress ?? null,
      userAgent: null,
      metadata: {
        channel,
        maskedDestination,
        deliveryConfigured,
        delivered,
      },
    });

    return {
      otpSent: true,
      channel,
      maskedDestination,
      expiresInSeconds,
      cooldownSeconds,
      deliveryConfigured,
      ...(devOtpPreview ? { devOtpPreview } : {}),
      message:
        channel === 'PHONE'
          ? `A 6-digit verification code has been issued for ${maskedDestination}.`
          : `A 6-digit verification code has been sent to ${maskedDestination}.`,
    };
  }

  static async verifyPatientOtp(input: {
    emailOrPhone: string;
    otpCode: string;
    channel?: 'PHONE' | 'EMAIL';
    deviceInfo?: string;
    ipAddress?: string;
  }) {
    const { channel, normalizedIdentifier, maskedDestination } = this.resolveOtpChannel(
      input.emailOrPhone,
      input.channel
    );

    const latestActive = Array.from(db.otpLoginChallenges.values())
      .filter((c) => c.identifier === normalizedIdentifier && c.verifiedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!latestActive || latestActive.expiresAt.getTime() <= Date.now()) {
      securityStore.metrics.authFailures += 1;
      throw ApiError.unauthorized('Invalid or expired verification code', 'INVALID_OR_EXPIRED_OTP');
    }

    if (latestActive.attemptCount >= env.MAX_OTP_ATTEMPTS) {
      latestActive.verifiedAt = new Date();
      securityStore.metrics.authFailures += 1;
      throw ApiError.tooManyRequests(
        'Maximum OTP verification attempts exceeded. Please request a new code.',
        'OTP_MAX_ATTEMPTS_EXCEEDED'
      );
    }

    const expectedHash = sha256Hash(`${normalizedIdentifier}:${input.otpCode.trim()}`);
    if (!this.safeHashEquals(latestActive.tokenHash, expectedHash)) {
      latestActive.attemptCount += 1;
      if (latestActive.attemptCount >= env.MAX_OTP_ATTEMPTS) {
        latestActive.verifiedAt = new Date();
      }
      securityStore.metrics.authFailures += 1;
      throw ApiError.unauthorized('Invalid or expired verification code', 'INVALID_OR_EXPIRED_OTP');
    }

    latestActive.verifiedAt = new Date();

    let user = this.findUserByIdentifier(normalizedIdentifier);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const now = new Date();
      const placeholderEmail =
        channel === 'EMAIL'
          ? normalizedIdentifier
          : `patient.${normalizedIdentifier.replace(/\D/g, '')}@otp.medicore.local`;

      user = await withTransaction(async () => {
        const newUser: DbUser = {
          id: crypto.randomUUID(),
          fullName: '',
          email: placeholderEmail,
          phone: channel === 'PHONE' ? normalizedIdentifier : null,
          passwordHash: null,
          isEmailVerified: channel === 'EMAIL',
          isPhoneVerified: channel === 'PHONE',
          isActive: true,
          activeHospitalId: null,
          createdAt: now,
          updatedAt: now,
        };
        db.users.set(newUser.id, newUser);

        const globalRoleId = crypto.randomUUID();
        db.userRoles.set(globalRoleId, {
          id: globalRoleId,
          userId: newUser.id,
          roleCode: 'PATIENT',
          hospitalId: null,
          membershipId: null,
          assignedAt: now,
        });

        const patientId = crypto.randomUUID();
        db.patientProfiles.set(patientId, {
          id: patientId,
          userId: newUser.id,
          globalPatientId: `MC-PAT-${newUser.id.slice(0, 8).toUpperCase()}`,
          dateOfBirth: null,
          gender: null,
          onboardingCompleted: false,
          termsAcceptedAt: now,
          healthConsentGranted: false,
          healthConsentAt: null,
          profileCompletionPercent: 10,
          createdAt: now,
          updatedAt: now,
        });

        return newUser;
      });
    } else {
      if (!user.isActive) {
        throw ApiError.forbidden('Account has been deactivated', 'ACCOUNT_INACTIVE');
      }
      if (channel === 'EMAIL' && !user.isEmailVerified) {
        user.isEmailVerified = true;
        user.updatedAt = new Date();
      }
      if (channel === 'PHONE' && !user.isPhoneVerified) {
        user.isPhoneVerified = true;
        user.updatedAt = new Date();
      }
    }

    const meProfile = this.buildMeProfile(user.id);
    if (!meProfile.activeRoles.includes('PATIENT') && !meProfile.globalRoles.includes('PATIENT')) {
      throw ApiError.forbidden(
        'This mobile application is exclusively for patients. Staff members must use the MediCore Web Portal.',
        'PATIENT_ROLE_REQUIRED'
      );
    }

    const tokens = this.issueTokens(user, input.deviceInfo, input.ipAddress);

    db.logAudit({
      userId: user.id,
      hospitalId: user.activeHospitalId,
      action: 'AUTH_PATIENT_OTP_LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.deviceInfo ?? null,
      metadata: { channel, maskedDestination, isNewUser },
    });

    return {
      user: meProfile,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      isNewUser,
    };
  }

  // =========================================================================
  // TOKEN ROTATION, LOGOUT, PASSWORD RESET & EMAIL VERIFICATION
  // =========================================================================

  static async refresh(rawRefreshToken: string, ipAddress?: string) {
    const payload = verifyRefreshToken(rawRefreshToken);
    const tokenHash = sha256Hash(rawRefreshToken);

    const storedToken = db.refreshTokens.get(payload.jti);
    if (!storedToken || storedToken.tokenHash !== tokenHash) {
      throw ApiError.unauthorized('Refresh token not recognized', 'INVALID_REFRESH_TOKEN');
    }

    if (storedToken.revokedAt !== null) {
      for (const rt of db.refreshTokens.values()) {
        if (rt.familyId === storedToken.familyId && rt.revokedAt === null) {
          rt.revokedAt = new Date();
        }
      }
      db.logAudit({
        userId: storedToken.userId,
        hospitalId: null,
        action: 'AUTH_REFRESH_REUSE_DETECTED',
        entityType: 'REFRESH_TOKEN',
        entityId: storedToken.id,
        ipAddress: ipAddress ?? null,
        userAgent: null,
        metadata: { familyId: storedToken.familyId },
      });
      throw ApiError.unauthorized(
        'Refresh token has already been used or revoked',
        'TOKEN_REUSE_DETECTED'
      );
    }

    if (storedToken.expiresAt.getTime() < Date.now()) {
      storedToken.revokedAt = new Date();
      throw ApiError.unauthorized('Refresh token has expired', 'REFRESH_TOKEN_EXPIRED');
    }

    const user = db.users.get(storedToken.userId);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('User is inactive or does not exist');
    }

    const now = new Date();
    storedToken.lastUsedAt = now;
    storedToken.revokedAt = now;
    const rotated = this.issueTokens(
      user,
      storedToken.deviceInfo ?? undefined,
      ipAddress,
      storedToken.familyId
    );
    storedToken.replacedByTokenId = rotated.refreshTokenId;

    return {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: rotated.expiresIn,
      user: this.buildMeProfile(user.id),
    };
  }

  static async logout(userId: string, rawRefreshToken?: string) {
    if (rawRefreshToken) {
      const tokenHash = sha256Hash(rawRefreshToken);
      for (const rt of db.refreshTokens.values()) {
        if (rt.tokenHash === tokenHash && rt.userId === userId) {
          rt.revokedAt = new Date();
        }
      }
    } else {
      for (const rt of db.refreshTokens.values()) {
        if (rt.userId === userId && rt.revokedAt === null) {
          rt.revokedAt = new Date();
        }
      }
    }

    db.logAudit({
      userId,
      hospitalId: null,
      action: 'AUTH_LOGOUT',
      entityType: 'USER',
      entityId: userId,
      ipAddress: null,
      userAgent: null,
      metadata: null,
    });

    return { loggedOut: true };
  }

  static async logoutAll(userId: string) {
    let revokedTokens = 0;
    for (const rt of db.refreshTokens.values()) {
      if (rt.userId === userId && rt.revokedAt === null) {
        rt.revokedAt = new Date();
        revokedTokens += 1;
      }
    }
    for (const dev of securityStore.devices.values()) {
      if (dev.userId === userId && dev.sessionStatus === 'ACTIVE') {
        dev.sessionStatus = 'REVOKED';
        dev.revokedAt = new Date().toISOString();
      }
    }

    db.logAudit({
      userId,
      hospitalId: null,
      action: 'AUTH_LOGOUT_ALL',
      entityType: 'USER',
      entityId: userId,
      ipAddress: null,
      userAgent: null,
      metadata: { revokedTokens },
    });

    return { loggedOutAll: true, revokedSessions: revokedTokens };
  }

  static async forgotPassword(emailOrPhone: string) {
    const user = this.findUserByIdentifier(emailOrPhone);
    const configured = EmailDeliveryService.isConfigured();

    if (!user) {
      return {
        requested: true,
        emailDeliveryConfigured: configured,
        message: configured
          ? 'If an account matches that identifier, a 6-digit password reset code has been sent.'
          : 'If an account matches that identifier, password reset requires email delivery configuration on the server.',
      };
    }

    const otpCode = generateRandomCode(6);
    const resetId = crypto.randomUUID();

    for (const pr of db.passwordResets.values()) {
      if (pr.userId === user.id && pr.usedAt === null) {
        pr.usedAt = new Date();
      }
    }

    db.passwordResets.set(resetId, {
      id: resetId,
      userId: user.id,
      tokenHash: sha256Hash(`${user.id}:${otpCode}`),
      otpCode,
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    });

    const delivery = await EmailDeliveryService.sendTransactionalEmail({
      to: user.email,
      subject: 'MediCore Password Reset Code',
      text: `Your MediCore password reset code is ${otpCode}. It expires in 15 minutes.`,
      purpose: 'PASSWORD_RESET',
    });

    db.logAudit({
      userId: user.id,
      hospitalId: user.activeHospitalId,
      action: 'AUTH_FORGOT_PASSWORD_REQUESTED',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: null,
      userAgent: null,
      metadata: { emailDeliveryConfigured: delivery.configured, delivered: delivery.delivered },
    });

    return {
      requested: true,
      emailDeliveryConfigured: delivery.configured,
      emailSent: delivery.delivered,
      message: delivery.configured
        ? 'If an account matches that identifier, a 6-digit password reset code has been sent.'
        : 'Password reset email cannot be sent because email delivery is not configured on the server.',
    };
  }

  static async resetPassword(input: { emailOrPhone: string; otpCode: string; newPassword: string }) {
    const user = this.findUserByIdentifier(input.emailOrPhone);

    if (!user) {
      throw ApiError.badRequest('Invalid reset code or account identifier', 'INVALID_RESET_CODE');
    }

    const latestActive = Array.from(db.passwordResets.values())
      .filter((r) => r.userId === user.id && r.usedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!latestActive || latestActive.expiresAt.getTime() <= Date.now()) {
      throw ApiError.badRequest('Invalid or expired OTP reset code', 'INVALID_OR_EXPIRED_OTP');
    }

    if (latestActive.attemptCount >= env.MAX_OTP_ATTEMPTS) {
      latestActive.usedAt = new Date();
      throw ApiError.tooManyRequests(
        'Maximum verification attempts exceeded. Please request a new reset code.',
        'OTP_MAX_ATTEMPTS_EXCEEDED'
      );
    }

    const expectedHash = sha256Hash(`${user.id}:${input.otpCode.trim()}`);
    if (!this.safeHashEquals(latestActive.tokenHash, expectedHash)) {
      latestActive.attemptCount += 1;
      if (latestActive.attemptCount >= env.MAX_OTP_ATTEMPTS) {
        latestActive.usedAt = new Date();
      }
      throw ApiError.badRequest('Invalid or expired OTP reset code', 'INVALID_OR_EXPIRED_OTP');
    }

    latestActive.usedAt = new Date();
    user.passwordHash = await hashPassword(input.newPassword);
    user.updatedAt = new Date();

    for (const rt of db.refreshTokens.values()) {
      if (rt.userId === user.id && rt.revokedAt === null) {
        rt.revokedAt = new Date();
      }
    }
    for (const dev of securityStore.devices.values()) {
      if (dev.userId === user.id && dev.sessionStatus === 'ACTIVE') {
        dev.sessionStatus = 'REVOKED';
        dev.revokedAt = new Date().toISOString();
      }
    }

    db.logAudit({
      userId: user.id,
      hospitalId: user.activeHospitalId,
      action: 'AUTH_PASSWORD_RESET_COMPLETED',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: null,
      userAgent: null,
      metadata: null,
    });

    return { reset: true };
  }

  static async verifyEmail(input: { email: string; code: string }) {
    const user = Array.from(db.users.values()).find(
      (u) => u.email.toLowerCase() === input.email.toLowerCase().trim()
    );
    if (!user) {
      throw ApiError.notFound('Account not found');
    }

    const latestActive = Array.from(db.emailVerifications.values())
      .filter((ev) => ev.userId === user.id && ev.verifiedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!latestActive || latestActive.expiresAt.getTime() <= Date.now()) {
      throw ApiError.badRequest('Invalid or expired verification code', 'INVALID_VERIFICATION_CODE');
    }

    if (latestActive.attemptCount >= env.MAX_OTP_ATTEMPTS) {
      throw ApiError.tooManyRequests(
        'Maximum verification attempts exceeded. Please request a new verification code.',
        'OTP_MAX_ATTEMPTS_EXCEEDED'
      );
    }

    const expectedHash = sha256Hash(`${user.id}:${input.code.trim()}`);
    if (!this.safeHashEquals(latestActive.tokenHash, expectedHash)) {
      latestActive.attemptCount += 1;
      throw ApiError.badRequest('Invalid or expired verification code', 'INVALID_VERIFICATION_CODE');
    }

    latestActive.verifiedAt = new Date();
    user.isEmailVerified = true;
    user.updatedAt = new Date();

    db.logAudit({
      userId: user.id,
      hospitalId: user.activeHospitalId,
      action: 'AUTH_EMAIL_VERIFIED',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: null,
      userAgent: null,
      metadata: null,
    });

    return { verified: true, user: this.buildMeProfile(user.id) };
  }

  static async resendVerification(email: string) {
    const user = Array.from(db.users.values()).find(
      (u) => u.email.toLowerCase() === email.toLowerCase().trim()
    );
    if (!user) {
      return {
        sent: false,
        emailDeliveryConfigured: EmailDeliveryService.isConfigured(),
        message: 'If an unverified account exists for this email, a verification code will be sent.',
      };
    }

    if (user.isEmailVerified) {
      return {
        sent: false,
        alreadyVerified: true,
        emailDeliveryConfigured: EmailDeliveryService.isConfigured(),
        message: 'Email address is already verified.',
      };
    }

    const latest = Array.from(db.emailVerifications.values())
      .filter((ev) => ev.userId === user.id && ev.verifiedAt === null)
      .sort((a, b) => b.lastSentAt.getTime() - a.lastSentAt.getTime())[0];

    if (latest) {
      const elapsedSec = Math.floor((Date.now() - latest.lastSentAt.getTime()) / 1000);
      if (elapsedSec < env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS) {
        const retryAfter = env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS - elapsedSec;
        throw ApiError.tooManyRequests(
          `Please wait ${retryAfter} seconds before requesting another verification code.`,
          'RESEND_COOLDOWN_ACTIVE'
        );
      }
      latest.verifiedAt = new Date();
    }

    if (!EmailDeliveryService.isConfigured()) {
      throw new ApiError(
        503,
        'EMAIL_PROVIDER_NOT_CONFIGURED',
        'Email verification could not be sent because SMTP email delivery is not configured on the server.'
      );
    }

    const code = generateRandomCode(6);
    const now = new Date();
    const id = crypto.randomUUID();
    db.emailVerifications.set(id, {
      id,
      userId: user.id,
      tokenHash: sha256Hash(`${user.id}:${code}`),
      code,
      attemptCount: 0,
      lastSentAt: now,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      verifiedAt: null,
      createdAt: now,
    });

    const delivery = await EmailDeliveryService.sendTransactionalEmail({
      to: user.email,
      subject: 'MediCore Email Verification Code',
      text: `Your MediCore email verification code is ${code}. It expires in 24 hours.`,
      purpose: 'EMAIL_VERIFICATION',
    });

    if (!delivery.delivered) {
      throw new ApiError(503, delivery.errorCode || 'EMAIL_DELIVERY_FAILED', delivery.message);
    }

    db.logAudit({
      userId: user.id,
      hospitalId: null,
      action: 'AUTH_EMAIL_VERIFICATION_RESENT',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: null,
      userAgent: null,
      metadata: { provider: delivery.provider },
    });

    return {
      sent: true,
      emailDeliveryConfigured: true,
      cooldownSeconds: env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      message: 'Verification code dispatched to your email address.',
    };
  }

  static issueTokens(
    user: DbUser,
    deviceInfo?: string,
    ipAddress?: string,
    existingFamilyId?: string
  ) {
    const familyId = existingFamilyId ?? crypto.randomUUID();
    const tokenId = crypto.randomUUID();

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      activeHospitalId: user.activeHospitalId,
    });

    const refreshToken = signRefreshToken({
      sub: user.id,
      jti: tokenId,
      familyId,
    });

    const expiresAt = new Date(
      Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000
    );

    db.refreshTokens.set(tokenId, {
      id: tokenId,
      userId: user.id,
      tokenHash: sha256Hash(refreshToken),
      familyId,
      replacedByTokenId: null,
      deviceInfo: deviceInfo ?? null,
      ipAddress: ipAddress ?? null,
      lastUsedAt: null,
      expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenId: tokenId,
      expiresIn: 900,
    };
  }

  static buildMeProfile(userId: string) {
    const user = db.users.get(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const userRoles = Array.from(db.userRoles.values()).filter((ur) => ur.userId === user.id);
    const globalRoles = userRoles.filter((ur) => ur.hospitalId === null).map((ur) => ur.roleCode);

    const memberships = Array.from(db.memberships.values())
      .filter((m) => m.userId === user.id)
      .map((m) => {
        const hospital = db.hospitals.get(m.hospitalId);
        const rolesForHospital = userRoles
          .filter((ur) => ur.hospitalId === m.hospitalId)
          .map((ur) => ur.roleCode);
        return {
          membershipId: m.id,
          hospitalId: m.hospitalId,
          hospitalName: hospital?.name ?? 'Unknown Hospital',
          hospitalCity: hospital?.city ?? '',
          hospitalCategory: hospital?.category ?? '',
          hospitalStatus: hospital?.status ?? 'PENDING',
          department: m.department,
          status: m.status,
          roles: rolesForHospital,
          joinedAt: m.joinedAt.toISOString(),
        };
      });

    const activeMembership = memberships.find(
      (m) => m.hospitalId === user.activeHospitalId && m.status === 'ACTIVE'
    );

    const activeRoles: RoleCodeType[] = Array.from(
      new Set([...globalRoles, ...(activeMembership?.roles ?? [])])
    );

    const permissions = RolesService.getPermissionsForRoles(activeRoles);
    const patientProfile = Array.from(db.patientProfiles.values()).find(
      (p) => p.userId === user.id
    );
    const mfaConfig = securityStore.mfaSecrets.get(user.id);
    const mfaEligible = activeRoles.some((r) => PRIVILEGED_MFA_ROLES.has(r));

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: Boolean(user.isPhoneVerified),
      isActive: user.isActive,
      mfaEnabled: Boolean(mfaConfig?.isEnabled),
      mfaEligible,
      activeHospitalId: user.activeHospitalId,
      onboardingCompleted: patientProfile?.onboardingCompleted ?? false,
      profileCompletionPercent: patientProfile?.profileCompletionPercent ?? 0,
      globalRoles,
      activeRoles,
      permissions,
      memberships,
    };
  }
}
