import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.middleware';
import { messagingRateLimiter } from '../../middleware/rateLimit.middleware';
import { SecurityAndNotificationService, securityStore, StructuredLogger } from './security.service';
import { ApiError } from '../../utils/errors';
import { getParam } from '../../utils/params';

const router = Router();

// MFA Endpoints
router.get('/security/mfa/status', authenticate, (req, res) => {
  const data = SecurityAndNotificationService.getMfaStatus(req.auth!.userId);
  res.json({ success: true, data });
});

router.post('/security/mfa/setup', authenticate, (req, res) => {
  const data = SecurityAndNotificationService.setupMfa(req.auth!.userId);
  res.json({ success: true, data });
});

router.post('/security/mfa/verify', authenticate, (req, res, next) => {
  try {
    const data = SecurityAndNotificationService.verifyAndEnableMfa(req.auth!.userId, req.body.totpCode);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/security/mfa/disable', authenticate, (req, res, next) => {
  try {
    const data = SecurityAndNotificationService.disableMfa(req.auth!.userId, req.body.totpCode);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Device & Session Management Endpoints
router.get('/security/devices', authenticate, (req, res) => {
  const data = SecurityAndNotificationService.listUserDevices(req.auth!.userId);
  res.json({ success: true, data });
});

router.post('/security/devices/register', authenticate, (req, res) => {
  const data = SecurityAndNotificationService.registerDevice(req.auth!.userId, {
    deviceName: typeof req.body?.deviceName === 'string' ? req.body.deviceName : 'Android Device',
    platform: req.body?.platform,
    ipAddress: req.ip || '127.0.0.1',
  });
  res.status(201).json({ success: true, data });
});

router.post('/security/devices/:id/revoke', authenticate, (req, res, next) => {
  try {
    const data = SecurityAndNotificationService.revokeDeviceSession(req.auth!.userId, getParam(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/security/devices/logout-all', authenticate, (req, res) => {
  const data = SecurityAndNotificationService.logoutAllDevices(req.auth!.userId);
  res.json({ success: true, data });
});

// Notification Preferences & Outbox History Endpoints
router.get('/notifications/preferences', authenticate, (req, res) => {
  const data = SecurityAndNotificationService.getNotificationPreferences(req.auth!.userId);
  res.json({ success: true, data });
});

router.put('/notifications/preferences', authenticate, (req, res) => {
  const data = SecurityAndNotificationService.updateNotificationPreferences(req.auth!.userId, req.body);
  res.json({ success: true, data });
});

router.get('/notifications', authenticate, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const category = typeof req.query.category === 'string' ? req.query.category.toUpperCase() : 'ALL';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ALL';
  const headerHospitalId = req.headers['x-hospital-id'];
  const hospitalId = (typeof headerHospitalId === 'string' && headerHospitalId.trim()) || req.auth?.activeHospitalId || null;
  const isStaff = Boolean(
    req.auth?.globalRoles.includes('SUPER_ADMIN') ||
      (req.auth?.hospitalRoles && req.auth.hospitalRoles.length > 0 && !req.auth.hospitalRoles.includes('PATIENT'))
  );

  let all = Array.from(securityStore.outbox.values()).filter((n) => {
    if (n.recipientUserId === req.auth!.userId) return true;
    if (isStaff && hospitalId && n.hospitalId === hospitalId) return true;
    return false;
  });

  if (category && category !== 'ALL') {
    all = all.filter((n) => n.category === category);
  }
  if (statusFilter === 'UNREAD') {
    all = all.filter((n) => !n.readAt && n.status !== 'READ');
  } else if (statusFilter === 'READ') {
    all = all.filter((n) => Boolean(n.readAt) || n.status === 'READ');
  }

  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const unreadCount = all.filter((n) => !n.readAt && n.status !== 'READ').length;
  const offset = (page - 1) * limit;
  res.json({
    success: true,
    data: all.slice(offset, offset + limit),
    meta: {
      page,
      limit,
      total: all.length,
      unreadCount,
      providerIntegration: {
        inAppOutbox: 'ACTIVE',
        pushProviderConfigured: false,
        emailProviderConfigured: Boolean(process.env.SMTP_HOST),
        smsProviderConfigured: Boolean(process.env.SMS_PROVIDER),
      },
    },
  });
});

const markNotificationReadHandler = (req: any, res: any, next: any) => {
  try {
    const notif = securityStore.outbox.get(getParam(req.params.id));
    const headerHospitalId = req.headers['x-hospital-id'];
    const hospitalId = (typeof headerHospitalId === 'string' && headerHospitalId.trim()) || req.auth?.activeHospitalId || null;
    const isAuthorized =
      notif &&
      (notif.recipientUserId === req.auth!.userId ||
        (hospitalId && notif.hospitalId === hospitalId) ||
        req.auth?.globalRoles.includes('SUPER_ADMIN'));
    if (!notif || !isAuthorized) {
      throw ApiError.notFound('Notification not found');
    }
    notif.status = 'READ';
    notif.readAt = notif.readAt ?? new Date().toISOString();
    res.json({ success: true, data: notif });
  } catch (err) {
    next(err);
  }
};

router.post('/notifications/:id/read', authenticate, markNotificationReadHandler);
router.patch('/notifications/:id/read', authenticate, markNotificationReadHandler);

router.post('/notifications/read-all', authenticate, (req, res) => {
  const headerHospitalId = req.headers['x-hospital-id'];
  const hospitalId = (typeof headerHospitalId === 'string' && headerHospitalId.trim()) || req.auth?.activeHospitalId || null;
  const now = new Date().toISOString();
  let updatedCount = 0;
  for (const notif of securityStore.outbox.values()) {
    if (notif.recipientUserId === req.auth!.userId || (hospitalId && notif.hospitalId === hospitalId)) {
      if (notif.status !== 'READ' || !notif.readAt) {
        notif.status = 'READ';
        notif.readAt = now;
        updatedCount += 1;
      }
    }
  }
  res.json({ success: true, data: { updatedCount, readAt: now } });
});

// Dispatch notifications — prevent patients from spoofing notifications to other users
router.post('/notifications/dispatch', authenticate, messagingRateLimiter, (req, res, next) => {
  try {
    const targetRecipient = req.body?.recipientUserId || req.auth!.userId;
    const isPrivilegedStaff = Boolean(
      req.auth?.globalRoles.includes('SUPER_ADMIN') ||
        req.auth?.hospitalRoles.some((r) => ['HOSPITAL_ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE', 'LAB_TECHNICIAN'].includes(r))
    );
    if (targetRecipient !== req.auth!.userId && !isPrivilegedStaff) {
      throw ApiError.forbidden('You can only dispatch test notifications to your own account', 'NOTIFICATION_DISPATCH_FORBIDDEN');
    }
    const data = SecurityAndNotificationService.enqueueOutboxNotification({
      ...req.body,
      recipientUserId: targetRecipient,
      hospitalId: (req.headers['x-hospital-id'] as string) || req.auth?.activeHospitalId,
    });
    res.status(data.duplicatePrevented ? 200 : 201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Provider-based Email & SMS Dispatch (Authorized Staff / Admin Only)
router.post(
  '/messaging/send',
  authenticate,
  messagingRateLimiter,
  requireRoles('HOSPITAL_ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const data = await SecurityAndNotificationService.sendEmailOrSms(req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// Protected Operational Diagnostics & Backup Status (SUPER_ADMIN only)
router.get('/observability/diagnostics', authenticate, requireRoles('SUPER_ADMIN'), (_req, res) => {
  res.json({
    success: true,
    data: {
      metrics: securityStore.metrics,
      structuredLogRedactionActive: true,
      sampleRedactedLog: StructuredLogger.sanitizePayload({
        event: 'USER_LOGIN_ATTEMPT',
        email: 'doctor@medicore.in',
        password: '[SAMPLE_INPUT]',
        accessToken: '[SAMPLE_TOKEN]',
        diagnosisName: '[SAMPLE_PHI]',
      }),
    },
  });
});

export default router;
