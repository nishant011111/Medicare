import { Router } from 'express';
import crypto from 'crypto';
import { authenticate, requireHospitalAccess } from '../../middleware/auth.middleware';
import { messagingRateLimiter } from '../../middleware/rateLimit.middleware';
import { AIService, aiStore } from './ai.service';
import { ApiError } from '../../utils/errors';
import { getParam } from '../../utils/params';

const router = Router();

function resolveHospitalContext(req: { headers: Record<string, unknown>; auth?: { activeHospitalId: string | null } }): string {
  const headerVal = req.headers['x-hospital-id'];
  const hospitalId = (typeof headerVal === 'string' && headerVal.trim()) || req.auth?.activeHospitalId || '';
  if (!hospitalId) {
    throw ApiError.badRequest('Hospital context (X-Hospital-Id or active hospital) is required', 'HOSPITAL_CONTEXT_REQUIRED');
  }
  return hospitalId;
}

// 1. POST /api/v1/ai/chat
router.post('/chat', authenticate, messagingRateLimiter, async (req, res, next) => {
  try {
    const headerVal = req.headers['x-hospital-id'];
    const hospitalId = (typeof headerVal === 'string' && headerVal.trim()) || req.auth?.activeHospitalId || 'PATIENT_PORTAL';
    const role = req.auth?.hospitalRoles[0] || req.auth?.globalRoles[0] || 'PATIENT';
    const data = await AIService.chat(hospitalId, req.auth!.userId, role, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/v1/ai/conversations
router.get('/conversations', authenticate, (req, res) => {
  const headerVal = req.headers['x-hospital-id'];
  const hospitalId = (typeof headerVal === 'string' && headerVal.trim()) || req.auth?.activeHospitalId || null;
  const list = Array.from(aiStore.conversations.values()).filter(
    (c) => c.userId === req.auth!.userId && (!hospitalId || c.hospitalId === hospitalId)
  );
  res.json({ success: true, data: list });
});

// 3. GET /api/v1/ai/conversations/:id
router.get('/conversations/:id', authenticate, (req, res, next) => {
  const conv = aiStore.conversations.get(getParam(req.params.id));
  if (!conv || conv.userId !== req.auth!.userId) {
    return next(ApiError.notFound('AI Conversation not found'));
  }
  res.json({ success: true, data: conv });
});

// 4. POST /api/v1/ai/report-summaries
router.post('/report-summaries', authenticate, messagingRateLimiter, async (req, res, next) => {
  try {
    const headerVal = req.headers['x-hospital-id'];
    const hospitalId = (typeof headerVal === 'string' && headerVal.trim()) || req.auth?.activeHospitalId || 'PATIENT_PORTAL';
    const data = await AIService.summarizeLabReport(hospitalId, req.auth!.userId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 5. POST /api/v1/ai/clinical-note-drafts
router.post('/clinical-note-drafts', authenticate, messagingRateLimiter, async (req, res, next) => {
  try {
    if (!req.auth?.hospitalRoles.includes('DOCTOR') && !req.auth?.globalRoles.includes('SUPER_ADMIN')) {
      throw ApiError.forbidden('Only doctors can generate AI clinical note drafts');
    }
    const hospitalId = resolveHospitalContext(req);
    const data = await AIService.createClinicalNoteDraft(hospitalId, req.auth!.userId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Doctor Approval of AI Clinical Draft
router.post('/clinical-note-drafts/:id/approve', authenticate, (req, res, next) => {
  try {
    if (!req.auth?.hospitalRoles.includes('DOCTOR') && !req.auth?.globalRoles.includes('SUPER_ADMIN')) {
      throw ApiError.forbidden('Only an attending doctor can approve an AI clinical note draft');
    }
    const hospitalId = resolveHospitalContext(req);
    const data = AIService.approveClinicalNoteDraft(hospitalId, getParam(req.params.id), req.auth!.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 6. POST /api/v1/ai/analytics/query (Hospital Staff Only)
router.post(
  '/analytics/query',
  authenticate,
  messagingRateLimiter,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'DOCTOR', 'ACCOUNTANT', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalContext(req);
      const data = AIService.queryNaturalLanguageAnalytics(hospitalId, req.auth!.userId, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// 7. POST /api/v1/ai/inventory/forecast (Pharmacy / Hospital Admin Only)
router.post(
  '/inventory/forecast',
  authenticate,
  requireHospitalAccess(['PHARMACIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalContext(req);
      const data = AIService.generateInventoryForecast(hospitalId, req.auth!.userId, req.body.horizonDays || 14);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// 8. POST /api/v1/ai/appointments/forecast (Clinical / Receptionist / Admin Only)
router.post(
  '/appointments/forecast',
  authenticate,
  requireHospitalAccess(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalContext(req);
      const data = AIService.generateAppointmentForecast(hospitalId, req.auth!.userId, req.body.horizonDays || 7);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// 9. POST /api/v1/ai/feedback
router.post('/feedback', authenticate, (req, res) => {
  const headerVal = req.headers['x-hospital-id'];
  const hospitalId = (typeof headerVal === 'string' && headerVal.trim()) || req.auth?.activeHospitalId || 'PATIENT_PORTAL';
  const entry = {
    id: crypto.randomUUID(),
    hospitalId,
    userId: req.auth!.userId,
    rating: typeof req.body?.rating === 'number' ? req.body.rating : null,
    comment: typeof req.body?.comment === 'string' ? req.body.comment.slice(0, 1000) : null,
    conversationId: typeof req.body?.conversationId === 'string' ? req.body.conversationId : null,
    createdAt: new Date().toISOString(),
  };
  aiStore.feedbacks.unshift(entry);
  res.status(201).json({ success: true, data: entry });
});

// 10. GET /api/v1/ai/usage (Hospital Admin / Super Admin Only)
router.get(
  '/usage',
  authenticate,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalContext(req);
      const logs = aiStore.usageLogs.filter((l) => l.hospitalId === hospitalId);
      const totalTokens = logs.reduce((acc, l) => acc + l.totalTokens, 0);
      res.json({
        success: true,
        data: {
          hospitalId,
          totalRequests: logs.length,
          totalTokens,
          logs: logs.slice(0, 50),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 11. GET /api/v1/ai/consent
router.get('/consent', authenticate, (req, res) => {
  const headerVal = req.headers['x-hospital-id'];
  const hospitalId = (typeof headerVal === 'string' && headerVal.trim()) || req.auth?.activeHospitalId || 'PATIENT_PORTAL';
  const data = AIService.getOrInitConsent(req.auth!.userId, hospitalId);
  res.json({ success: true, data });
});

// 12. PUT /api/v1/ai/consent
router.put('/consent', authenticate, (req, res) => {
  const headerVal = req.headers['x-hospital-id'];
  const hospitalId = (typeof headerVal === 'string' && headerVal.trim()) || req.auth?.activeHospitalId || 'PATIENT_PORTAL';
  const data = AIService.updateConsent(req.auth!.userId, hospitalId, req.body);
  res.json({ success: true, data });
});

export default router;
