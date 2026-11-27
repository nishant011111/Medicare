import { Request, Router } from 'express';
import { authenticate, requireHospitalAccess } from '../../middleware/auth.middleware';
import { OperationsAndBillingService, opsStore } from './operations.service';
import { ApiError } from '../../utils/errors';
import { getParam } from '../../utils/params';

const router = Router();

function resolveHospitalId(req: Request): string {
  const headerId = req.headers['x-hospital-id'];
  const hospitalId = (typeof headerId === 'string' && headerId.trim()) || req.auth?.activeHospitalId || '';
  if (!hospitalId) {
    throw ApiError.badRequest('Hospital context is required', 'HOSPITAL_CONTEXT_REQUIRED');
  }
  return hospitalId;
}

// Middleware wrapper that resolves targetHospitalId from X-Hospital-Id header into params so requireHospitalAccess checks it
function attachHospitalHeaderContext(req: Request, _res: any, next: any) {
  const headerId = req.headers['x-hospital-id'];
  if (typeof headerId === 'string' && headerId.trim() && !req.params.hospitalId) {
    req.params.hospitalId = headerId.trim();
  }
  next();
}

// Laboratory Endpoints
router.get(
  '/lab/orders',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const list = Array.from(opsStore.labOrders.values()).filter((o) => o.hospitalId === hospitalId);
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/lab/reports', authenticate, (req, res, next) => {
  try {
    const isStaff = Boolean(
      req.auth?.hospitalRoles.some((r) => ['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'LAB_TECHNICIAN'].includes(r)) ||
        req.auth?.globalRoles.includes('SUPER_ADMIN')
    );
    const headerId = req.headers['x-hospital-id'];
    const hospitalId = (typeof headerId === 'string' && headerId.trim()) || req.auth?.activeHospitalId || '';
    if (isStaff && !hospitalId && !req.auth?.globalRoles.includes('SUPER_ADMIN')) {
      throw ApiError.badRequest('Hospital context is required for staff access', 'HOSPITAL_CONTEXT_REQUIRED');
    }
    const data = OperationsAndBillingService.listLabReports(hospitalId, req.auth!.userId, !isStaff);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/lab/reports/:id', authenticate, (req, res, next) => {
  try {
    const reportId = getParam(req.params.id);
    const isStaff = Boolean(
      req.auth?.hospitalRoles.some((r) => ['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'LAB_TECHNICIAN'].includes(r)) ||
        req.auth?.globalRoles.includes('SUPER_ADMIN')
    );
    const data = OperationsAndBillingService.getLabReport(reportId, req.auth!.userId, !isStaff);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Pharmacy & Inventory Endpoints (Pharmacist / Doctor / Hospital Admin ONLY)
router.get(
  '/pharmacy/batches',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['PHARMACIST', 'DOCTOR', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const list = Array.from(opsStore.medicineBatches.values()).filter((b) => b.hospitalId === hospitalId);
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/pharmacy/dispense',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['PHARMACIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const { batchId, quantity } = req.body;
      const data = OperationsAndBillingService.dispenseMedicineBatch(hospitalId, batchId, Number(quantity), req.auth!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// IPD Bed Allocation Endpoints (Nurse / Doctor / Receptionist / Hospital Admin ONLY)
router.get(
  '/ipd/beds',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['NURSE', 'DOCTOR', 'RECEPTIONIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const list = Array.from(opsStore.beds.values()).filter((b) => b.hospitalId === hospitalId);
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/ipd/beds/:id/allocate',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['NURSE', 'RECEPTIONIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const bedId = getParam(req.params.id);
      const data = OperationsAndBillingService.allocateBedToAdmission(
        hospitalId,
        bedId,
        req.body.admissionId,
        req.auth!.userId
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// Hospital Staff Billing & Finance Endpoints (Accountant / Receptionist / Hospital Admin ONLY — excludes Doctor & Patient)
router.get(
  '/billing/invoices',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['ACCOUNTANT', 'RECEPTIONIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const list = Array.from(opsStore.invoices.values()).filter((i) => i.hospitalId === hospitalId);
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/billing/invoices',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['ACCOUNTANT', 'RECEPTIONIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const data = OperationsAndBillingService.createInvoice(hospitalId, req.auth!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/billing/invoices/:id',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['ACCOUNTANT', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (_req, _res, next) => {
    next(
      ApiError.forbidden(
        'Finalized invoices cannot be overwritten directly. Issue a Credit Note or Adjustment.',
        'FINALIZED_INVOICE_IMMUTABLE'
      )
    );
  }
);

router.post(
  '/billing/invoices/:id/credit-notes',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['ACCOUNTANT', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const invoiceId = getParam(req.params.id);
      const data = OperationsAndBillingService.issueCreditNote(hospitalId, invoiceId, req.auth!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/billing/payments',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['ACCOUNTANT', 'RECEPTIONIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const payments = Array.from(opsStore.payments.values()).filter((p) => p.hospitalId === hospitalId);
      const refunds = Array.from(opsStore.refunds.values()).filter((r) => r.hospitalId === hospitalId);
      res.json({
        success: true,
        data: payments,
        refunds,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/billing/payments',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['ACCOUNTANT', 'RECEPTIONIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const data = OperationsAndBillingService.recordPayment(hospitalId, req.auth!.userId, req.body);
      res.status(data.idempotentReplay ? 200 : 201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/billing/analytics',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['ACCOUNTANT', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const data = OperationsAndBillingService.getFinancialAnalytics(hospitalId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
