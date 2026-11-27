import crypto from 'crypto';
import { Router } from 'express';
import { HospitalsController } from './hospitals.controller';
import { authenticate, requireRoles } from '../../middleware/auth.middleware';
import { UsersController } from '../users/users.controller';
import { db } from '../../database/prisma';
import { clinicalStore } from '../clinical/clinical.service';
import { opsStore } from '../operations/operations.service';
import { directoryStore } from '../directory/directory.service';
import { saasStore } from '../saas/saas.service';
import { securityStore } from '../security/security.service';
import { hashPassword, generateRandomCode } from '../../utils/crypto';
import { ApiError } from '../../utils/errors';
import { getParam } from '../../utils/params';
import { EmailDeliveryService } from '../../utils/email';

const router = Router();

// Platform settings state (non-secret branding & operational preferences)
const platformSettingsState = {
  platformName: 'MediCore – Hospital Management System',
  organizationName: 'MediCore Enterprise Healthcare Network',
  supportEmail: 'support@medicore.org',
  securityContactEmail: 'security@medicore.org',
  defaultTimezone: 'Asia/Kolkata',
  defaultCurrency: 'INR',
  maintenanceMode: false,
  maintenanceBannerText: '',
  allowSelfHospitalRegistration: true,
  requireDirectoryVerificationBeforeActivation: true,
  defaultEmailNotifications: true,
  defaultPushNotifications: true,
  defaultSmsNotifications: false,
  updatedAt: new Date().toISOString(),
  updatedByUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

function sanitizeMetadata(meta: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!meta) return null;
  const redactedKeys = ['password', 'passwordHash', 'token', 'accessToken', 'refreshToken', 'secret', 'otp'];
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (redactedKeys.some((rk) => k.toLowerCase().includes(rk.toLowerCase()))) {
      clean[k] = '[REDACTED]';
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

router.use(authenticate, requireRoles('SUPER_ADMIN'));

// ---------------------------------------------------------------------------
// 1. Platform Overview Statistics (Real Backend Counts)
// ---------------------------------------------------------------------------
router.get('/overview', (_req, res) => {
  const hospitals = Array.from(db.hospitals.values());
  const users = Array.from(db.users.values());
  const roles = Array.from(db.userRoles.values());

  const approvedHospitals = hospitals.filter((h) => h.status === 'APPROVED' || h.status === 'ACTIVE').length;
  const pendingHospitals = hospitals.filter((h) => h.status === 'PENDING').length;
  const suspendedHospitals = hospitals.filter((h) => h.status === 'SUSPENDED').length;
  const rejectedHospitals = hospitals.filter((h) => h.status === 'REJECTED').length;
  const inactiveHospitals = pendingHospitals + suspendedHospitals + rejectedHospitals;

  // Distinct patients across db.patientProfiles + clinicalStore.patients + PATIENT role assignments
  const patientUserIds = new Set<string>();
  for (const p of db.patientProfiles.values()) patientUserIds.add(p.userId);
  for (const p of clinicalStore.patients.values()) patientUserIds.add(p.userId || p.id);
  for (const r of roles) {
    if (r.roleCode === 'PATIENT') patientUserIds.add(r.userId);
  }

  // Distinct doctors across clinicalStore.doctors + DOCTOR role assignments
  const doctorUserIds = new Set<string>();
  for (const d of clinicalStore.doctors.values()) doctorUserIds.add(d.userId || d.id);
  for (const r of roles) {
    if (r.roleCode === 'DOCTOR') doctorUserIds.add(r.userId);
  }

  // Distinct hospital staff (HOSPITAL_ADMIN, NURSE, RECEPTIONIST, PHARMACIST, LAB_TECHNICIAN, ACCOUNTANT)
  const staffRoles = new Set(['HOSPITAL_ADMIN', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN', 'ACCOUNTANT']);
  const staffUserIds = new Set<string>();
  for (const r of roles) {
    if (staffRoles.has(r.roleCode)) staffUserIds.add(r.userId);
  }

  const hospitalAdminIds = new Set<string>();
  for (const r of roles) {
    if (r.roleCode === 'HOSPITAL_ADMIN') hospitalAdminIds.add(r.userId);
  }

  const appointments = Array.from(clinicalStore.appointments.values());
  const directoryRecords = Array.from(directoryStore.records.values());

  const recentAuditLogs = db.auditLogs.slice(0, 15).map((log) => {
    const actor = log.userId ? db.users.get(log.userId) : null;
    const hospital = log.hospitalId ? db.hospitals.get(log.hospitalId) : null;
    return {
      ...log,
      actorName: actor?.fullName || (log.userId ? 'Platform User' : 'System'),
      actorEmail: actor?.email || null,
      hospitalName: hospital?.name || null,
      metadata: sanitizeMetadata(log.metadata),
    };
  });

  res.status(200).json({
    success: true,
    data: {
      totalHospitals: hospitals.length,
      activeHospitals: approvedHospitals,
      inactiveHospitals,
      pendingHospitals,
      suspendedHospitals,
      rejectedHospitals,
      directoryHospitalsTotal: directoryRecords.length,
      directoryVerifiedCount: directoryRecords.filter((d) => d.verificationStatus === 'VERIFIED').length,
      totalRegisteredPatients: patientUserIds.size,
      totalDoctors: doctorUserIds.size,
      totalStaff: staffUserIds.size,
      totalHospitalAdmins: hospitalAdminIds.size,
      totalPlatformUsers: users.length,
      activePlatformUsers: users.filter((u) => u.isActive).length,
      totalAppointments: appointments.length,
      completedAppointments: appointments.filter((a) => a.status === 'COMPLETED').length,
      recentAuditLogs,
      lastUpdatedAt: new Date().toISOString(),
    },
  });
});

// ---------------------------------------------------------------------------
// 2. Hospital Management & Detailed Hospital Inspection
// ---------------------------------------------------------------------------
router.get('/hospitals', HospitalsController.adminList);

router.get('/hospitals/:id', (req, res, next) => {
  try {
    const hospitalId = getParam(req.params.id);
    const hospital = db.hospitals.get(hospitalId);
    if (!hospital) {
      throw ApiError.notFound('Hospital not found');
    }

    const memberships = Array.from(db.memberships.values()).filter((m) => m.hospitalId === hospitalId);
    const roles = Array.from(db.userRoles.values()).filter((ur) => ur.hospitalId === hospitalId);

    const administrators = roles
      .filter((r) => r.roleCode === 'HOSPITAL_ADMIN')
      .map((r) => {
        const u = db.users.get(r.userId);
        const m = memberships.find((mem) => mem.userId === r.userId);
        return {
          userId: r.userId,
          membershipId: m?.id || r.membershipId,
          fullName: u?.fullName || 'Unknown Admin',
          email: u?.email || '',
          phone: u?.phone || null,
          isActive: u?.isActive ?? true,
          membershipStatus: m?.status || 'ACTIVE',
          assignedAt: r.assignedAt,
        };
      });

    const doctorsFromStore = Array.from(clinicalStore.doctors.values()).filter((d) => d.hospitalId === hospitalId);
    const staffList = memberships.map((m) => {
      const u = db.users.get(m.userId);
      const memberRoles = roles.filter((r) => r.userId === m.userId).map((r) => r.roleCode);
      return {
        membershipId: m.id,
        userId: m.userId,
        fullName: u?.fullName || 'Unknown Staff',
        email: u?.email || '',
        phone: u?.phone || null,
        department: m.department || 'General',
        employeeCode: m.employeeCode,
        status: m.status,
        isActive: u?.isActive ?? true,
        roles: memberRoles,
        joinedAt: m.joinedAt,
      };
    });

    const patientCount = Array.from(clinicalStore.patients.values()).filter((p) =>
      p.hospitalLinks.some((l) => l.hospitalId === hospitalId)
    ).length;

    const hospitalAppointments = Array.from(clinicalStore.appointments.values()).filter(
      (a) => a.hospitalId === hospitalId
    );

    const recentActivity = db.auditLogs
      .filter((l) => l.hospitalId === hospitalId || l.entityId === hospitalId)
      .slice(0, 20)
      .map((l) => {
        const actor = l.userId ? db.users.get(l.userId) : null;
        return {
          ...l,
          actorName: actor?.fullName || 'System',
          actorEmail: actor?.email || null,
          metadata: sanitizeMetadata(l.metadata),
        };
      });

    res.status(200).json({
      success: true,
      data: {
        hospital,
        administrators,
        doctors: doctorsFromStore,
        staff: staffList,
        statistics: {
          totalDoctors: doctorsFromStore.length + roles.filter((r) => r.roleCode === 'DOCTOR').length,
          totalStaff: staffList.length,
          totalPatients: patientCount,
          totalAppointments: hospitalAppointments.length,
          completedAppointments: hospitalAppointments.filter((a) => a.status === 'COMPLETED').length,
          pendingAppointments: hospitalAppointments.filter((a) => a.status === 'PENDING' || a.status === 'CONFIRMED').length,
        },
        recentActivity,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/hospitals/:id/approve', HospitalsController.adminApprove);
router.post('/hospitals/:id/reject', HospitalsController.adminReject);
router.post('/hospitals/:id/suspend', HospitalsController.adminSuspend);

// ---------------------------------------------------------------------------
// 3. Hospital Administrator Management
// ---------------------------------------------------------------------------
router.get('/administrators', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase().trim() : '';
  const hospitalIdFilter = typeof req.query.hospitalId === 'string' ? req.query.hospitalId.trim() : '';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.toUpperCase().trim() : '';

  const adminRoles = Array.from(db.userRoles.values()).filter((ur) => ur.roleCode === 'HOSPITAL_ADMIN');
  const seenKey = new Set<string>();
  const admins: Array<{
    id: string;
    userId: string;
    membershipId: string | null;
    fullName: string;
    email: string;
    phone: string | null;
    isActive: boolean;
    hospitalId: string | null;
    hospitalName: string;
    hospitalStatus: string;
    membershipStatus: string;
    assignedAt: string;
  }> = [];

  for (const ar of adminRoles) {
    const key = `${ar.userId}:${ar.hospitalId || 'none'}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);

    const user = db.users.get(ar.userId);
    if (!user) continue;
    const hospital = ar.hospitalId ? db.hospitals.get(ar.hospitalId) : null;
    const membership = ar.hospitalId
      ? Array.from(db.memberships.values()).find((m) => m.userId === ar.userId && m.hospitalId === ar.hospitalId)
      : null;

    admins.push({
      id: ar.id,
      userId: user.id,
      membershipId: membership?.id || ar.membershipId || null,
      fullName: user.fullName,
      email: user.email || '',
      phone: user.phone,
      isActive: user.isActive,
      hospitalId: ar.hospitalId,
      hospitalName: hospital?.name || 'Unassigned Hospital',
      hospitalStatus: hospital?.status || 'N/A',
      membershipStatus: membership?.status || 'ACTIVE',
      assignedAt: ar.assignedAt.toISOString(),
    });
  }

  let filtered = admins;
  if (hospitalIdFilter) {
    filtered = filtered.filter((a) => a.hospitalId === hospitalIdFilter);
  }
  if (statusFilter === 'ACTIVE') {
    filtered = filtered.filter((a) => a.isActive && a.membershipStatus === 'ACTIVE');
  } else if (statusFilter === 'INACTIVE') {
    filtered = filtered.filter((a) => !a.isActive || a.membershipStatus !== 'ACTIVE');
  }
  if (search) {
    filtered = filtered.filter(
      (a) =>
        a.fullName.toLowerCase().includes(search) ||
        a.email.toLowerCase().includes(search) ||
        a.hospitalName.toLowerCase().includes(search) ||
        (a.phone && a.phone.includes(search))
    );
  }

  res.status(200).json({
    success: true,
    data: filtered,
  });
});

router.post('/administrators', async (req, res, next) => {
  try {
    const { fullName, email, phone, password, hospitalId } = req.body || {};
    if (!fullName || !email || !hospitalId) {
      throw ApiError.badRequest('Full name, email, and hospitalId are required');
    }
    const hospital = db.hospitals.get(String(hospitalId));
    if (!hospital) {
      throw ApiError.notFound('Target hospital not found');
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    let user = Array.from(db.users.values()).find((u) => u.email && u.email.toLowerCase() === normalizedEmail);
    const now = new Date();

    if (!user) {
      const rawPassword = typeof password === 'string' && password.length >= 8 ? password : `Admin@${generateRandomCode(6)}`;
      const passwordHash = await hashPassword(rawPassword);
      user = {
        id: crypto.randomUUID(),
        fullName: String(fullName).trim(),
        email: normalizedEmail,
        phone: phone ? String(phone).trim() : null,
        passwordHash,
        isEmailVerified: true,
        isPhoneVerified: Boolean(phone),
        isActive: true,
        activeHospitalId: hospital.id,
        createdAt: now,
        updatedAt: now,
      };
      db.users.set(user.id, user);
    } else {
      user.fullName = String(fullName).trim() || user.fullName;
      if (phone) {
        user.phone = String(phone).trim();
        user.isPhoneVerified = true;
      }
      user.activeHospitalId = hospital.id;
      user.isActive = true;
      user.updatedAt = now;
    }

    let membership = Array.from(db.memberships.values()).find(
      (m) => m.userId === user!.id && m.hospitalId === hospital.id
    );
    if (!membership) {
      membership = {
        id: crypto.randomUUID(),
        userId: user.id,
        hospitalId: hospital.id,
        department: 'Hospital Administration',
        employeeCode: `ADM-${generateRandomCode(4)}`,
        status: 'ACTIVE',
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      db.memberships.set(membership.id, membership);
    } else {
      membership.status = 'ACTIVE';
      membership.updatedAt = now;
    }

    let roleAssign = Array.from(db.userRoles.values()).find(
      (ur) => ur.userId === user!.id && ur.hospitalId === hospital.id && ur.roleCode === 'HOSPITAL_ADMIN'
    );
    if (!roleAssign) {
      roleAssign = {
        id: crypto.randomUUID(),
        userId: user.id,
        roleCode: 'HOSPITAL_ADMIN',
        hospitalId: hospital.id,
        membershipId: membership.id,
        assignedAt: now,
      };
      db.userRoles.set(roleAssign.id, roleAssign);
    }

    db.logAudit({
      userId: req.auth!.userId,
      hospitalId: hospital.id,
      action: 'SUPER_ADMIN_HOSPITAL_ADMIN_ASSIGNED',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      metadata: {
        adminEmail: user.email,
        hospitalId: hospital.id,
        hospitalName: hospital.name,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: roleAssign.id,
        userId: user.id,
        membershipId: membership.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        hospitalId: hospital.id,
        hospitalName: hospital.name,
        hospitalStatus: hospital.status,
        membershipStatus: membership.status,
        assignedAt: roleAssign.assignedAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/administrators/:userId', (req, res, next) => {
  try {
    const targetUserId = getParam(req.params.userId);
    const user = db.users.get(targetUserId);
    if (!user) {
      throw ApiError.notFound('Administrator user not found');
    }

    const { fullName, phone, isActive, hospitalId } = req.body || {};
    const now = new Date();

    if (typeof fullName === 'string' && fullName.trim()) {
      user.fullName = fullName.trim();
    }
    if (phone !== undefined) {
      user.phone = phone ? String(phone).trim() : null;
    }
    if (typeof isActive === 'boolean') {
      user.isActive = isActive;
    }
    user.updatedAt = now;

    if (typeof hospitalId === 'string' && hospitalId.trim()) {
      const targetHospital = db.hospitals.get(hospitalId.trim());
      if (!targetHospital) {
        throw ApiError.notFound('Target hospital not found');
      }
      user.activeHospitalId = targetHospital.id;

      let membership = Array.from(db.memberships.values()).find(
        (m) => m.userId === user.id && m.hospitalId === targetHospital.id
      );
      if (!membership) {
        membership = {
          id: crypto.randomUUID(),
          userId: user.id,
          hospitalId: targetHospital.id,
          department: 'Hospital Administration',
          employeeCode: `ADM-${generateRandomCode(4)}`,
          status: 'ACTIVE',
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        db.memberships.set(membership.id, membership);
      }

      const hasRole = Array.from(db.userRoles.values()).some(
        (ur) => ur.userId === user.id && ur.hospitalId === targetHospital.id && ur.roleCode === 'HOSPITAL_ADMIN'
      );
      if (!hasRole) {
        const newRoleId = crypto.randomUUID();
        db.userRoles.set(newRoleId, {
          id: newRoleId,
          userId: user.id,
          roleCode: 'HOSPITAL_ADMIN',
          hospitalId: targetHospital.id,
          membershipId: membership.id,
          assignedAt: now,
        });
      }
    }

    db.logAudit({
      userId: req.auth!.userId,
      hospitalId: user.activeHospitalId,
      action: 'SUPER_ADMIN_HOSPITAL_ADMIN_UPDATED',
      entityType: 'USER',
      entityId: user.id,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      metadata: {
        updatedFields: Object.keys(req.body || {}),
        isActive: user.isActive,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        activeHospitalId: user.activeHospitalId,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 4. Platform Users Management
// ---------------------------------------------------------------------------
router.get('/users', UsersController.listUsers);
router.patch('/users/:id/status', UsersController.updateStatus);

// ---------------------------------------------------------------------------
// 5. Platform Analytics (Time-range aware from real backend records)
// ---------------------------------------------------------------------------
router.get('/analytics', (req, res) => {
  const range = typeof req.query.range === 'string' ? req.query.range : '30d';
  const now = Date.now();
  const rangeMsMap: Record<string, number> = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
    '12m': 365 * 24 * 60 * 60 * 1000,
  };
  const windowMs = rangeMsMap[range] || rangeMsMap['30d'];
  const cutoffTime = now - windowMs;

  const hospitals = Array.from(db.hospitals.values());
  const users = Array.from(db.users.values());
  const roles = Array.from(db.userRoles.values());
  const appointments = Array.from(clinicalStore.appointments.values());
  const patients = Array.from(clinicalStore.patients.values());

  // Role distribution across platform
  const roleCounts: Record<string, number> = {};
  for (const r of roles) {
    roleCounts[r.roleCode] = (roleCounts[r.roleCode] || 0) + 1;
  }

  // Hospital status breakdown
  const hospitalStatusBreakdown = {
    APPROVED: hospitals.filter((h) => h.status === 'APPROVED' || h.status === 'ACTIVE').length,
    PENDING: hospitals.filter((h) => h.status === 'PENDING').length,
    SUSPENDED: hospitals.filter((h) => h.status === 'SUSPENDED').length,
    REJECTED: hospitals.filter((h) => h.status === 'REJECTED').length,
  };

  // Hospital activity distribution
  const hospitalActivityDistribution = hospitals.map((h) => {
    const hospApts = appointments.filter((a) => a.hospitalId === h.id).length;
    const hospPatients = patients.filter((p) => p.hospitalLinks.some((l) => l.hospitalId === h.id)).length;
    const hospStaff = Array.from(db.memberships.values()).filter((m) => m.hospitalId === h.id).length;
    return {
      hospitalId: h.id,
      hospitalName: h.name,
      city: h.city,
      status: h.status,
      patientsCount: hospPatients,
      appointmentsCount: hospApts,
      staffCount: hospStaff,
    };
  });

  const hospitalsInWindow = hospitals.filter((h) => h.createdAt.getTime() >= cutoffTime).length;
  const usersInWindow = users.filter((u) => u.createdAt.getTime() >= cutoffTime).length;

  res.status(200).json({
    success: true,
    data: {
      range,
      windowStart: new Date(cutoffTime).toISOString(),
      windowEnd: new Date(now).toISOString(),
      summary: {
        totalHospitals: hospitals.length,
        hospitalsRegisteredInRange: hospitalsInWindow,
        totalUsers: users.length,
        usersRegisteredInRange: usersInWindow,
        totalPatients: patients.length + db.patientProfiles.size,
        totalAppointments: appointments.length,
        totalAuditEvents: db.auditLogs.filter((l) => l.createdAt.getTime() >= cutoffTime).length,
      },
      roleDistribution: Object.entries(roleCounts).map(([role, count]) => ({ role, count })),
      hospitalStatusBreakdown,
      hospitalActivityDistribution,
    },
  });
});

// ---------------------------------------------------------------------------
// 6. Platform Activity & Audit Logs
// ---------------------------------------------------------------------------
router.get('/audit-logs', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase().trim() : '';
  const actionFilter = typeof req.query.action === 'string' ? req.query.action.toUpperCase().trim() : '';
  const entityFilter = typeof req.query.entityType === 'string' ? req.query.entityType.toUpperCase().trim() : '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  let logs = db.auditLogs.map((l) => {
    const actor = l.userId ? db.users.get(l.userId) : null;
    const hospital = l.hospitalId ? db.hospitals.get(l.hospitalId) : null;
    return {
      id: l.id,
      userId: l.userId,
      actorName: actor?.fullName || (l.userId ? 'Platform User' : 'System Process'),
      actorEmail: actor?.email || null,
      hospitalId: l.hospitalId,
      hospitalName: hospital?.name || null,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      ipAddress: l.ipAddress,
      metadata: sanitizeMetadata(l.metadata),
      createdAt: l.createdAt.toISOString(),
    };
  });

  if (actionFilter && actionFilter !== 'ALL') {
    logs = logs.filter((l) => l.action.toUpperCase().includes(actionFilter));
  }
  if (entityFilter && entityFilter !== 'ALL') {
    logs = logs.filter((l) => l.entityType.toUpperCase() === entityFilter);
  }
  if (search) {
    logs = logs.filter(
      (l) =>
        l.action.toLowerCase().includes(search) ||
        l.entityType.toLowerCase().includes(search) ||
        l.actorName.toLowerCase().includes(search) ||
        (l.actorEmail && l.actorEmail.toLowerCase().includes(search)) ||
        (l.hospitalName && l.hospitalName.toLowerCase().includes(search))
    );
  }

  const total = logs.length;
  const paged = logs.slice((page - 1) * limit, page * limit);

  res.status(200).json({
    success: true,
    data: paged,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

// ---------------------------------------------------------------------------
// 7. Platform Announcements & Notifications
// ---------------------------------------------------------------------------
router.get('/announcements', (req, res) => {
  const userNotifications = Array.from(securityStore.outbox.values()).filter(
    (n) => n.recipientUserId === req.auth!.userId || n.category === 'SYSTEM'
  );
  res.status(200).json({
    success: true,
    data: {
      announcements: saasStore.announcements,
      notifications: userNotifications,
      deliveryCapabilities: {
        inAppNotificationStore: 'ACTIVE',
        emailProvider: EmailDeliveryService.isConfigured()
          ? EmailDeliveryService.getActiveProviderName()
          : 'SIMULATED_LOCAL_OUTBOX',
        smsProvider: process.env.SMS_PROVIDER ? 'CONFIGURED' : 'SIMULATED_LOCAL_OUTBOX',
      },
    },
  });
});

router.post('/announcements', (req, res, next) => {
  try {
    const { title, body, category, targetScope } = req.body || {};
    if (!title || !body) {
      throw ApiError.badRequest('Announcement title and body are required');
    }

    const resolvedCategory = (category || 'OPERATIONS_NOTICE') as
      | 'MAINTENANCE'
      | 'FEATURE_RELEASE'
      | 'SECURITY_ADVISORY'
      | 'OPERATIONS_NOTICE';
    const resolvedSeverity: 'INFO' | 'MAINTENANCE' | 'CRITICAL' =
      resolvedCategory === 'MAINTENANCE'
        ? 'MAINTENANCE'
        : resolvedCategory === 'SECURITY_ADVISORY'
        ? 'CRITICAL'
        : 'INFO';

    const announcement = {
      id: crypto.randomUUID(),
      title: String(title).trim(),
      message: String(body).trim(),
      body: String(body).trim(),
      severity: resolvedSeverity,
      category: resolvedCategory,
      targetScope: (targetScope || 'ALL_TENANTS') as 'ALL_TENANTS' | 'ENTERPRISE_ONLY' | 'SPECIFIC_HOSPITAL',
      publishedByUserId: req.auth!.userId,
      publishedAt: new Date().toISOString(),
    };
    saasStore.announcements.unshift(announcement);

    // Queue in-app notification for the Super Admin & hospital admins
    const outboxId = crypto.randomUUID();
    securityStore.outbox.set(outboxId, {
      id: outboxId,
      idempotencyKey: `ann-${announcement.id}`,
      hospitalId: null,
      recipientUserId: req.auth!.userId,
      category: 'SYSTEM',
      eventType: 'PLATFORM_ANNOUNCEMENT',
      publicTitle: announcement.title,
      publicBody: 'New platform announcement published.',
      authenticatedBody: announcement.body,
      deepLinkRoute: '/super-admin/notifications',
      channel: 'IN_APP',
      status: 'DELIVERED',
      retryCount: 0,
      maxRetries: 3,
      deliveredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    db.logAudit({
      userId: req.auth!.userId,
      hospitalId: null,
      action: 'PLATFORM_ANNOUNCEMENT_PUBLISHED',
      entityType: 'ANNOUNCEMENT',
      entityId: announcement.id,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      metadata: { title: announcement.title, category: announcement.category, targetScope: announcement.targetScope },
    });

    res.status(201).json({
      success: true,
      data: announcement,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 8. System Settings (Non-secret platform config + Diagnostics summary)
// ---------------------------------------------------------------------------
router.get('/settings', (_req, res) => {
  const plans = Array.from(saasStore.plans.values());
  res.status(200).json({
    success: true,
    data: {
      preferences: platformSettingsState,
      subscriptionPlans: plans,
      systemStatus: {
        environment: process.env.NODE_ENV || 'development',
        databaseAdapter:
          process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('placeholder')
            ? 'POSTGRESQL_PRISMA'
            : 'IN_MEMORY_RELATIONAL_STORE',
        directoryDatasetCount: directoryStore.records.size,
        totalApiRequests: securityStore.metrics.totalApiRequests,
        failedAuthAttempts: securityStore.metrics.authFailures,
      },
    },
  });
});

router.patch('/settings', (req, res, next) => {
  try {
    const allowedFields = [
      'platformName',
      'organizationName',
      'supportEmail',
      'securityContactEmail',
      'defaultTimezone',
      'maintenanceMode',
      'maintenanceBannerText',
      'allowSelfHospitalRegistration',
      'requireDirectoryVerificationBeforeActivation',
      'defaultEmailNotifications',
      'defaultPushNotifications',
      'defaultSmsNotifications',
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (req.body && req.body[key] !== undefined) {
        (platformSettingsState as any)[key] = req.body[key];
        updates[key] = req.body[key];
      }
    }

    platformSettingsState.updatedAt = new Date().toISOString();
    platformSettingsState.updatedByUserId = req.auth!.userId;

    db.logAudit({
      userId: req.auth!.userId,
      hospitalId: null,
      action: 'PLATFORM_SETTINGS_UPDATED',
      entityType: 'SYSTEM_SETTINGS',
      entityId: 'global-settings',
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      metadata: { updatedFields: Object.keys(updates) },
    });

    res.status(200).json({
      success: true,
      data: platformSettingsState,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
