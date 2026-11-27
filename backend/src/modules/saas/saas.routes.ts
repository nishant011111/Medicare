import { Request, Router } from 'express';
import { authenticate, requireHospitalAccess, requireRoles } from '../../middleware/auth.middleware';
import { billingRateLimiter } from '../../middleware/rateLimit.middleware';
import { FeatureEntitlementService, SaasPlatformService, saasStore } from './saas.service';
import { db } from '../../database/prisma';
import { aiStore } from '../ai/ai.service';
import { ApiError } from '../../utils/errors';
import { getParam } from '../../utils/params';

const router = Router();

function resolveHospitalContext(req: Request): string {
  const fromBody = typeof req.body?.hospitalId === 'string' ? req.body.hospitalId.trim() : '';
  const fromQuery = typeof req.query?.hospitalId === 'string' ? req.query.hospitalId.trim() : '';
  const fromHeader = typeof req.headers['x-hospital-id'] === 'string' ? req.headers['x-hospital-id'].trim() : '';
  const hospitalId = fromBody || fromQuery || fromHeader || req.auth?.activeHospitalId || '';
  if (!hospitalId) {
    throw ApiError.badRequest('Hospital context is required', 'HOSPITAL_CONTEXT_REQUIRED');
  }
  if (!req.params.hospitalId) {
    req.params.hospitalId = hospitalId;
  }
  return hospitalId;
}

function attachHospitalContext(req: Request, _res: any, next: any) {
  try {
    resolveHospitalContext(req);
    next();
  } catch (err) {
    next(err);
  }
}

