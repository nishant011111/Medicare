import { Request, Router } from 'express';
import { authenticate, requireHospitalAccess } from '../../middleware/auth.middleware';
import { ClinicalService, clinicalStore } from './clinical.service';
import { db } from '../../database/prisma';
import { ApiError } from '../../utils/errors';
import { getParam } from '../../utils/params';

const router = Router();

function attachHospitalHeaderContext(req: Request, _res: any, next: any) {
  const headerId = req.headers['x-hospital-id'];
  if (typeof headerId === 'string' && headerId.trim() && !req.params.hospitalId) {
    req.params.hospitalId = headerId.trim();
  }
  next();
}

function resolveHospitalId(req: Request): string {
  const headerId = req.headers['x-hospital-id'];
  const hospitalId = (typeof headerId === 'string' && headerId.trim()) || req.auth?.activeHospitalId || '';
  if (!hospitalId) {
    throw ApiError.badRequest('Hospital context is required', 'HOSPITAL_CONTEXT_REQUIRED');
  }
  // Enforce strict tenant isolation: non-SUPER_ADMIN staff can never spoof X-Hospital-Id for another hospital
  const isSuperAdmin = Boolean(req.auth?.globalRoles.includes('SUPER_ADMIN'));
  const isStaff = Boolean(req.auth?.hospitalRoles && req.auth.hospitalRoles.length > 0 && !req.auth.hospitalRoles.includes('PATIENT'));
  if (isStaff && !isSuperAdmin && req.auth?.activeHospitalId && hospitalId !== req.auth.activeHospitalId) {
    throw ApiError.forbidden(
      'Cross-hospital isolation: You are not authorized to access resources belonging to another hospital tenant.',
      'TENANT_ISOLATION_VIOLATION'
    );
  }
  return hospitalId;
}

function rejectMaliciousInput(payload: unknown): void {
  const raw = JSON.stringify(payload || '');
  if (/<script\b[^>]*>|javascript:|onerror\s*=|onload\s*=/i.test(raw)) {
    throw ApiError.badRequest('Input contains potentially unsafe script or HTML event content', 'XSS_PAYLOAD_BLOCKED');
  }
  if (/(\bUNION\s+SELECT\b|\bDROP\s+TABLE\b|--\s*$|;\s*DROP\s+)/i.test(raw)) {
    throw ApiError.badRequest('Input contains disallowed SQL syntax patterns', 'SQLI_PAYLOAD_BLOCKED');
  }
}