// 1. POST /api/v1/onboarding/register
router.post('/onboarding/register', authenticate, (req, res, next) => {
  try {
    const data = SaasPlatformService.registerHospitalOnboarding(req.auth!.userId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/v1/onboarding/status
router.get('/onboarding/status', authenticate, attachHospitalContext, (req, res, next) => {
  try {
    const hospitalId = getParam(req.params.hospitalId);
    const onboarding = saasStore.onboardings.get(hospitalId);
    const hosp = db.hospitals.get(hospitalId);
    const isSuper = req.auth!.globalRoles.includes('SUPER_ADMIN');
    const isApplicant =
      (onboarding && onboarding.applicantUserId === req.auth!.userId) ||
      (hosp && hosp.createdByUserId === req.auth!.userId);
    const hasMembership = Array.from(db.memberships.values()).some(
      (m) => m.userId === req.auth!.userId && m.hospitalId === hospitalId && m.status === 'ACTIVE'
    );
    if (onboarding && !isSuper && !isApplicant && !hasMembership) {
      throw ApiError.forbidden('Access denied to hospital onboarding record', 'ONBOARDING_ACCESS_FORBIDDEN');
    }
    res.json({ success: true, data: onboarding || null });
  } catch (err) {
    next(err);
  }
});

// 3. POST /api/v1/onboarding/documents
router.post('/onboarding/documents', authenticate, attachHospitalContext, (req, res, next) => {
  try {
    const hospitalId = getParam(req.params.hospitalId);
    const onboarding = saasStore.onboardings.get(hospitalId);
    const hosp = db.hospitals.get(hospitalId);
    const isSuper = req.auth!.globalRoles.includes('SUPER_ADMIN');
    const isApplicant =
      (onboarding && onboarding.applicantUserId === req.auth!.userId) ||
      (hosp && hosp.createdByUserId === req.auth!.userId);
    if (onboarding && !isSuper && !isApplicant) {
      throw ApiError.forbidden('Only the onboarding applicant or Super Admin can upload verification documents');
    }
    const data = SaasPlatformService.uploadVerificationDocument(req.auth!.userId, hospitalId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/v1/platform/hospitals/:id/approve
router.post('/platform/hospitals/:id/approve', authenticate, requireRoles('SUPER_ADMIN'), (req, res, next) => {
  try {
    const decision = req.body.decision || 'APPROVE';
    const data = SaasPlatformService.reviewHospitalOnboarding(req.auth!.userId, getParam(req.params.id), {
      decision,
      reason: req.body.reason,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 5. GET /api/v1/subscriptions/plans
router.get('/subscriptions/plans', (_req, res) => {
  const plans = Array.from(saasStore.plans.values());
  res.json({ success: true, data: plans });
});

// Update configurable plan features (SUPER_ADMIN)
router.put('/subscriptions/plans/:planCode', authenticate, requireRoles('SUPER_ADMIN'), (req, res) => {
  const planCode = getParam(req.params.planCode).toUpperCase();
  const plan = saasStore.plans.get(planCode);
  if (!plan) {
    return res.status(404).json({ success: false, error: { code: 'PLAN_NOT_FOUND', message: 'Plan not found' } });
  }
  if (typeof req.body.monthlyPricePaise === 'number') plan.monthlyPricePaise = req.body.monthlyPricePaise;
  if (typeof req.body.annualPricePaise === 'number') plan.annualPricePaise = req.body.annualPricePaise;
  if (typeof req.body.maxStaffAccounts === 'number') plan.maxStaffAccounts = req.body.maxStaffAccounts;
  if (typeof req.body.maxBranches === 'number') plan.maxBranches = req.body.maxBranches;
  if (Array.isArray(req.body.features)) plan.features = req.body.features;
  res.json({ success: true, data: plan });
});

// 6. POST /api/v1/subscriptions/checkout
router.post(
  '/subscriptions/checkout',
  authenticate,
  billingRateLimiter,
  attachHospitalContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = getParam(req.params.hospitalId);
      const data = SaasPlatformService.checkoutSubscription(req.auth!.userId, hospitalId, req.body);
      res.status(data.idempotentReplay ? 200 : 201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// 7. GET /api/v1/subscriptions/current
router.get(
  '/subscriptions/current',
  authenticate,
  attachHospitalContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN']),
  (req, res) => {
    const hospitalId = getParam(req.params.hospitalId);
    const sub = saasStore.subscriptions.get(hospitalId) || null;
    const entitlements = sub ? FeatureEntitlementService.resolveHospitalEntitlements(hospitalId) : null;
    res.json({ success: true, data: { subscription: sub, entitlements } });
  }
);

// 8. POST /api/v1/subscriptions/cancel
router.post(
  '/subscriptions/cancel',
  authenticate,
  attachHospitalContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = getParam(req.params.hospitalId);
      const data = SaasPlatformService.cancelSubscription(req.auth!.userId, hospitalId, req.body.reason);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// 9. POST /api/v1/subscriptions/change-plan
router.post(
  '/subscriptions/change-plan',
  authenticate,
  attachHospitalContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = getParam(req.params.hospitalId);
      const data = SaasPlatformService.changePlan(req.auth!.userId, hospitalId, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// 10. POST /api/v1/subscriptions/webhooks/:provider
router.post('/subscriptions/webhooks/:provider', billingRateLimiter, (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const data = SaasPlatformService.handleSubscriptionWebhook(
      getParam(req.params.provider),
      signature,
      req.body
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 11. GET /api/v1/subscriptions/invoices
router.get('/subscriptions/invoices', authenticate, (req, res, next) => {
  try {
    const isSuper = Boolean(req.auth?.globalRoles.includes('SUPER_ADMIN'));
    if (isSuper) {
      const invoices = Array.from(saasStore.subscriptionInvoices.values());
      const payments = Array.from(saasStore.subscriptionPayments.values());
      return res.json({ success: true, data: { invoices, payments } });
    }
    const hospitalId = resolveHospitalContext(req);
    const hasMembership = Array.from(db.memberships.values()).some(
      (m) => m.userId === req.auth!.userId && m.hospitalId === hospitalId && m.status === 'ACTIVE'
    );
    const isAdmin = Array.from(db.userRoles.values()).some(
      (ur) =>
        ur.userId === req.auth!.userId &&
        ur.hospitalId === hospitalId &&
        (ur.roleCode === 'HOSPITAL_ADMIN' || ur.roleCode === 'ACCOUNTANT')
    );
    if (!hasMembership || !isAdmin) {
      throw ApiError.forbidden('Access denied to hospital SaaS billing invoices', 'TENANT_ISOLATION_VIOLATION');
    }
    const invoices = Array.from(saasStore.subscriptionInvoices.values()).filter(
      (i) => i.hospitalId === hospitalId
    );
    const payments = Array.from(saasStore.subscriptionPayments.values()).filter(
      (p) => p.hospitalId === hospitalId
    );
    res.json({ success: true, data: { invoices, payments } });
  } catch (err) {
    next(err);
  }
});

// 12. GET /api/v1/entitlements
router.get('/entitlements', authenticate, attachHospitalContext, requireHospitalAccess(), (req, res, next) => {
  try {
    const hospitalId = getParam(req.params.hospitalId);
    const data = FeatureEntitlementService.resolveHospitalEntitlements(hospitalId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Enforce feature access check endpoint
router.post('/entitlements/check', authenticate, attachHospitalContext, requireHospitalAccess(), (req, res, next) => {
  try {
    const hospitalId = getParam(req.params.hospitalId);
    const data = FeatureEntitlementService.assertFeatureAccess(hospitalId, req.body.featureCode);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Add hospital branch with server-side quota enforcement
router.post(
  '/onboarding/branches',
  authenticate,
  attachHospitalContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = getParam(req.params.hospitalId);
      FeatureEntitlementService.assertBranchQuotaAvailable(hospitalId);
      const onboarding = saasStore.onboardings.get(hospitalId);
      if (!onboarding) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Onboarding not found' } });
      }
      const branch = {
        id: `branch-${Date.now()}`,
        branchName: req.body.branchName,
        branchCode: req.body.branchCode || `BR-${onboarding.branches.length + 1}`,
        address: req.body.address || onboarding.address,
        city: req.body.city || onboarding.city,
        state: req.body.state || onboarding.state,
        contactPhone: req.body.contactPhone || onboarding.adminPhone,
        isPrimary: false,
      };
      onboarding.branches.push(branch);
      res.status(201).json({ success: true, data: branch });
    } catch (err) {
      next(err);
    }
  }
);

// 13. POST /api/v1/support/tickets
router.post('/support/tickets', authenticate, attachHospitalContext, requireHospitalAccess(), (req, res, next) => {
  try {
    const hospitalId = getParam(req.params.hospitalId);
    const user = db.users.get(req.auth!.userId);
    const role = req.auth?.hospitalRoles[0] || req.auth?.globalRoles[0] || 'HOSPITAL_ADMIN';
    const data = SaasPlatformService.createSupportTicket(
      req.auth!.userId,
      hospitalId,
      role,
      user?.fullName || 'Hospital Staff',
      req.body
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 14. GET /api/v1/support/tickets
router.get('/support/tickets', authenticate, (req, res) => {
  const isSuper = Boolean(req.auth?.globalRoles.includes('SUPER_ADMIN'));
  const hospitalId = (req.headers['x-hospital-id'] as string) || req.auth?.activeHospitalId || null;
  const data = SaasPlatformService.listSupportTickets(req.auth!.userId, isSuper, hospitalId);
  res.json({ success: true, data });
});

// 15. POST /api/v1/support/tickets/:id/messages
router.post('/support/tickets/:id/messages', authenticate, (req, res, next) => {
  try {
    const isSuper = Boolean(req.auth?.globalRoles.includes('SUPER_ADMIN'));
    const hospitalId = (req.headers['x-hospital-id'] as string) || req.auth?.activeHospitalId || null;
    const user = db.users.get(req.auth!.userId);
    const role = isSuper ? 'SUPER_ADMIN' : req.auth?.hospitalRoles[0] || 'HOSPITAL_ADMIN';
    const data = SaasPlatformService.addSupportTicketMessage(
      getParam(req.params.id),
      req.auth!.userId,
      role,
      user?.fullName || 'MediCore User',
      isSuper,
      hospitalId,
      req.body
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 16. GET /api/v1/platform/analytics (SUPER_ADMIN only)
router.get('/platform/analytics', authenticate, requireRoles('SUPER_ADMIN'), (_req, res) => {
  const data = SaasPlatformService.getPlatformBusinessAnalytics();
  res.json({ success: true, data });
});

// 17. GET /api/v1/platform/usage (SUPER_ADMIN only)
router.get('/platform/usage', authenticate, requireRoles('SUPER_ADMIN'), (_req, res) => {
  const hospitals = Array.from(db.hospitals.values());
  const tickets = Array.from(saasStore.supportTickets.values());
  res.json({
    success: true,
    data: {
      totalHospitals: hospitals.length,
      activeHospitals: hospitals.filter((h) => h.status === 'APPROVED').length,
      suspendedHospitals: hospitals.filter((h) => h.status === 'SUSPENDED').length,
      pendingHospitals: hospitals.filter((h) => h.status === 'PENDING').length,
      supportTicketStats: {
        total: tickets.length,
        open: tickets.filter((t) => t.status === 'OPEN').length,
        inProgress: tickets.filter((t) => t.status === 'IN_PROGRESS').length,
        resolved: tickets.filter((t) => t.status === 'RESOLVED').length,
      },
      totalAiRequests: aiStore.usageLogs.length,
      totalAiTokensUsed: aiStore.usageLogs.reduce((a, b) => a + b.totalTokens, 0),
      announcements: saasStore.announcements,
    },
  });
});

export default router;