// -------------------------------------------------------------
// Hospital Admin Dashboard Overview & Reports (Phase 5)
// -------------------------------------------------------------
router.get(
  '/hospital/overview',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess([
    'HOSPITAL_ADMIN',
    'ACCOUNTANT',
    'DOCTOR',
    'NURSE',
    'RECEPTIONIST',
    'PHARMACIST',
    'LAB_TECHNICIAN',
    'SUPER_ADMIN',
  ]),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.getHospitalDashboardOverview(hospitalId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/hospital/reports',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const overview = ClinicalService.getHospitalDashboardOverview(hospitalId);
      const range = typeof req.query.range === 'string' ? req.query.range : '30d';
      res.json({
        success: true,
        data: {
          range,
          ...overview,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -------------------------------------------------------------
// Department Management Endpoints (Phase 5)
// -------------------------------------------------------------
router.get(
  '/departments',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const result = ClinicalService.listDepartments(hospitalId, {
        search: req.query.search as string | undefined,
        status: req.query.status as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json({
        success: true,
        data: result.items,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/departments',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.createDepartment(hospitalId, req.auth!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/departments/:id',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      rejectMaliciousInput(req.body);
      const hospitalId = resolveHospitalId(req);
      const departmentId = getParam(req.params.id);
      const data = ClinicalService.updateDepartment(hospitalId, departmentId, req.auth!.userId, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/departments/:id',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const departmentId = getParam(req.params.id);
      const data = ClinicalService.deleteDepartment(hospitalId, departmentId, req.auth!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// -------------------------------------------------------------
// Staff Management Endpoints (Phase 5 & Phase 7)
// -------------------------------------------------------------
router.get(
  '/staff/dashboard',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.getStaffManagementDashboard(hospitalId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/staff',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.listHospitalStaff(hospitalId, {
        search: req.query.search as string | undefined,
        role: req.query.role as string | undefined,
        department: req.query.department as string | undefined,
        status: req.query.status as string | undefined,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/staff',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  async (req, res, next) => {
    try {
      rejectMaliciousInput(req.body);
      const hospitalId = resolveHospitalId(req);
      const data = await ClinicalService.createHospitalStaff(hospitalId, req.auth!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// -------------------------------------------------------------
// Patient Self Profile Endpoints
// -------------------------------------------------------------
router.get('/profile', authenticate, (req, res, next) => {
  try {
    const data = ClinicalService.getPatientProfile(req.auth!.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.patch('/profile', authenticate, (req, res, next) => {
  try {
    const data = ClinicalService.updatePatientProfile(req.auth!.userId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/patients/me', authenticate, (req, res, next) => {
  try {
    const data = ClinicalService.getPatientProfile(req.auth!.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.patch('/patients/me', authenticate, (req, res, next) => {
  try {
    const data = ClinicalService.updatePatientProfile(req.auth!.userId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Complete Patient Management System (Phase 6)
// -------------------------------------------------------------
router.get(
  '/patients/stats',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.getPatientStatsForHospital(hospitalId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/patients/directory',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const result = ClinicalService.queryPatientsDirectory(hospitalId, {
        search: req.query.search as string | undefined,
        status: req.query.status as string | undefined,
        doctorId: req.query.doctorId as string | undefined,
        gender: req.query.gender as string | undefined,
        registeredFrom: req.query.registeredFrom as string | undefined,
        registeredTo: req.query.registeredTo as string | undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      });
      res.json({
        success: true,
        data: result.items,
        meta: result.meta,
        stats: result.stats,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Hospital Staff Patient Registry (Strictly restricted to clinical/admin staff in active hospital)
router.get(
  '/patients',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.listPatients(hospitalId, req.query.search as string | undefined);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/patients',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['RECEPTIONIST', 'NURSE', 'DOCTOR', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      rejectMaliciousInput(req.body);
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.registerPatientInHospital(hospitalId, req.body, req.auth!.userId);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/patients/:id',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const patientId = getParam(req.params.id);
      const hospitalId = resolveHospitalId(req);
      const actorRoles = [...(req.auth?.globalRoles || []), ...(req.auth?.hospitalRoles || [])];
      const data = ClinicalService.getPatientDetailInHospital(patientId, hospitalId, req.auth!.userId, actorRoles);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/patients/:id',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['RECEPTIONIST', 'NURSE', 'DOCTOR', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const patientId = getParam(req.params.id);
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.updatePatientInHospital(patientId, hospitalId, req.auth!.userId, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/patients/:id/status',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['RECEPTIONIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const patientId = getParam(req.params.id);
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.updatePatientStatusInHospital(
        patientId,
        hospitalId,
        req.auth!.userId,
        req.body?.status,
        req.body?.reason
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/patients/:id/documents',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const patientId = getParam(req.params.id);
      const hospitalId = resolveHospitalId(req);
      const actorRoles = [...(req.auth?.globalRoles || []), ...(req.auth?.hospitalRoles || [])];
      const detail = ClinicalService.getPatientDetailInHospital(patientId, hospitalId, req.auth!.userId, actorRoles);
      res.json({ success: true, data: detail.documents });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/patients/:id/documents',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const patientId = getParam(req.params.id);
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.uploadPatientDocument(patientId, hospitalId, req.auth!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/patients/:id/documents/:docId/download',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_TECHNICIAN', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const patientId = getParam(req.params.id);
      const docId = getParam(req.params.docId);
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.createSignedDocumentDownloadUrl(patientId, docId, hospitalId, req.auth!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/patients/:id/consent', authenticate, (req, res, next) => {
  try {
    const patientId = getParam(req.params.id);
    const patient = Array.from(clinicalStore.patients.values()).find(
      (p) => p.id === patientId || p.userId === patientId
    );
    const isSelf = Boolean(patient && patient.userId === req.auth!.userId) || patientId === req.auth!.userId;
    const isAdmin = req.auth!.globalRoles.includes('SUPER_ADMIN') || req.auth!.hospitalRoles.includes('HOSPITAL_ADMIN');
    if (!isSelf && !isAdmin) {
      throw ApiError.forbidden('Only the patient or an authorized hospital administrator can modify EHR sharing consent', 'CONSENT_FORBIDDEN');
    }
    const { sourceHospitalId, targetHospitalId } = req.body;
    const data = ClinicalService.grantCrossHospitalEhrConsent(patientId, sourceHospitalId, targetHospitalId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Medical Records (EHR) Endpoints
// -------------------------------------------------------------
router.get('/patients/:id/ehr', authenticate, (req, res, next) => {
  try {
    const patientId = getParam(req.params.id);
    const isStaff = Boolean(
      req.auth?.hospitalRoles.some((r) => ['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN'].includes(r)) ||
        req.auth?.globalRoles.includes('SUPER_ADMIN')
    );

    if (!isStaff) {
      if (req.auth?.hospitalRoles.some((r) => ['RECEPTIONIST', 'ACCOUNTANT', 'PHARMACIST', 'LAB_TECHNICIAN'].includes(r))) {
        throw ApiError.forbidden('Your staff role is not authorized for unrestricted medical history access', 'INSUFFICIENT_ROLE_PERMISSIONS');
      }
      const patient = Array.from(clinicalStore.patients.values()).find(
        (p) => p.userId === req.auth!.userId || p.id === req.auth!.userId
      );
      const authorizedPatientId = patient ? patient.id : req.auth!.userId;
      if (patientId !== authorizedPatientId && patientId !== req.auth!.userId) {
        throw ApiError.forbidden("You are not authorized to view another patient's medical records", 'IDOR_ACCESS_DENIED');
      }
      const data = ClinicalService.getPatientEhrTimeline(patientId, req.auth?.activeHospitalId || '', req.auth!.userId);
      return res.json({ success: true, data });
    }

    const hospitalId = resolveHospitalId(req);
    const data = ClinicalService.getPatientEhrTimeline(patientId, hospitalId, req.auth!.userId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
});

router.get('/patients/:patientId/ehr/:encounterId', authenticate, (req, res, next) => {
  try {
    const patientId = getParam(req.params.patientId);
    const encounterId = getParam(req.params.encounterId);
    const isPatient = !(
      req.auth?.hospitalRoles.some((r) => ['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN'].includes(r)) ||
      req.auth?.globalRoles.includes('SUPER_ADMIN')
    );
    const hospitalId = isPatient ? req.auth?.activeHospitalId || '' : resolveHospitalId(req);

    const data = ClinicalService.getEncounter(encounterId, patientId, req.auth!.userId, hospitalId, isPatient);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/patients/:id/vitals',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const patientId = getParam(req.params.id);
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.recordVitals(hospitalId, req.auth!.userId, {
        ...req.body,
        patientId,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// -------------------------------------------------------------
// Doctor Endpoints (Discovery + Phase 5 Hospital Admin CRUD)
// -------------------------------------------------------------
router.get('/doctors', authenticate, (req, res) => {
  const headerId = req.headers['x-hospital-id'];
  const hospitalId = (typeof headerId === 'string' && headerId.trim()) || req.auth?.activeHospitalId || '';
  let doctors = hospitalId
    ? Array.from(clinicalStore.doctors.values()).filter((d) => d.hospitalId === hospitalId)
    : Array.from(clinicalStore.doctors.values());

  const { departmentId, search } = req.query;
  if (departmentId) {
    doctors = doctors.filter((d) => d.departmentId === String(departmentId));
  }
  if (search) {
    const q = String(search).toLowerCase();
    doctors = doctors.filter(
      (d) =>
        d.fullName.toLowerCase().includes(q) ||
        d.specialization.toLowerCase().includes(q) ||
        d.departmentName.toLowerCase().includes(q)
    );
  }

  const enriched = doctors.map((d) => {
    const appointmentsCount = Array.from(clinicalStore.appointments.values()).filter(
      (a) => a.doctorId === d.id && a.status !== 'CANCELLED'
    ).length;
    const hospital = db.hospitals.get(d.hospitalId);
    return {
      ...d,
      hospitalName: hospital?.name || 'MediCore Partner Hospital',
      hospitalCity: hospital?.city || '',
      appointmentsCount,
    };
  });

  res.json({ success: true, data: enriched });
});

router.post(
  '/doctors',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  async (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const data = await ClinicalService.createDoctorInHospital(hospitalId, req.auth!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/doctors/:id',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const doctorId = getParam(req.params.id);
      const data = ClinicalService.updateDoctorInHospital(hospitalId, doctorId, req.auth!.userId, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/doctors/:id/profile',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const doctorId = getParam(req.params.id);
      const data = ClinicalService.getDoctorFullProfile(doctorId, hospitalId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/doctors/:id/schedule',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'DOCTOR', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const doctorId = getParam(req.params.id);
      const actorRoles = [...(req.auth?.globalRoles || []), ...(req.auth?.hospitalRoles || [])];
      const rules = Array.isArray(req.body?.rules) ? req.body.rules : req.body;
      const data = ClinicalService.updateDoctorSchedule(doctorId, hospitalId, req.auth!.userId, actorRoles, rules);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/doctors/:id/blocked-times',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'DOCTOR', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      rejectMaliciousInput(req.body);
      const hospitalId = resolveHospitalId(req);
      const doctorId = getParam(req.params.id);
      const actorRoles = [...(req.auth?.globalRoles || []), ...(req.auth?.hospitalRoles || [])];
      const data = ClinicalService.addDoctorBlockedTime(doctorId, hospitalId, req.auth!.userId, actorRoles, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/doctors/:id/blocked-times/:ruleId',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'DOCTOR', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const doctorId = getParam(req.params.id);
      const ruleId = getParam(req.params.ruleId);
      const data = ClinicalService.deleteDoctorBlockedTime(doctorId, ruleId, hospitalId, req.auth!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/doctors/:id', authenticate, (req, res, next) => {
  try {
    const doctorId = getParam(req.params.id);
    const data = ClinicalService.getDoctor(doctorId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/doctors/:id/availability', authenticate, (req, res, next) => {
  try {
    const doctorId = getParam(req.params.id);
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const data = ClinicalService.getDoctorAvailability(doctorId, date);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Appointment Endpoints (Phase 5 & Phase 8)
// -------------------------------------------------------------
router.get(
  '/appointments/dashboard',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.getAppointmentDashboard(hospitalId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/appointments', authenticate, attachHospitalHeaderContext, (req, res, next) => {
  try {
    const headerId = req.headers['x-hospital-id'];
    const hospitalId = (typeof headerId === 'string' && headerId.trim()) || req.auth?.activeHospitalId || '';
    const userId = req.auth!.userId;
    const isStaff = Boolean(
      req.auth?.hospitalRoles.some((r) => ['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'RECEPTIONIST'].includes(r)) ||
        req.auth?.globalRoles.includes('SUPER_ADMIN')
    );

    if (!isStaff && req.auth?.hospitalRoles.some((r) => ['PHARMACIST', 'LAB_TECHNICIAN'].includes(r))) {
      throw ApiError.forbidden('Your role is not authorized for general appointment administration', 'INSUFFICIENT_ROLE_PERMISSIONS');
    }

    if (isStaff && hospitalId && !req.auth?.globalRoles.includes('SUPER_ADMIN')) {
      if (hospitalId !== req.auth?.activeHospitalId) {
        throw ApiError.forbidden(
          'Cross-hospital isolation: You are not authorized to view appointments for another hospital',
          'TENANT_ISOLATION_VIOLATION'
        );
      }
    }

    let list = hospitalId
      ? Array.from(clinicalStore.appointments.values()).filter((a) => a.hospitalId === hospitalId)
      : Array.from(clinicalStore.appointments.values());

    if (!isStaff) {
      const patient = Array.from(clinicalStore.patients.values()).find((p) => p.userId === userId || p.id === userId);
      const patientId = patient ? patient.id : userId;
      list = list.filter((a) => a.bookedByUserId === userId || a.patientId === patientId || a.patientId === userId);
    }

    if (req.query.date) {
      list = list.filter((a) => a.appointmentDate === String(req.query.date));
    }
    if (req.query.status && req.query.status !== 'ALL') {
      list = list.filter((a) => a.status === String(req.query.status));
    }
    if (req.query.doctorId && req.query.doctorId !== 'ALL') {
      list = list.filter((a) => a.doctorId === String(req.query.doctorId));
    }
    if (req.query.departmentId && req.query.departmentId !== 'ALL') {
      list = list.filter((a) => a.departmentId === String(req.query.departmentId));
    }

    const enriched = list.map((a) => {
      const pat = clinicalStore.patients.get(a.patientId);
      const doc = clinicalStore.doctors.get(a.doctorId);
      const dept = clinicalStore.departments.get(a.departmentId);
      const hosp = db.hospitals.get(a.hospitalId);
      return {
        ...a,
        hospitalName: hosp?.name || 'MediCore Partner Hospital',
        patientName: pat?.fullName || 'Patient',
        patientPhone: pat?.phone || '',
        globalPatientId: pat?.globalPatientId || '',
        doctorName: doc?.fullName || 'Attending Doctor',
        doctorSpecialization: doc?.specialization || 'General',
        departmentName: dept?.name || doc?.departmentName || 'Outpatient',
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
});

router.get('/appointments/:id', authenticate, (req, res, next) => {
  try {
    const appointmentId = getParam(req.params.id);
    const isStaff = Boolean(
      req.auth?.hospitalRoles.some((r) => ['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'RECEPTIONIST'].includes(r)) ||
        req.auth?.globalRoles.includes('SUPER_ADMIN')
    );
    const data = ClinicalService.getAppointment(appointmentId, req.auth!.userId, !isStaff);
    if (isStaff && !req.auth?.globalRoles.includes('SUPER_ADMIN')) {
      const hospitalId = resolveHospitalId(req);
      if (data.hospitalId !== hospitalId) {
        throw ApiError.forbidden('Cross-hospital isolation: Cannot access appointment belonging to another hospital', 'TENANT_ISOLATION_VIOLATION');
      }
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/appointments', authenticate, (req, res, next) => {
  try {
    rejectMaliciousInput(req.body);
    const isPatient = !(
      req.auth?.hospitalRoles.some((r) => ['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'RECEPTIONIST'].includes(r)) ||
      req.auth?.globalRoles.includes('SUPER_ADMIN')
    );

    if (req.auth?.hospitalRoles.some((r) => ['PHARMACIST', 'LAB_TECHNICIAN', 'ACCOUNTANT'].includes(r))) {
      throw ApiError.forbidden('Your role is not authorized to book clinical appointments', 'INSUFFICIENT_ROLE_PERMISSIONS');
    }

    const selectedDoctor = req.body?.doctorId
      ? clinicalStore.doctors.get(String(req.body.doctorId))
      : undefined;

    if (!req.body?.doctorId || !selectedDoctor) {
      throw ApiError.badRequest('A valid doctor must be selected to book an appointment', 'DOCTOR_REQUIRED');
    }

    if (!req.body?.appointmentDate || !req.body?.slotStartTime) {
      throw ApiError.badRequest(
        'Appointment date and time slot are required',
        'APPOINTMENT_SLOT_REQUIRED'
      );
    }

    // Staff obey strict tenant isolation via resolveHospitalId; patients may book with any active doctor's hospital
    const hospitalId = isPatient
      ? (typeof req.body.hospitalId === 'string' && req.body.hospitalId.trim()) ||
        selectedDoctor.hospitalId ||
        req.auth?.activeHospitalId ||
        ''
      : resolveHospitalId(req);

    if (!hospitalId) {
      throw ApiError.badRequest('Hospital context is required', 'HOSPITAL_CONTEXT_REQUIRED');
    }

    if (!isPatient && selectedDoctor.hospitalId !== hospitalId) {
      throw ApiError.forbidden(
        'Cross-hospital isolation: Cannot book an appointment with a doctor from another hospital',
        'TENANT_ISOLATION_VIOLATION'
      );
    }

    let patientId = req.body.patientId;
    if (isPatient || !patientId) {
      const patient = Array.from(clinicalStore.patients.values()).find((p) => p.userId === req.auth!.userId);
      patientId = patient ? patient.id : req.auth!.userId;
    }

    // Compute slotEndTime automatically from slotStartTime + doctor slotDurationMinutes if omitted
    let slotEndTime = typeof req.body.slotEndTime === 'string' ? req.body.slotEndTime.trim() : '';
    if (!slotEndTime && typeof req.body.slotStartTime === 'string' && /^\d{2}:\d{2}$/.test(req.body.slotStartTime)) {
      const [h, m] = req.body.slotStartTime.split(':').map((n: string) => Number.parseInt(n, 10));
      const totalMins = h * 60 + m + (selectedDoctor.slotDurationMinutes || 30);
      const endH = String(Math.floor(totalMins / 60) % 24).padStart(2, '0');
      const endM = String(totalMins % 60).padStart(2, '0');
      slotEndTime = `${endH}:${endM}`;
    }

    const departmentId =
      (typeof req.body.departmentId === 'string' && req.body.departmentId.trim()) ||
      selectedDoctor.departmentId;

    const reasonForVisit =
      typeof req.body.reasonForVisit === 'string' && req.body.reasonForVisit.trim()
        ? req.body.reasonForVisit.trim()
        : 'Outpatient clinical consultation';

    const booked = ClinicalService.bookAppointment(hospitalId, req.auth!.userId, {
      ...req.body,
      departmentId,
      doctorId: selectedDoctor.id,
      patientId,
      slotEndTime: slotEndTime || req.body.slotStartTime,
      reasonForVisit,
    });

    const hospital = db.hospitals.get(hospitalId);
    res.status(201).json({
      success: true,
      data: {
        ...booked,
        doctorName: selectedDoctor.fullName,
        doctorSpecialization: selectedDoctor.specialization,
        departmentName: selectedDoctor.departmentName,
        hospitalName: hospital?.name || 'MediCore Partner Hospital',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/appointments/:id/status',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['RECEPTIONIST', 'NURSE', 'DOCTOR', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const appointmentId = getParam(req.params.id);
      const role = req.auth?.hospitalRoles[0] || req.auth?.globalRoles[0] || 'STAFF';
      const data = ClinicalService.updateAppointmentStatusInHospital(
        hospitalId,
        appointmentId,
        req.auth!.userId,
        role,
        req.body
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/appointments/:id/reschedule',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['RECEPTIONIST', 'NURSE', 'DOCTOR', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const appointmentId = getParam(req.params.id);
      const data = ClinicalService.rescheduleAppointmentInHospital(
        hospitalId,
        appointmentId,
        req.auth!.userId,
        req.body
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.patch('/appointments/:id/cancel', authenticate, (req, res, next) => {
  try {
    const appointmentId = getParam(req.params.id);
    const data = ClinicalService.cancelAppointment(appointmentId, req.auth!.userId, req.body?.reason);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Consultations & Clinical Encounters Overview (Phase 5)
// -------------------------------------------------------------
router.get(
  '/consultations',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      const hospitalId = resolveHospitalId(req);
      const encounters = Array.from(clinicalStore.encounters.values())
        .filter((e) => e.hospitalId === hospitalId)
        .map((e) => {
          const pat = clinicalStore.patients.get(e.patientId);
          const doc = clinicalStore.doctors.get(e.doctorId);
          return {
            ...e,
            patientName: pat?.fullName || 'Patient',
            doctorName: doc?.fullName || 'Attending Doctor',
            doctorSpecialization: doc?.specialization || 'General',
          };
        });

      const doctors = Array.from(clinicalStore.doctors.values()).filter((d) => d.hospitalId === hospitalId);
      const appointments = Array.from(clinicalStore.appointments.values()).filter((a) => a.hospitalId === hospitalId);

      const doctorWorkload = doctors.map((d) => {
        const docApts = appointments.filter((a) => a.doctorId === d.id);
        const docEncs = encounters.filter((e) => e.doctorId === d.id);
        return {
          doctorId: d.id,
          doctorName: d.fullName,
          specialization: d.specialization,
          departmentName: d.departmentName,
          pendingConsultations: docApts.filter((a) => a.status === 'CONFIRMED' || a.status === 'CHECKED_IN').length,
          ongoingConsultations: docApts.filter((a) => a.status === 'IN_PROGRESS').length + docEncs.filter((e) => e.status === 'IN_PROGRESS').length,
          completedConsultations: docApts.filter((a) => a.status === 'COMPLETED').length + docEncs.filter((e) => e.status === 'FINALIZED' || e.status === 'AMENDED').length,
        };
      });

      res.json({
        success: true,
        data: {
          encounters,
          doctorWorkload,
          summary: {
            ongoing: encounters.filter((e) => e.status === 'IN_PROGRESS' || e.status === 'DRAFT').length,
            completed: encounters.filter((e) => e.status === 'FINALIZED' || e.status === 'AMENDED').length,
            pendingQueue: appointments.filter((a) => a.status === 'CHECKED_IN' || a.status === 'CONFIRMED').length,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/encounters',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      rejectMaliciousInput(req.body);
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.createEncounterInHospital(hospitalId, req.auth!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/encounters/:id/amend', authenticate, (req, res, next) => {
  try {
    if (!req.auth?.hospitalRoles.includes('DOCTOR') && !req.auth?.globalRoles.includes('SUPER_ADMIN')) {
      throw ApiError.forbidden('Only doctors can amend finalized clinical encounters');
    }
    rejectMaliciousInput(req.body);
    const encounterId = getParam(req.params.id);
    const hospitalId = resolveHospitalId(req);
    const data = ClinicalService.amendFinalizedEncounter(encounterId, hospitalId, req.auth!.userId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Prescription Endpoints
// -------------------------------------------------------------
router.get('/prescriptions', authenticate, (req, res, next) => {
  try {
    const isPatient = !(
      req.auth?.hospitalRoles.some((r) => ['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'PHARMACIST'].includes(r)) ||
      req.auth?.globalRoles.includes('SUPER_ADMIN')
    );
    const hospitalId = isPatient ? req.auth?.activeHospitalId || '' : resolveHospitalId(req);
    const data = ClinicalService.listPrescriptions(req.auth!.userId, hospitalId, isPatient);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/prescriptions',
  authenticate,
  attachHospitalHeaderContext,
  requireHospitalAccess(['DOCTOR', 'HOSPITAL_ADMIN', 'SUPER_ADMIN']),
  (req, res, next) => {
    try {
      rejectMaliciousInput(req.body);
      const hospitalId = resolveHospitalId(req);
      const data = ClinicalService.createPrescriptionInHospital(hospitalId, req.auth!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/prescriptions/:id', authenticate, (req, res, next) => {
  try {
    const prescriptionId = getParam(req.params.id);
    const isPatient = !(
      req.auth?.hospitalRoles.some((r) => ['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'PHARMACIST'].includes(r)) ||
      req.auth?.globalRoles.includes('SUPER_ADMIN')
    );
    const data = ClinicalService.getPrescription(prescriptionId, req.auth!.userId, isPatient);
    if (!isPatient && !req.auth?.globalRoles.includes('SUPER_ADMIN')) {
      const hospitalId = resolveHospitalId(req);
      if (data.hospitalId !== hospitalId) {
        throw ApiError.forbidden('Cross-hospital isolation: Prescription belongs to another hospital', 'TENANT_ISOLATION_VIOLATION');
      }
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Explicitly block unauthorized modification of signed prescriptions by Pharmacists, Receptionists, or Patients
router.put('/prescriptions/:id', authenticate, (_req, _res, next) => {
  next(
    ApiError.forbidden(
      'Signed digital prescriptions are immutable and cannot be directly overwritten. Only an authorized Doctor may issue a new prescription version.',
      'PRESCRIPTION_IMMUTABLE'
    )
  );
});

router.patch('/prescriptions/:id', authenticate, (_req, _res, next) => {
  next(
    ApiError.forbidden(
      'Signed digital prescriptions cannot be silently altered. Pharmacists must use the referral workflow if clarification is required.',
      'PRESCRIPTION_IMMUTABLE'
    )
  );
});

export default router;
