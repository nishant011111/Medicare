import crypto from 'crypto';
import { ApiError } from '../../utils/errors';
import { db } from '../../database/prisma';
import { AuthService } from '../auth/auth.service';
import { opsStore, OperationsAndBillingService } from '../operations/operations.service';
import { SecurityAndNotificationService } from '../security/security.service';
import { hashPassword, generateRandomCode } from '../../utils/crypto';
import { RoleCodeType } from '../roles/roles.constants';

export interface PatientRecord {
  id: string;
  userId: string;
  globalPatientId: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  emergencyContactName: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone: string;
  address: string;
  city: string;
  state: string;
  postalCode?: string;
  assignedDoctorId?: string | null;
  medicalNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  hospitalLinks: Array<{
    hospitalId: string;
    hospitalRegistrationNumber: string;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | string;
    registeredAt?: string;
    consentToShareWithHospitalIds: string[];
  }>;
}

export interface DepartmentRecord {
  id: string;
  hospitalId: string;
  name: string;
  code: string;
  description: string;
  floorLocation?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorRecord {
  id: string;
  userId: string;
  fullName: string;
  email?: string;
  phone?: string;
  medicalLicenseNumber: string;
  qualification: string;
  specialization: string;
  experienceYears: number;
  bio?: string | null;
  profilePhotoUrl?: string | null;
  hospitalId: string;
  departmentId: string;
  departmentName: string;
  consultationFee?: number | null;
  slotDurationMinutes: number;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  isActive?: boolean;
  createdAt?: string;
}

export interface DoctorAvailabilityRule {
  id: string;
  doctorId: string;
  hospitalId: string;
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  slotDurationMinutes: number;
  timezone: string;
  isActive: boolean;
}

export interface DoctorBlockedTimeRule {
  id: string;
  doctorId: string;
  hospitalId: string;
  blockedDate: string; // "YYYY-MM-DD"
  startTime?: string | null;
  endTime?: string | null;
  isFullDayLeave: boolean;
  reason: string;
}

export interface AppointmentRecord {
  id: string;
  appointmentNumber: string;
  hospitalId: string;
  departmentId: string;
  doctorId: string;
  patientId: string;
  appointmentDate: string;
  slotStartTime: string;
  slotEndTime: string;
  timezone: string;
  type: 'OPD' | 'WALK_IN' | 'FOLLOW_UP';
  status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  reasonForVisit: string;
  cancellationReason?: string | null;
  clinicalNotes?: string | null;
  bookedByUserId: string;
  createdAt?: string;
  statusHistory: Array<{
    fromStatus: string | null;
    toStatus: string;
    changedByUserId: string;
    changedByRole: string;
    notes?: string;
    changedAt: string;
  }>;
}

export interface EncounterRecord {
  id: string;
  patientId: string;
  hospitalId: string;
  doctorId: string;
  appointmentId?: string;
  encounterType?: 'OPD' | 'WALK_IN' | 'IPD' | 'EMERGENCY';
  status: 'DRAFT' | 'IN_PROGRESS' | 'FINALIZED' | 'AMENDED';
  version: number;
  symptoms: string;
  examinationFindings: string;
  assessment: string;
  diagnoses: Array<{ icd10Code: string; diagnosisName: string; classification: 'PRIMARY' | 'SECONDARY' }>;
  treatmentPlan?: {
    clinicalGoals: string;
    treatmentInstructions: string;
    followUpInstructions: string;
    reviewDate: string;
  };
  amendmentHistory: Array<{
    versionNumber: number;
    authorUserId: string;
    reason: string;
    symptoms: string;
    assessment: string;
    amendedAt: string;
  }>;
  finalizedAt?: string;
  createdAt: string;
}

export interface VitalRecord {
  id: string;
  patientId: string;
  hospitalId: string;
  systolicBp: number;
  diastolicBp: number;
  heartRateBpm: number;
  temperatureCelsius: number;
  respiratoryRate: number;
  oxygenSaturation: number;
  heightCm: number;
  weightKg: number;
  bmi: number;
  measurementSource: string;
  recordedByUserId: string;
  recordedAt: string;
}

export interface PrescriptionRecord {
  id: string;
  prescriptionNumber: string;
  patientId: string;
  doctorId: string;
  hospitalId: string;
  encounterId: string;
  status: 'DRAFT' | 'SIGNED' | 'DISPENSED' | 'CANCELLED';
  digitalSignature?: string;
  signedAt?: string;
  notes?: string;
  createdAt?: string;
  items: Array<{
    id?: string;
    medicineName: string;
    strength: string;
    dosage: string;
    route: string;
    frequency: string;
    durationDays: number;
    quantity: number;
    instructions: string;
    specialInstructions?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    isDiscontinued?: boolean;
    discontinuedAt?: string | null;
    discontinuationReason?: string | null;
  }>;
}

export interface ClinicalDocumentRecord {
  id: string;
  patientId: string;
  hospitalId: string;
  encounterId?: string | null;
  title: string;
  documentType: 'DISCHARGE_SUMMARY' | 'RADIOLOGY' | 'CONSENT_FORM' | 'EXTERNAL_REPORT' | 'LAB_ATTACHMENT';
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  uploadedByUserId: string;
  uploadedByName: string;
  createdAt: string;
  contentBase64?: string;
}

class ClinicalStore {
  patients = new Map<string, PatientRecord>();
  departments = new Map<string, DepartmentRecord>();
  doctors = new Map<string, DoctorRecord>();
  doctorAvailabilities = new Map<string, DoctorAvailabilityRule[]>(); // keyed by doctorId
  doctorBlockedTimes = new Map<string, DoctorBlockedTimeRule[]>();   // keyed by doctorId
  appointments = new Map<string, AppointmentRecord>();
  encounters = new Map<string, EncounterRecord>();
  vitals = new Map<string, VitalRecord[]>();
  allergies = new Map<string, Array<{ id: string; hospitalId: string; allergen: string; reaction: string; severity: string }>>();
  prescriptions = new Map<string, PrescriptionRecord>();
  documents = new Map<string, ClinicalDocumentRecord>();
  signedDownloadTokens = new Map<string, { documentId: string; hospitalId: string; patientId: string; expiresAt: number }>();

  reset() {
    this.patients.clear();
    this.departments.clear();
    this.doctors.clear();
    this.doctorAvailabilities.clear();
    this.doctorBlockedTimes.clear();
    this.appointments.clear();
    this.encounters.clear();
    this.vitals.clear();
    this.allergies.clear();
    this.prescriptions.clear();
    this.documents.clear();
    this.signedDownloadTokens.clear();
  }
}

export const clinicalStore = new ClinicalStore();

export class ClinicalService {
  // -------------------------------------------------------------------------
  // Department Sync & Management (Phase 5)
  // -------------------------------------------------------------------------
  static ensureHospitalDepartmentsSynced(hospitalId: string): DepartmentRecord[] {
    const hospital = db.hospitals.get(hospitalId);
    const existing = Array.from(clinicalStore.departments.values()).filter((d) => d.hospitalId === hospitalId);

    if (hospital && hospital.departments && hospital.departments.length > 0 && existing.length === 0) {
      const now = new Date().toISOString();
      hospital.departments.forEach((deptName, idx) => {
        const cleanName = deptName.trim();
        if (!cleanName) return;
        const code = `${cleanName.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'DEPT'}-${String(idx + 1).padStart(2, '0')}`;
        const id = crypto.randomUUID();
        const record: DepartmentRecord = {
          id,
          hospitalId,
          name: cleanName,
          code,
          description: `${cleanName} clinical unit and outpatient specialty department.`,
          floorLocation: `Floor ${(idx % 4) + 1}, Wing ${String.fromCharCode(65 + (idx % 3))}`,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };
        clinicalStore.departments.set(id, record);
      });
    }

    return Array.from(clinicalStore.departments.values()).filter((d) => d.hospitalId === hospitalId);
  }

  static listDepartments(
    hospitalId: string,
    query?: { search?: string; status?: string; page?: number; limit?: number }
  ) {
    let list = this.ensureHospitalDepartmentsSynced(hospitalId);
    const doctors = Array.from(clinicalStore.doctors.values()).filter((d) => d.hospitalId === hospitalId);
    const appointments = Array.from(clinicalStore.appointments.values()).filter((a) => a.hospitalId === hospitalId);

    if (query?.status === 'ACTIVE') {
      list = list.filter((d) => d.isActive);
    } else if (query?.status === 'INACTIVE') {
      list = list.filter((d) => !d.isActive);
    }

    if (query?.search) {
      const q = query.search.toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          (d.floorLocation && d.floorLocation.toLowerCase().includes(q))
      );
    }

    const enriched = list.map((d) => {
      const assignedDoctors = doctors.filter(
        (doc) => doc.departmentId === d.id || doc.departmentName.toLowerCase() === d.name.toLowerCase()
      );
      const deptAppointments = appointments.filter((a) => a.departmentId === d.id);
      return {
        ...d,
        assignedDoctorsCount: assignedDoctors.length,
        assignedDoctors: assignedDoctors.map((doc) => ({
          id: doc.id,
          fullName: doc.fullName,
          specialization: doc.specialization,
        })),
        appointmentsCount: deptAppointments.length,
      };
    });

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 50));
    const total = enriched.length;
    const paged = enriched.slice((page - 1) * limit, page * limit);

    return {
      items: paged,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  static createDepartment(
    hospitalId: string,
    actorUserId: string,
    payload: {
      name: string;
      code?: string;
      description?: string;
      floorLocation?: string;
      isActive?: boolean;
    }
  ) {
    if (!payload.name || !payload.name.trim()) {
      throw ApiError.badRequest('Department name is required');
    }
    const existing = this.ensureHospitalDepartmentsSynced(hospitalId);
    const normalizedName = payload.name.trim();
    const normalizedCode =
      (payload.code && payload.code.trim().toUpperCase()) ||
      `${normalizedName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'DEP'}-${String(existing.length + 1).padStart(2, '0')}`;

    const duplicate = existing.find(
      (d) =>
        d.name.toLowerCase() === normalizedName.toLowerCase() ||
        d.code.toUpperCase() === normalizedCode
    );
    if (duplicate) {
      throw ApiError.conflict(
        `A department with name "${normalizedName}" or code "${normalizedCode}" already exists in this hospital`,
        'UNIQUE_CONSTRAINT_VIOLATION'
      );
    }

    const now = new Date().toISOString();
    const dept: DepartmentRecord = {
      id: crypto.randomUUID(),
      hospitalId,
      name: normalizedName,
      code: normalizedCode,
      description: payload.description?.trim() || `${normalizedName} clinical specialty department`,
      floorLocation: payload.floorLocation?.trim() || 'Main Clinical Block',
      isActive: payload.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    clinicalStore.departments.set(dept.id, dept);

    const hospital = db.hospitals.get(hospitalId);
    if (hospital && !hospital.departments.includes(normalizedName)) {
      hospital.departments.push(normalizedName);
      hospital.updatedAt = new Date();
    }

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'HOSPITAL_DEPARTMENT_CREATED',
      entityType: 'Department',
      entityId: dept.id,
      ipAddress: null,
      userAgent: null,
      metadata: { name: dept.name, code: dept.code },
    });

    return dept;
  }

  static updateDepartment(
    hospitalId: string,
    departmentId: string,
    actorUserId: string,
    payload: Partial<{
      name: string;
      code: string;
      description: string;
      floorLocation: string;
      isActive: boolean;
    }>
  ) {
    this.ensureHospitalDepartmentsSynced(hospitalId);
    const dept = clinicalStore.departments.get(departmentId);
    if (!dept || dept.hospitalId !== hospitalId) {
      throw ApiError.notFound('Department not found in this hospital');
    }

    if (payload.name && payload.name.trim().toLowerCase() !== dept.name.toLowerCase()) {
      const dup = Array.from(clinicalStore.departments.values()).find(
        (d) => d.hospitalId === hospitalId && d.id !== departmentId && d.name.toLowerCase() === payload.name!.trim().toLowerCase()
      );
      if (dup) {
        throw ApiError.conflict(`Department "${payload.name.trim()}" already exists in this hospital`, 'UNIQUE_CONSTRAINT_VIOLATION');
      }
      dept.name = payload.name.trim();
    }

    if (payload.code && payload.code.trim().toUpperCase() !== dept.code.toUpperCase()) {
      dept.code = payload.code.trim().toUpperCase();
    }
    if (payload.description !== undefined) dept.description = payload.description.trim();
    if (payload.floorLocation !== undefined) dept.floorLocation = payload.floorLocation.trim();
    if (typeof payload.isActive === 'boolean') dept.isActive = payload.isActive;
    dept.updatedAt = new Date().toISOString();

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'HOSPITAL_DEPARTMENT_UPDATED',
      entityType: 'Department',
      entityId: dept.id,
      ipAddress: null,
      userAgent: null,
      metadata: { updatedFields: Object.keys(payload) },
    });

    return dept;
  }

  static deleteDepartment(hospitalId: string, departmentId: string, actorUserId: string) {
    this.ensureHospitalDepartmentsSynced(hospitalId);
    const dept = clinicalStore.departments.get(departmentId);
    if (!dept || dept.hospitalId !== hospitalId) {
      throw ApiError.notFound('Department not found in this hospital');
    }

    const assignedDoctors = Array.from(clinicalStore.doctors.values()).filter(
      (d) => d.hospitalId === hospitalId && (d.departmentId === departmentId || d.departmentName.toLowerCase() === dept.name.toLowerCase())
    );
    const assignedStaff = Array.from(db.memberships.values()).filter(
      (m) => m.hospitalId === hospitalId && m.department && m.department.toLowerCase() === dept.name.toLowerCase()
    );
    const deptAppointments = Array.from(clinicalStore.appointments.values()).filter(
      (a) => a.hospitalId === hospitalId && a.departmentId === departmentId && a.status !== 'CANCELLED'
    );

    if (assignedDoctors.length > 0 || assignedStaff.length > 0 || deptAppointments.length > 0) {
      throw ApiError.conflict(
        `Cannot delete department "${dept.name}" because it has active relations (${assignedDoctors.length} doctor(s), ${assignedStaff.length} staff member(s), ${deptAppointments.length} appointment(s)). Deactivate it instead.`,
        'DEPARTMENT_HAS_ACTIVE_RELATIONS'
      );
    }

    clinicalStore.departments.delete(departmentId);
    const hospital = db.hospitals.get(hospitalId);
    if (hospital) {
      hospital.departments = hospital.departments.filter((n) => n.toLowerCase() !== dept.name.toLowerCase());
      hospital.updatedAt = new Date();
    }

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'HOSPITAL_DEPARTMENT_DELETED',
      entityType: 'Department',
      entityId: departmentId,
      ipAddress: null,
      userAgent: null,
      metadata: { name: dept.name, code: dept.code },
    });

    return { deletedId: departmentId, name: dept.name };
  }

  // -------------------------------------------------------------------------
  // Doctor Management (Phase 5 & Phase 7)
  // -------------------------------------------------------------------------
  static async createDoctorInHospital(
    hospitalId: string,
    actorUserId: string,
    payload: {
      fullName: string;
      email: string;
      phone?: string;
      password?: string;
      medicalLicenseNumber: string;
      qualification: string;
      specialization: string;
      experienceYears?: number;
      departmentId?: string;
      departmentName?: string;
      consultationFee?: number;
      slotDurationMinutes?: number;
      bio?: string;
    }
  ) {
    if (!payload.fullName || !payload.email || !payload.medicalLicenseNumber || !payload.specialization) {
      throw ApiError.badRequest('Doctor fullName, email, medicalLicenseNumber, and specialization are required');
    }

    const licenseNorm = payload.medicalLicenseNumber.trim().toUpperCase();
    const dupLicense = Array.from(clinicalStore.doctors.values()).find(
      (d) => d.medicalLicenseNumber.toUpperCase() === licenseNorm
    );
    if (dupLicense) {
      throw ApiError.conflict(`A doctor with medical license ${licenseNorm} already exists`, 'UNIQUE_CONSTRAINT_VIOLATION');
    }

    const depts = this.ensureHospitalDepartmentsSynced(hospitalId);
    let dept = payload.departmentId ? clinicalStore.departments.get(payload.departmentId) : undefined;
    if (!dept && payload.departmentName) {
      dept = depts.find((d) => d.name.toLowerCase() === payload.departmentName!.trim().toLowerCase());
    }
    if (!dept && depts.length > 0) {
      dept = depts[0];
    }

    const now = new Date();
    const emailNorm = payload.email.toLowerCase().trim();
    let user = Array.from(db.users.values()).find((u) => u.email && u.email.toLowerCase() === emailNorm);
    if (!user) {
      const passwordHash = await hashPassword(payload.password || `Doctor@${generateRandomCode(6)}`);
      user = {
        id: crypto.randomUUID(),
        fullName: payload.fullName.trim(),
        email: emailNorm,
        phone: payload.phone ? payload.phone.trim() : null,
        passwordHash,
        isEmailVerified: true,
        isPhoneVerified: Boolean(payload.phone),
        isActive: true,
        activeHospitalId: hospitalId,
        createdAt: now,
        updatedAt: now,
      };
      db.users.set(user.id, user);
    }

    let membership = Array.from(db.memberships.values()).find(
      (m) => m.userId === user!.id && m.hospitalId === hospitalId
    );
    if (!membership) {
      membership = {
        id: crypto.randomUUID(),
        userId: user.id,
        hospitalId,
        department: dept?.name || payload.specialization,
        employeeCode: `DOC-${generateRandomCode(4)}`,
        status: 'ACTIVE',
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      db.memberships.set(membership.id, membership);
    }

    const existingRole = Array.from(db.userRoles.values()).find(
      (ur) => ur.userId === user!.id && ur.hospitalId === hospitalId && ur.roleCode === 'DOCTOR'
    );
    if (!existingRole) {
      const roleId = crypto.randomUUID();
      db.userRoles.set(roleId, {
        id: roleId,
        userId: user.id,
        roleCode: 'DOCTOR',
        hospitalId,
        membershipId: membership.id,
        assignedAt: now,
      });
    }

    const docId = crypto.randomUUID();
    const doctor: DoctorRecord = {
      id: docId,
      userId: user.id,
      fullName: payload.fullName.trim(),
      email: user.email || '',
      phone: user.phone || payload.phone || '',
      medicalLicenseNumber: licenseNorm,
      qualification: payload.qualification?.trim() || 'MBBS, MD',
      specialization: payload.specialization.trim(),
      experienceYears: Number(payload.experienceYears) || 5,
      bio: payload.bio?.trim() || `Specialist in ${payload.specialization.trim()}`,
      profilePhotoUrl: null,
      hospitalId,
      departmentId: dept?.id || crypto.randomUUID(),
      departmentName: dept?.name || payload.departmentName || payload.specialization.trim(),
      consultationFee: Number(payload.consultationFee) || 500,
      slotDurationMinutes: Number(payload.slotDurationMinutes) || 30,
      verificationStatus: 'VERIFIED',
      isActive: true,
      createdAt: now.toISOString(),
    };

    clinicalStore.doctors.set(docId, doctor);

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'HOSPITAL_DOCTOR_CREATED',
      entityType: 'Doctor',
      entityId: docId,
      ipAddress: null,
      userAgent: null,
      metadata: { fullName: doctor.fullName, specialization: doctor.specialization, department: doctor.departmentName },
    });

    return doctor;
  }

  static updateDoctorInHospital(
    hospitalId: string,
    doctorId: string,
    actorUserId: string,
    payload: Partial<{
      fullName: string;
      phone: string;
      qualification: string;
      specialization: string;
      experienceYears: number;
      departmentId: string;
      departmentName: string;
      consultationFee: number;
      slotDurationMinutes: number;
      verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
      isActive: boolean;
      bio: string;
    }>
  ) {
    const doc = clinicalStore.doctors.get(doctorId);
    if (!doc || doc.hospitalId !== hospitalId) {
      throw ApiError.notFound('Doctor not found in this hospital');
    }

    if (payload.fullName !== undefined) doc.fullName = payload.fullName.trim();
    if (payload.phone !== undefined) doc.phone = payload.phone.trim();
    if (payload.qualification !== undefined) doc.qualification = payload.qualification.trim();
    if (payload.specialization !== undefined) doc.specialization = payload.specialization.trim();
    if (payload.experienceYears !== undefined) doc.experienceYears = Number(payload.experienceYears);
    if (payload.consultationFee !== undefined) doc.consultationFee = Number(payload.consultationFee);
    if (payload.slotDurationMinutes !== undefined) doc.slotDurationMinutes = Number(payload.slotDurationMinutes);
    if (payload.verificationStatus !== undefined) doc.verificationStatus = payload.verificationStatus;
    if (typeof payload.isActive === 'boolean') doc.isActive = payload.isActive;
    if (payload.bio !== undefined) doc.bio = payload.bio;

    if (payload.departmentId) {
      const dept = clinicalStore.departments.get(payload.departmentId);
      if (dept && dept.hospitalId === hospitalId) {
        doc.departmentId = dept.id;
        doc.departmentName = dept.name;
      }
    } else if (payload.departmentName) {
      doc.departmentName = payload.departmentName.trim();
    }

    const user = db.users.get(doc.userId);
    if (user) {
      if (payload.fullName) user.fullName = payload.fullName.trim();
      if (payload.phone) user.phone = payload.phone.trim();
      if (typeof payload.isActive === 'boolean') user.isActive = payload.isActive;
      user.updatedAt = new Date();
    }

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'HOSPITAL_DOCTOR_UPDATED',
      entityType: 'Doctor',
      entityId: doc.id,
      ipAddress: null,
      userAgent: null,
      metadata: { updatedFields: Object.keys(payload) },
    });

    return doc;
  }

  // -------------------------------------------------------------------------
  // Staff Management (Phase 5)
  // -------------------------------------------------------------------------
  static listHospitalStaff(
    hospitalId: string,
    query?: { search?: string; role?: string; department?: string; status?: string }
  ) {
    const memberships = Array.from(db.memberships.values()).filter((m) => m.hospitalId === hospitalId);
    const roles = Array.from(db.userRoles.values()).filter((r) => r.hospitalId === hospitalId);

    let staff = memberships
      .map((m) => {
        const user = db.users.get(m.userId);
        const memberRoles = roles.filter((r) => r.userId === m.userId).map((r) => r.roleCode);
        return {
          membershipId: m.id,
          userId: m.userId,
          fullName: user?.fullName || 'Unknown Staff',
          email: user?.email || '',
          phone: user?.phone || null,
          department: m.department || 'General',
          employeeCode: m.employeeCode || `EMP-${m.id.slice(0, 4).toUpperCase()}`,
          status: m.status,
          isActive: user?.isActive ?? true,
          roles: memberRoles,
          primaryRole: memberRoles[0] || 'STAFF',
          joinedAt: m.joinedAt.toISOString(),
        };
      })
      .filter((s) => !s.roles.includes('PATIENT'));

    if (query?.role && query.role !== 'ALL') {
      staff = staff.filter((s) => s.roles.includes(query.role as RoleCodeType));
    }
    if (query?.department && query.department !== 'ALL') {
      staff = staff.filter((s) => s.department.toLowerCase() === query.department!.toLowerCase());
    }
    if (query?.status && query.status !== 'ALL') {
      staff = staff.filter((s) => s.status === query.status);
    }
    if (query?.search) {
      const q = query.search.toLowerCase().trim();
      staff = staff.filter(
        (s) =>
          s.fullName.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          (s.phone && s.phone.includes(q)) ||
          s.employeeCode.toLowerCase().includes(q) ||
          s.department.toLowerCase().includes(q)
      );
    }

    return staff;
  }

  static async createHospitalStaff(
    hospitalId: string,
    actorUserId: string,
    payload: {
      fullName: string;
      email: string;
      phone?: string;
      password?: string;
      roleCode: RoleCodeType;
      department?: string;
      employeeCode?: string;
    }
  ) {
    if (!payload.fullName || !payload.email || !payload.roleCode) {
      throw ApiError.badRequest('Staff fullName, email, and roleCode are required');
    }
    if (payload.roleCode === 'SUPER_ADMIN') {
      throw ApiError.forbidden('Hospital Administrators cannot create SUPER_ADMIN accounts');
    }

    const emailNorm = payload.email.toLowerCase().trim();
    const now = new Date();
    let user = Array.from(db.users.values()).find((u) => u.email && u.email.toLowerCase() === emailNorm);

    if (!user) {
      const passwordHash = await hashPassword(payload.password || `Staff@${generateRandomCode(6)}`);
      user = {
        id: crypto.randomUUID(),
        fullName: payload.fullName.trim(),
        email: emailNorm,
        phone: payload.phone ? payload.phone.trim() : null,
        passwordHash,
        isEmailVerified: true,
        isPhoneVerified: Boolean(payload.phone),
        isActive: true,
        activeHospitalId: hospitalId,
        createdAt: now,
        updatedAt: now,
      };
      db.users.set(user.id, user);
    }

    let membership = Array.from(db.memberships.values()).find(
      (m) => m.userId === user!.id && m.hospitalId === hospitalId
    );
    if (!membership) {
      membership = {
        id: crypto.randomUUID(),
        userId: user.id,
        hospitalId,
        department: payload.department?.trim() || 'Clinical Operations',
        employeeCode: payload.employeeCode?.trim() || `EMP-${generateRandomCode(4)}`,
        status: 'ACTIVE',
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      db.memberships.set(membership.id, membership);
    } else {
      membership.status = 'ACTIVE';
      if (payload.department) membership.department = payload.department.trim();
      membership.updatedAt = now;
    }

    const hasRole = Array.from(db.userRoles.values()).some(
      (ur) => ur.userId === user!.id && ur.hospitalId === hospitalId && ur.roleCode === payload.roleCode
    );
    if (!hasRole) {
      const roleId = crypto.randomUUID();
      db.userRoles.set(roleId, {
        id: roleId,
        userId: user.id,
        roleCode: payload.roleCode,
        hospitalId,
        membershipId: membership.id,
        assignedAt: now,
      });
    }

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'HOSPITAL_STAFF_CREATED',
      entityType: 'Membership',
      entityId: membership.id,
      ipAddress: null,
      userAgent: null,
      metadata: { email: user.email, roleCode: payload.roleCode, department: membership.department },
    });

    return {
      membershipId: membership.id,
      userId: user.id,
      fullName: user.fullName,
      email: user.email || '',
      phone: user.phone,
      department: membership.department,
      employeeCode: membership.employeeCode,
      status: membership.status,
      isActive: user.isActive,
      roles: [payload.roleCode],
      primaryRole: payload.roleCode,
      joinedAt: membership.joinedAt.toISOString(),
    };
  }

  static getStaffManagementDashboard(hospitalId: string) {
    const depts = this.ensureHospitalDepartmentsSynced(hospitalId);
    const doctors = Array.from(clinicalStore.doctors.values()).filter((d) => d.hospitalId === hospitalId);
    const staff = this.listHospitalStaff(hospitalId);

    const countByRole = (role: RoleCodeType) =>
      staff.filter((s) => s.roles.includes(role) || s.primaryRole === role).length;

    const totalDoctors = Math.max(doctors.length, countByRole('DOCTOR'));
    const totalNurses = countByRole('NURSE');
    const totalReceptionists = countByRole('RECEPTIONIST');
    const totalPharmacists = countByRole('PHARMACIST');
    const totalLabTechnicians = countByRole('LAB_TECHNICIAN');
    const totalAccountants = countByRole('ACCOUNTANT');
    const totalHospitalAdmins = countByRole('HOSPITAL_ADMIN');

    const activeDoctors = doctors.filter((d) => d.isActive !== false).length;
    const inactiveDoctors = doctors.filter((d) => d.isActive === false).length;
    const nonDoctorStaff = staff.filter((s) => !s.roles.includes('DOCTOR'));
    const activeNonDoctorStaff = nonDoctorStaff.filter((s) => s.status === 'ACTIVE' && s.isActive).length;
    const inactiveNonDoctorStaff = nonDoctorStaff.filter((s) => s.status !== 'ACTIVE' || !s.isActive).length;

    const totalActiveStaff = activeDoctors + activeNonDoctorStaff;
    const inactiveStaff = inactiveDoctors + inactiveNonDoctorStaff;

    const roleDistribution = [
      { role: 'DOCTOR', label: 'Doctors', count: totalDoctors },
      { role: 'NURSE', label: 'Nurses', count: totalNurses },
      { role: 'RECEPTIONIST', label: 'Receptionists', count: totalReceptionists },
      { role: 'PHARMACIST', label: 'Pharmacists', count: totalPharmacists },
      { role: 'LAB_TECHNICIAN', label: 'Lab Technicians', count: totalLabTechnicians },
      { role: 'ACCOUNTANT', label: 'Accountants', count: totalAccountants },
      { role: 'HOSPITAL_ADMIN', label: 'Hospital Admins', count: totalHospitalAdmins },
    ];

    const departmentStaffDistribution = depts.map((d) => {
      const deptDocs = doctors.filter(
        (doc) => doc.departmentId === d.id || doc.departmentName.toLowerCase() === d.name.toLowerCase()
      ).length;
      const deptMembers = nonDoctorStaff.filter(
        (m) => m.department.toLowerCase() === d.name.toLowerCase()
      ).length;
      return {
        departmentId: d.id,
        departmentName: d.name,
        code: d.code,
        doctorsCount: deptDocs,
        supportStaffCount: deptMembers,
        totalCount: deptDocs + deptMembers,
      };
    });

    const recentlyAddedStaff = [...staff]
      .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
      .slice(0, 10);

    return {
      statistics: {
        totalDoctors,
        totalNurses,
        totalReceptionists,
        totalPharmacists,
        totalLabTechnicians,
        totalAccountants,
        totalActiveStaff,
        inactiveStaff,
        totalDepartments: depts.length,
      },
      roleDistribution,
      departmentStaffDistribution,
      recentlyAddedStaff,
    };
  }

  static ensureDefaultDoctorSchedule(doctorId: string, hospitalId: string, slotDurationMinutes = 30): DoctorAvailabilityRule[] {
    let rules = clinicalStore.doctorAvailabilities.get(doctorId);
    if (!rules || rules.length === 0) {
      // Default Monday (1) to Saturday (6), 09:00 - 17:00
      rules = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        id: crypto.randomUUID(),
        doctorId,
        hospitalId,
        dayOfWeek,
        startTime: '09:00',
        endTime: '17:00',
        slotDurationMinutes,
        timezone: 'Asia/Kolkata',
        isActive: true,
      }));
      clinicalStore.doctorAvailabilities.set(doctorId, rules);
    }
    return rules;
  }

  static getDoctorFullProfile(doctorId: string, hospitalId: string) {
    const doc = clinicalStore.doctors.get(doctorId);
    if (!doc || doc.hospitalId !== hospitalId) {
      throw ApiError.notFound('Doctor not found in this hospital');
    }

    const schedule = this.ensureDefaultDoctorSchedule(doc.id, hospitalId, doc.slotDurationMinutes || 30);
    const blockedTimes = clinicalStore.doctorBlockedTimes.get(doc.id) || [];
    const appointments = Array.from(clinicalStore.appointments.values())
      .filter((a) => a.doctorId === doc.id && a.hospitalId === hospitalId)
      .map((a) => {
        const pat = clinicalStore.patients.get(a.patientId);
        return {
          ...a,
          patientName: pat?.fullName || 'Registered Patient',
        };
      });
    const encounters = Array.from(clinicalStore.encounters.values()).filter(
      (e) => e.doctorId === doc.id && e.hospitalId === hospitalId
    );
    const assignedPatientsCount = Array.from(clinicalStore.patients.values()).filter(
      (p) => p.assignedDoctorId === doc.id && p.hospitalLinks.some((l) => l.hospitalId === hospitalId)
    ).length;

    const activityLogs = db.auditLogs
      .filter((l) => l.hospitalId === hospitalId && (l.entityId === doc.id || l.userId === doc.userId))
      .slice(0, 20)
      .map((l) => {
        const actor = l.userId ? db.users.get(l.userId) : null;
        return {
          id: l.id,
          action: l.action,
          actorName: actor?.fullName || 'Hospital Staff',
          createdAt: l.createdAt.toISOString(),
          metadata: l.metadata,
        };
      });

    return {
      doctor: doc,
      schedule,
      blockedTimes,
      metrics: {
        totalAppointments: appointments.length,
        upcomingAppointments: appointments.filter((a) => a.status === 'CONFIRMED' || a.status === 'CHECKED_IN').length,
        completedConsultations:
          appointments.filter((a) => a.status === 'COMPLETED').length +
          encounters.filter((e) => e.status === 'FINALIZED' || e.status === 'AMENDED').length,
        assignedPatientsCount,
      },
      recentAppointments: appointments.slice(-10).reverse(),
      activityLogs,
    };
  }

  static updateDoctorSchedule(
    doctorId: string,
    hospitalId: string,
    actorUserId: string,
    actorRoles: string[],
    rulesPayload: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      slotDurationMinutes?: number;
      isActive: boolean;
    }>
  ) {
    const doc = clinicalStore.doctors.get(doctorId);
    if (!doc || doc.hospitalId !== hospitalId) {
      throw ApiError.notFound('Doctor not found in this hospital');
    }

    const isSelfDoctor = doc.userId === actorUserId;
    const isAdmin = actorRoles.some((r) => ['HOSPITAL_ADMIN', 'SUPER_ADMIN'].includes(r));
    if (!isSelfDoctor && !isAdmin) {
      throw ApiError.forbidden('Only the doctor or a Hospital Administrator can update this schedule', 'SCHEDULE_UPDATE_FORBIDDEN');
    }

    if (!Array.isArray(rulesPayload) || rulesPayload.length === 0) {
      throw ApiError.badRequest('Schedule rules array is required');
    }

    const updatedRules: DoctorAvailabilityRule[] = [];
    const seenDays = new Set<number>();

    for (const r of rulesPayload) {
      const day = Number(r.dayOfWeek);
      if (Number.isNaN(day) || day < 0 || day > 6) {
        throw ApiError.badRequest('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)');
      }
      if (seenDays.has(day)) {
        throw ApiError.conflict(`Duplicate schedule rule for dayOfWeek ${day}`, 'OVERLAPPING_SCHEDULE_RULE');
      }
      seenDays.add(day);

      const start = (r.startTime || '09:00').trim();
      const end = (r.endTime || '17:00').trim();
      if (r.isActive && start >= end) {
        throw ApiError.badRequest(`Invalid consultation hours on day ${day}: startTime (${start}) must be earlier than endTime (${end})`);
      }

      updatedRules.push({
        id: crypto.randomUUID(),
        doctorId: doc.id,
        hospitalId,
        dayOfWeek: day,
        startTime: start,
        endTime: end,
        slotDurationMinutes: Number(r.slotDurationMinutes) || doc.slotDurationMinutes || 30,
        timezone: 'Asia/Kolkata',
        isActive: Boolean(r.isActive),
      });
    }

    clinicalStore.doctorAvailabilities.set(doc.id, updatedRules);

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'DOCTOR_SCHEDULE_UPDATED',
      entityType: 'Doctor',
      entityId: doc.id,
      ipAddress: null,
      userAgent: null,
      metadata: { activeDaysCount: updatedRules.filter((x) => x.isActive).length },
    });

    return updatedRules;
  }

  static addDoctorBlockedTime(
    doctorId: string,
    hospitalId: string,
    actorUserId: string,
    actorRoles: string[],
    payload: {
      blockedDate: string;
      startTime?: string;
      endTime?: string;
      isFullDayLeave?: boolean;
      reason: string;
    }
  ) {
    const doc = clinicalStore.doctors.get(doctorId);
    if (!doc || doc.hospitalId !== hospitalId) {
      throw ApiError.notFound('Doctor not found in this hospital');
    }
    const isSelfDoctor = doc.userId === actorUserId;
    const isAdmin = actorRoles.some((r) => ['HOSPITAL_ADMIN', 'SUPER_ADMIN'].includes(r));
    if (!isSelfDoctor && !isAdmin) {
      throw ApiError.forbidden('Only the doctor or a Hospital Administrator can add leave/blocked times');
    }

    if (!payload.blockedDate || !/^\d{4}-\d{2}-\d{2}$/.test(payload.blockedDate)) {
      throw ApiError.badRequest('Valid blockedDate (YYYY-MM-DD) is required');
    }
    if (!payload.reason || !payload.reason.trim()) {
      throw ApiError.badRequest('Reason for leave or blocked time is required');
    }

    const isFullDay = payload.isFullDayLeave !== false;
    if (!isFullDay && payload.startTime && payload.endTime && payload.startTime >= payload.endTime) {
      throw ApiError.badRequest('Blocked startTime must be earlier than endTime');
    }

    const existing = clinicalStore.doctorBlockedTimes.get(doc.id) || [];
    const rule: DoctorBlockedTimeRule = {
      id: crypto.randomUUID(),
      doctorId: doc.id,
      hospitalId,
      blockedDate: payload.blockedDate,
      startTime: isFullDay ? null : payload.startTime || '09:00',
      endTime: isFullDay ? null : payload.endTime || '17:00',
      isFullDayLeave: isFullDay,
      reason: payload.reason.trim(),
    };
    existing.push(rule);
    clinicalStore.doctorBlockedTimes.set(doc.id, existing);

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'DOCTOR_BLOCKED_TIME_ADDED',
      entityType: 'DoctorBlockedTime',
      entityId: rule.id,
      ipAddress: null,
      userAgent: null,
      metadata: { doctorId: doc.id, blockedDate: rule.blockedDate, isFullDayLeave: rule.isFullDayLeave, reason: rule.reason },
    });

    return rule;
  }

  static deleteDoctorBlockedTime(doctorId: string, ruleId: string, hospitalId: string, actorUserId: string) {
    const doc = clinicalStore.doctors.get(doctorId);
    if (!doc || doc.hospitalId !== hospitalId) {
      throw ApiError.notFound('Doctor not found in this hospital');
    }
    const existing = clinicalStore.doctorBlockedTimes.get(doc.id) || [];
    const filtered = existing.filter((r) => r.id !== ruleId);
    clinicalStore.doctorBlockedTimes.set(doc.id, filtered);

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'DOCTOR_BLOCKED_TIME_REMOVED',
      entityType: 'DoctorBlockedTime',
      entityId: ruleId,
      ipAddress: null,
      userAgent: null,
      metadata: { doctorId: doc.id },
    });

    return { deletedId: ruleId };
  }

  // -------------------------------------------------------------------------
  // Complete Patient Management System (Phase 6)
  // -------------------------------------------------------------------------
  static getPatientStatsForHospital(hospitalId: string) {
    const allInHospital = Array.from(clinicalStore.patients.values()).filter((p) =>
      p.hospitalLinks.some((l) => l.hospitalId === hospitalId || l.consentToShareWithHospitalIds.includes(hospitalId))
    );

    const todayStr = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    let activeCount = 0;
    let inactiveCount = 0;
    let archivedCount = 0;
    let todayCount = 0;
    let recentCount = 0;

    for (const p of allInHospital) {
      const link = p.hospitalLinks.find((l) => l.hospitalId === hospitalId) || p.hospitalLinks[0];
      const status = (link?.status || 'ACTIVE').toUpperCase();
      if (status === 'ACTIVE') activeCount += 1;
      else if (status === 'ARCHIVED') archivedCount += 1;
      else inactiveCount += 1;

      const regDateStr = link?.registeredAt || p.createdAt || '';
      if (regDateStr.startsWith(todayStr)) {
        todayCount += 1;
      }
      if (regDateStr) {
        const ts = Date.parse(regDateStr);
        if (!Number.isNaN(ts) && ts >= sevenDaysAgo) {
          recentCount += 1;
        }
      } else {
        recentCount += 1;
      }
    }

    const appointments = Array.from(clinicalStore.appointments.values()).filter(
      (a) =>
        a.hospitalId === hospitalId &&
        a.appointmentDate >= todayStr &&
        a.status !== 'CANCELLED' &&
        a.status !== 'COMPLETED'
    );
    const upcomingPatientIds = new Set(appointments.map((a) => a.patientId));

    return {
      totalPatients: allInHospital.length,
      recentlyRegisteredPatients: recentCount,
      activePatients: activeCount,
      inactivePatients: inactiveCount,
      archivedPatients: archivedCount,
      todayRegistrations: todayCount,
      patientsWithUpcomingAppointments: upcomingPatientIds.size,
    };
  }

  static listPatients(hospitalId: string, search?: string) {
    const all = Array.from(clinicalStore.patients.values()).filter((p) =>
      p.hospitalLinks.some((l) => l.hospitalId === hospitalId || l.consentToShareWithHospitalIds.includes(hospitalId))
    );
    if (!search) return all;
    const q = search.toLowerCase().trim();
    return all.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.globalPatientId.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        p.hospitalLinks.some((l) => l.hospitalRegistrationNumber.toLowerCase().includes(q))
    );
  }

  static queryPatientsDirectory(
    hospitalId: string,
    query: {
      search?: string;
      status?: string;
      doctorId?: string;
      gender?: string;
      registeredFrom?: string;
      registeredTo?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    }
  ) {
    const hospital = db.hospitals.get(hospitalId);
    const doctorsMap = clinicalStore.doctors;
    let list = this.listPatients(hospitalId, query.search);

    if (query.status && query.status !== 'ALL') {
      const targetStatus = query.status.toUpperCase();
      list = list.filter((p) => {
        const link = p.hospitalLinks.find((l) => l.hospitalId === hospitalId) || p.hospitalLinks[0];
        return (link?.status || 'ACTIVE').toUpperCase() === targetStatus;
      });
    }

    if (query.doctorId && query.doctorId !== 'ALL') {
      list = list.filter((p) => p.assignedDoctorId === query.doctorId);
    }

    if (query.gender && query.gender !== 'ALL') {
      list = list.filter((p) => (p.gender || '').toLowerCase() === query.gender!.toLowerCase());
    }

    if (query.registeredFrom) {
      list = list.filter((p) => {
        const link = p.hospitalLinks.find((l) => l.hospitalId === hospitalId) || p.hospitalLinks[0];
        const dateStr = (link?.registeredAt || p.createdAt || '').slice(0, 10);
        return !dateStr || dateStr >= query.registeredFrom!;
      });
    }

    if (query.registeredTo) {
      list = list.filter((p) => {
        const link = p.hospitalLinks.find((l) => l.hospitalId === hospitalId) || p.hospitalLinks[0];
        const dateStr = (link?.registeredAt || p.createdAt || '').slice(0, 10);
        return !dateStr || dateStr <= query.registeredTo!;
      });
    }

    const enriched = list.map((p) => {
      const link = p.hospitalLinks.find((l) => l.hospitalId === hospitalId) || p.hospitalLinks[0];
      const assignedDoc = p.assignedDoctorId ? doctorsMap.get(p.assignedDoctorId) : null;
      return {
        ...p,
        hospitalRegistrationNumber: link?.hospitalRegistrationNumber || p.globalPatientId,
        patientStatus: (link?.status || 'ACTIVE') as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
        registrationDate: link?.registeredAt || p.createdAt || new Date().toISOString(),
        assignedDoctorName: assignedDoc?.fullName || null,
        assignedDoctorSpecialization: assignedDoc?.specialization || null,
        hospitalName: hospital?.name || 'Active Hospital',
      };
    });

    const sortBy = query.sortBy || 'registrationDate';
    const dir = query.sortOrder === 'asc' ? 1 : -1;
    enriched.sort((a, b) => {
      if (sortBy === 'fullName') return a.fullName.localeCompare(b.fullName) * dir;
      if (sortBy === 'globalPatientId') return a.globalPatientId.localeCompare(b.globalPatientId) * dir;
      return (a.registrationDate || '').localeCompare(b.registrationDate || '') * dir;
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const total = enriched.length;
    const paged = enriched.slice((page - 1) * limit, page * limit);

    return {
      items: paged,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      stats: this.getPatientStatsForHospital(hospitalId),
    };
  }

  static registerPatientInHospital(
    hospitalId: string,
    payload: Partial<PatientRecord> & { fullName: string; phone: string },
    actorUserId?: string
  ) {
    if (!payload.fullName || !payload.fullName.trim()) {
      throw ApiError.badRequest('Patient full name is required');
    }
    if (!payload.phone || !payload.phone.trim()) {
      throw ApiError.badRequest('Patient contact number is required');
    }

    const normalizedPhone = payload.phone.trim();
    const normalizedEmail = payload.email ? payload.email.toLowerCase().trim() : '';

    // Check for duplicate patient in the same hospital by phone or email
    const existingInHospital = Array.from(clinicalStore.patients.values()).find(
      (p) =>
        p.hospitalLinks.some((l) => l.hospitalId === hospitalId) &&
        (p.phone === normalizedPhone || (normalizedEmail && p.email.toLowerCase() === normalizedEmail)) &&
        p.fullName.toLowerCase() === payload.fullName.trim().toLowerCase()
    );
    if (existingInHospital) {
      throw ApiError.conflict(
        `Patient "${payload.fullName.trim()}" with phone ${normalizedPhone} is already registered in this hospital (${existingInHospital.globalPatientId})`,
        'DUPLICATE_PATIENT_RECORD'
      );
    }

    const nowIso = new Date().toISOString();
    const id = crypto.randomUUID();
    const globalId = `MC-GLOBAL-2026-${String(clinicalStore.patients.size + 1).padStart(4, '0')}`;
    const regNo = `HOSP-REG-${Date.now().toString().slice(-5)}`;
    const record: PatientRecord = {
      id,
      userId: payload.userId || crypto.randomUUID(),
      globalPatientId: globalId,
      fullName: payload.fullName.trim(),
      email: normalizedEmail || `${id.slice(0, 6)}@patient.medicore.in`,
      phone: normalizedPhone,
      dateOfBirth: payload.dateOfBirth || '1990-01-01',
      gender: payload.gender || 'Female',
      bloodGroup: payload.bloodGroup || 'B+',
      emergencyContactName: payload.emergencyContactName || 'Emergency Contact',
      emergencyContactRelationship: payload.emergencyContactRelationship || 'Family',
      emergencyContactPhone: payload.emergencyContactPhone || normalizedPhone,
      address: payload.address || 'Main Road',
      city: payload.city || 'Ranchi',
      state: payload.state || 'Jharkhand',
      postalCode: payload.postalCode || '834001',
      assignedDoctorId: payload.assignedDoctorId || null,
      medicalNotes: payload.medicalNotes || null,
      createdAt: nowIso,
      updatedAt: nowIso,
      hospitalLinks: [
        {
          hospitalId,
          hospitalRegistrationNumber: regNo,
          status: 'ACTIVE',
          registeredAt: nowIso,
          consentToShareWithHospitalIds: [],
        },
      ],
    };
    clinicalStore.patients.set(id, record);

    db.logAudit({
      userId: actorUserId || null,
      hospitalId,
      action: 'HOSPITAL_PATIENT_REGISTERED',
      entityType: 'Patient',
      entityId: id,
      ipAddress: null,
      userAgent: null,
      metadata: {
        globalPatientId: globalId,
        hospitalRegistrationNumber: regNo,
      },
    });

    return record;
  }

  static getPatientDetailInHospital(
    patientId: string,
    hospitalId: string,
    actorUserId: string,
    actorRoles: string[]
  ) {
    const patient = Array.from(clinicalStore.patients.values()).find(
      (p) => p.id === patientId || p.userId === patientId || p.globalPatientId === patientId
    );
    if (!patient) {
      throw ApiError.notFound('Patient not found');
    }

    const link = patient.hospitalLinks.find(
      (l) => l.hospitalId === hospitalId || l.consentToShareWithHospitalIds.includes(hospitalId)
    );
    if (!link) {
      throw ApiError.forbidden(
        'Cross-hospital isolation: This patient does not belong to your hospital and has not granted sharing consent.',
        'TENANT_ISOLATION_VIOLATION'
      );
    }

    const hospital = db.hospitals.get(hospitalId);
    const assignedDoctor = patient.assignedDoctorId ? clinicalStore.doctors.get(patient.assignedDoctorId) || null : null;

    // Role-based clinical visibility:
    // Clinical roles (DOCTOR, NURSE, HOSPITAL_ADMIN, SUPER_ADMIN) can view medical history/encounters.
    // Administrative roles (RECEPTIONIST, ACCOUNTANT) only see demographics, appointments, and billing/documents metadata.
    const canViewClinicalHistory = actorRoles.some((r) =>
      ['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'SUPER_ADMIN'].includes(r)
    );
    const canViewPrescriptions = actorRoles.some((r) =>
      ['DOCTOR', 'NURSE', 'PHARMACIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN'].includes(r)
    );
    const canViewLabReports = actorRoles.some((r) =>
      ['DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'HOSPITAL_ADMIN', 'SUPER_ADMIN'].includes(r)
    );

    const appointments = Array.from(clinicalStore.appointments.values())
      .filter((a) => (a.patientId === patient.id || a.patientId === patient.userId) && a.hospitalId === hospitalId)
      .map((a) => {
        const doc = clinicalStore.doctors.get(a.doctorId);
        const dept = clinicalStore.departments.get(a.departmentId);
        return {
          ...a,
          doctorName: doc?.fullName || 'Attending Doctor',
          doctorSpecialization: doc?.specialization || 'General',
          departmentName: dept?.name || doc?.departmentName || 'Outpatient Department',
        };
      });

    const encounters = canViewClinicalHistory
      ? Array.from(clinicalStore.encounters.values())
          .filter((e) => (e.patientId === patient.id || e.patientId === patient.userId) && e.hospitalId === hospitalId)
          .map((e) => {
            const doc = clinicalStore.doctors.get(e.doctorId);
            return {
              ...e,
              doctorName: doc?.fullName || 'Attending Physician',
            };
          })
      : [];

    const vitals = canViewClinicalHistory
      ? (clinicalStore.vitals.get(patient.id) || []).filter((v) => v.hospitalId === hospitalId)
      : [];

    const allergies = canViewClinicalHistory
      ? (clinicalStore.allergies.get(patient.id) || []).filter((al) => al.hospitalId === hospitalId)
      : [];

    const prescriptions = canViewPrescriptions
      ? Array.from(clinicalStore.prescriptions.values())
          .filter((rx) => (rx.patientId === patient.id || rx.patientId === patient.userId) && rx.hospitalId === hospitalId)
          .map((rx) => {
            const doc = clinicalStore.doctors.get(rx.doctorId);
            return {
              ...rx,
              doctorName: doc?.fullName || 'Prescribing Doctor',
            };
          })
      : [];

    const labReports = canViewLabReports
      ? Array.from(opsStore.labOrders.values()).filter(
          (l) => (l.patientId === patient.id || l.patientId === patient.userId) && l.hospitalId === hospitalId
        )
      : [];

    const documents = Array.from(clinicalStore.documents.values())
      .filter((d) => (d.patientId === patient.id || d.patientId === patient.userId) && d.hospitalId === hospitalId)
      .map(({ contentBase64, ...meta }) => meta);

    const activityHistory = db.auditLogs
      .filter((log) => log.hospitalId === hospitalId && log.entityId === patient.id)
      .slice(0, 25)
      .map((log) => {
        const actor = log.userId ? db.users.get(log.userId) : null;
        return {
          id: log.id,
          action: log.action,
          actorName: actor?.fullName || 'Hospital Staff',
          createdAt: log.createdAt.toISOString(),
          metadata: log.metadata,
        };
      });

    return {
      patient: {
        ...patient,
        hospitalRegistrationNumber: link.hospitalRegistrationNumber,
        patientStatus: link.status || 'ACTIVE',
        registrationDate: link.registeredAt || patient.createdAt || new Date().toISOString(),
      },
      hospital: hospital
        ? { id: hospital.id, name: hospital.name, city: hospital.city, state: hospital.state }
        : null,
      assignedDoctor,
      permissions: {
        canViewClinicalHistory,
        canViewPrescriptions,
        canViewLabReports,
        canEditDemographics: actorRoles.some((r) =>
          ['HOSPITAL_ADMIN', 'RECEPTIONIST', 'NURSE', 'DOCTOR', 'SUPER_ADMIN'].includes(r)
        ),
        canManageStatus: actorRoles.some((r) => ['HOSPITAL_ADMIN', 'RECEPTIONIST', 'SUPER_ADMIN'].includes(r)),
      },
      appointments,
      encounters,
      vitals,
      allergies,
      prescriptions,
      labReports,
      documents,
      activityHistory,
    };
  }

  static updatePatientInHospital(
    patientId: string,
    hospitalId: string,
    actorUserId: string,
    payload: Partial<{
      fullName: string;
      phone: string;
      email: string;
      dateOfBirth: string;
      gender: string;
      bloodGroup: string;
      address: string;
      city: string;
      state: string;
      postalCode: string;
      emergencyContactName: string;
      emergencyContactRelationship: string;
      emergencyContactPhone: string;
      assignedDoctorId: string | null;
      medicalNotes: string | null;
    }>
  ) {
    const patient = clinicalStore.patients.get(patientId);
    if (!patient) {
      throw ApiError.notFound('Patient not found');
    }
    const link = patient.hospitalLinks.find((l) => l.hospitalId === hospitalId);
    if (!link) {
      throw ApiError.forbidden(
        'Cross-hospital isolation: You cannot update a patient belonging to another hospital',
        'TENANT_ISOLATION_VIOLATION'
      );
    }

    const updatedFields: string[] = [];
    if (payload.fullName !== undefined && payload.fullName.trim()) {
      patient.fullName = payload.fullName.trim();
      updatedFields.push('fullName');
    }
    if (payload.phone !== undefined && payload.phone.trim()) {
      patient.phone = payload.phone.trim();
      updatedFields.push('phone');
    }
    if (payload.email !== undefined && payload.email.trim()) {
      patient.email = payload.email.toLowerCase().trim();
      updatedFields.push('email');
    }
    if (payload.dateOfBirth !== undefined) {
      patient.dateOfBirth = payload.dateOfBirth;
      updatedFields.push('dateOfBirth');
    }
    if (payload.gender !== undefined) {
      patient.gender = payload.gender;
      updatedFields.push('gender');
    }
    if (payload.bloodGroup !== undefined) {
      patient.bloodGroup = payload.bloodGroup;
      updatedFields.push('bloodGroup');
    }
    if (payload.address !== undefined) {
      patient.address = payload.address.trim();
      updatedFields.push('address');
    }
    if (payload.city !== undefined) {
      patient.city = payload.city.trim();
      updatedFields.push('city');
    }
    if (payload.state !== undefined) {
      patient.state = payload.state.trim();
      updatedFields.push('state');
    }
    if (payload.postalCode !== undefined) {
      patient.postalCode = payload.postalCode.trim();
      updatedFields.push('postalCode');
    }
    if (payload.emergencyContactName !== undefined) {
      patient.emergencyContactName = payload.emergencyContactName.trim();
      updatedFields.push('emergencyContactName');
    }
    if (payload.emergencyContactRelationship !== undefined) {
      patient.emergencyContactRelationship = payload.emergencyContactRelationship.trim();
      updatedFields.push('emergencyContactRelationship');
    }
    if (payload.emergencyContactPhone !== undefined) {
      patient.emergencyContactPhone = payload.emergencyContactPhone.trim();
      updatedFields.push('emergencyContactPhone');
    }
    if (payload.assignedDoctorId !== undefined) {
      patient.assignedDoctorId = payload.assignedDoctorId || null;
      updatedFields.push('assignedDoctorId');
    }
    if (payload.medicalNotes !== undefined) {
      patient.medicalNotes = payload.medicalNotes;
      updatedFields.push('medicalNotes');
    }
    patient.updatedAt = new Date().toISOString();

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'HOSPITAL_PATIENT_UPDATED',
      entityType: 'Patient',
      entityId: patient.id,
      ipAddress: null,
      userAgent: null,
      metadata: { updatedFields },
    });

    return patient;
  }

  static updatePatientStatusInHospital(
    patientId: string,
    hospitalId: string,
    actorUserId: string,
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
    reason?: string
  ) {
    const patient = clinicalStore.patients.get(patientId);
    if (!patient) {
      throw ApiError.notFound('Patient not found');
    }
    const link = patient.hospitalLinks.find((l) => l.hospitalId === hospitalId);
    if (!link) {
      throw ApiError.forbidden(
        'Cross-hospital isolation: You cannot change status for a patient outside your hospital',
        'TENANT_ISOLATION_VIOLATION'
      );
    }

    const allowedStatuses = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];
    const normalized = String(status).toUpperCase() as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    if (!allowedStatuses.includes(normalized)) {
      throw ApiError.badRequest('Invalid patient status. Must be ACTIVE, INACTIVE, or ARCHIVED.');
    }

    const previousStatus = link.status;
    link.status = normalized;
    patient.updatedAt = new Date().toISOString();

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'HOSPITAL_PATIENT_STATUS_CHANGED',
      entityType: 'Patient',
      entityId: patient.id,
      ipAddress: null,
      userAgent: null,
      metadata: { previousStatus, newStatus: normalized, reason: reason || null },
    });

    return {
      patientId: patient.id,
      globalPatientId: patient.globalPatientId,
      hospitalId,
      status: link.status,
      updatedAt: patient.updatedAt,
    };
  }

  static uploadPatientDocument(
    patientId: string,
    hospitalId: string,
    actorUserId: string,
    payload: {
      title: string;
      documentType: 'DISCHARGE_SUMMARY' | 'RADIOLOGY' | 'CONSENT_FORM' | 'EXTERNAL_REPORT' | 'LAB_ATTACHMENT';
      mimeType: string;
      fileSizeBytes?: number;
      contentBase64?: string;
      encounterId?: string;
    }
  ) {
    const patient = clinicalStore.patients.get(patientId);
    if (!patient) throw ApiError.notFound('Patient not found');
    const link = patient.hospitalLinks.find((l) => l.hospitalId === hospitalId);
    if (!link) {
      throw ApiError.forbidden('Cross-hospital isolation: Cannot upload documents to another hospital\'s patient', 'TENANT_ISOLATION_VIOLATION');
    }

    if (!payload.title || !payload.title.trim()) {
      throw ApiError.badRequest('Document title is required');
    }

    const allowedMimes = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];
    const mime = (payload.mimeType || 'application/pdf').toLowerCase().trim();
    if (!allowedMimes.includes(mime)) {
      throw ApiError.badRequest(`Unsupported file type "${mime}". Allowed: PDF, PNG, JPEG, TXT.`);
    }

    const rawBase64 = (payload.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
    const computedBytes = rawBase64 ? Buffer.byteLength(rawBase64, 'base64') : Number(payload.fileSizeBytes) || 1024;
    const maxBytes = 2 * 1024 * 1024; // 2 MB limit
    if (computedBytes > maxBytes) {
      throw ApiError.badRequest('Document exceeds maximum allowed file size of 2 MB');
    }

    const actor = db.users.get(actorUserId);
    const id = crypto.randomUUID();
    const doc: ClinicalDocumentRecord = {
      id,
      patientId: patient.id,
      hospitalId,
      encounterId: payload.encounterId || null,
      title: payload.title.trim(),
      documentType: payload.documentType || 'EXTERNAL_REPORT',
      mimeType: mime,
      fileSizeBytes: computedBytes,
      storageKey: `private://${hospitalId}/patients/${patient.id}/${id}`,
      uploadedByUserId: actorUserId,
      uploadedByName: actor?.fullName || 'Authorized Clinical Staff',
      createdAt: new Date().toISOString(),
      contentBase64:
        rawBase64 ||
        Buffer.from(
          `MediCore Private Clinical Document\nDocument ID: ${id}\nTitle: ${payload.title.trim()}\nPatient: ${patient.fullName} (${patient.globalPatientId})\nHospital ID: ${hospitalId}\nUploaded At: ${new Date().toISOString()}\n`
        ).toString('base64'),
    };
    clinicalStore.documents.set(id, doc);

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'PATIENT_DOCUMENT_UPLOADED',
      entityType: 'ClinicalDocument',
      entityId: id,
      ipAddress: null,
      userAgent: null,
      metadata: { patientId: patient.id, title: doc.title, documentType: doc.documentType, fileSizeBytes: doc.fileSizeBytes },
    });

    const { contentBase64, ...meta } = doc;
    return meta;
  }

  static createSignedDocumentDownloadUrl(
    patientId: string,
    documentId: string,
    hospitalId: string,
    actorUserId: string
  ) {
    const doc = clinicalStore.documents.get(documentId);
    if (!doc || doc.patientId !== patientId) {
      throw ApiError.notFound('Clinical document not found');
    }
    if (doc.hospitalId !== hospitalId) {
      throw ApiError.forbidden('Cross-hospital isolation: Document belongs to another hospital', 'TENANT_ISOLATION_VIOLATION');
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5-minute short-lived signed URL
    clinicalStore.signedDownloadTokens.set(token, {
      documentId: doc.id,
      hospitalId,
      patientId,
      expiresAt,
    });

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'PATIENT_DOCUMENT_DOWNLOAD_AUTHORIZED',
      entityType: 'ClinicalDocument',
      entityId: doc.id,
      ipAddress: null,
      userAgent: null,
      metadata: { patientId, title: doc.title, expiresInSeconds: 300 },
    });

    return {
      documentId: doc.id,
      title: doc.title,
      mimeType: doc.mimeType,
      fileSizeBytes: doc.fileSizeBytes,
      signedDownloadPath: `/patients/${patientId}/documents/${doc.id}/stream?token=${token}`,
      expiresAt: new Date(expiresAt).toISOString(),
      contentBase64: doc.contentBase64,
    };
  }

  static grantCrossHospitalEhrConsent(patientId: string, sourceHospitalId: string, targetHospitalId: string) {
    const patient = clinicalStore.patients.get(patientId);
    if (!patient) throw ApiError.notFound('Patient not found');
    const link = patient.hospitalLinks.find((l) => l.hospitalId === sourceHospitalId);
    if (!link) throw ApiError.forbidden('Patient has no primary link at source hospital');
    if (!link.consentToShareWithHospitalIds.includes(targetHospitalId)) {
      link.consentToShareWithHospitalIds.push(targetHospitalId);
    }
    return patient;
  }

  // -------------------------------------------------------------------------
  // Appointment Scheduling, Reschedule & Status Transitions (Phase 5)
  // -------------------------------------------------------------------------
  static bookAppointment(
    hospitalId: string,
    bookedByUserId: string,
    payload: {
      departmentId: string;
      doctorId: string;
      patientId: string;
      appointmentDate: string;
      slotStartTime: string;
      slotEndTime: string;
      type?: 'OPD' | 'WALK_IN' | 'FOLLOW_UP';
      reasonForVisit: string;
    }
  ) {
    // Prevent booking in the past (compare YYYY-MM-DD against today's UTC/local date)
    const todayStr = new Date().toISOString().slice(0, 10);
    if (payload.appointmentDate < todayStr) {
      throw ApiError.badRequest(
        `Cannot book an appointment on a past date (${payload.appointmentDate})`,
        'PAST_DATE_BOOKING_BLOCKED'
      );
    }

    // Check doctor blocked/leave rules for that date
    const blockedRules = (clinicalStore.doctorBlockedTimes.get(payload.doctorId) || []).filter(
      (b) => b.blockedDate === payload.appointmentDate
    );
    for (const block of blockedRules) {
      if (block.isFullDayLeave) {
        throw ApiError.conflict(
          `Doctor is on full-day leave on ${payload.appointmentDate} (${block.reason})`,
          'DOCTOR_UNAVAILABLE_ON_LEAVE'
        );
      }
      if (block.startTime && block.endTime && payload.slotStartTime >= block.startTime && payload.slotStartTime < block.endTime) {
        throw ApiError.conflict(
          `Slot ${payload.slotStartTime} falls within blocked period (${block.startTime}-${block.endTime}: ${block.reason})`,
          'SLOT_BLOCKED_BY_DOCTOR'
        );
      }
    }

    // Prevent double-booking of the same doctor + date + slotStartTime unless cancelled
    const conflict = Array.from(clinicalStore.appointments.values()).find(
      (a) =>
        a.doctorId === payload.doctorId &&
        a.appointmentDate === payload.appointmentDate &&
        a.slotStartTime === payload.slotStartTime &&
        a.status !== 'CANCELLED'
    );
    if (conflict) {
      throw ApiError.conflict(
        `Slot ${payload.slotStartTime} on ${payload.appointmentDate} is already booked for this doctor`,
        'SLOT_ALREADY_BOOKED'
      );
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const record: AppointmentRecord = {
      id,
      appointmentNumber: `APT-${Date.now().toString().slice(-6)}`,
      hospitalId,
      departmentId: payload.departmentId,
      doctorId: payload.doctorId,
      patientId: payload.patientId,
      appointmentDate: payload.appointmentDate,
      slotStartTime: payload.slotStartTime,
      slotEndTime: payload.slotEndTime,
      timezone: 'Asia/Kolkata',
      type: payload.type || 'OPD',
      status: 'CONFIRMED',
      reasonForVisit: payload.reasonForVisit,
      bookedByUserId,
      createdAt: nowIso,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: 'CONFIRMED',
          changedByUserId: bookedByUserId,
          changedByRole: 'STAFF',
          notes: 'Appointment booked and confirmed',
          changedAt: nowIso,
        },
      ],
    };
    clinicalStore.appointments.set(id, record);

    db.logAudit({
      userId: bookedByUserId,
      hospitalId,
      action: 'APPOINTMENT_BOOKED',
      entityType: 'Appointment',
      entityId: id,
      ipAddress: null,
      userAgent: null,
      metadata: {
        appointmentNumber: record.appointmentNumber,
        doctorId: record.doctorId,
        patientId: record.patientId,
        appointmentDate: record.appointmentDate,
        slotStartTime: record.slotStartTime,
      },
    });

    // Enqueue real in-app outbox notification for appointment confirmation
    const pat = clinicalStore.patients.get(record.patientId);
    const doc = clinicalStore.doctors.get(record.doctorId);
    SecurityAndNotificationService.enqueueOutboxNotification({
      idempotencyKey: `apt-booked-${record.id}`,
      hospitalId,
      recipientUserId: pat?.userId || bookedByUserId,
      category: 'APPOINTMENT',
      eventType: 'APPOINTMENT_CONFIRMED',
      authenticatedBody: `Appointment ${record.appointmentNumber} confirmed with ${doc?.fullName || 'Attending Physician'} on ${record.appointmentDate} at ${record.slotStartTime}.`,
      deepLinkRoute: '/appointments',
    });

    return record;
  }

  static getAppointmentDashboard(hospitalId: string) {
    const depts = this.ensureHospitalDepartmentsSynced(hospitalId);
    const doctors = Array.from(clinicalStore.doctors.values()).filter((d) => d.hospitalId === hospitalId);
    const appointments = Array.from(clinicalStore.appointments.values()).filter((a) => a.hospitalId === hospitalId);
    const todayStr = new Date().toISOString().slice(0, 10);

    const enrichApt = (a: AppointmentRecord, queueIdx?: number) => {
      const pat = clinicalStore.patients.get(a.patientId);
      const doc = clinicalStore.doctors.get(a.doctorId);
      const dept = clinicalStore.departments.get(a.departmentId);
      const checkInEvent = a.statusHistory.find((h) => h.toStatus === 'CHECKED_IN');
      return {
        ...a,
        patientName: pat?.fullName || 'Registered Patient',
        patientPhone: pat?.phone || '',
        globalPatientId: pat?.globalPatientId || '',
        doctorName: doc?.fullName || 'Attending Doctor',
        doctorSpecialization: doc?.specialization || 'General',
        departmentName: dept?.name || doc?.departmentName || 'Outpatient',
        checkedInAt: checkInEvent?.changedAt || null,
        queuePosition: typeof queueIdx === 'number' ? queueIdx + 1 : null,
      };
    };

    const todayList = appointments
      .filter((a) => a.appointmentDate === todayStr)
      .sort((a, b) => a.slotStartTime.localeCompare(b.slotStartTime));

    const upcomingList = appointments
      .filter((a) => a.appointmentDate >= todayStr && a.status !== 'CANCELLED' && a.status !== 'COMPLETED')
      .sort((a, b) => `${a.appointmentDate} ${a.slotStartTime}`.localeCompare(`${b.appointmentDate} ${b.slotStartTime}`));

    const waitingQueue = todayList.filter((a) => a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS');
    const rescheduledCount = appointments.filter((a) =>
      a.statusHistory.some((h) => h.notes && h.notes.toLowerCase().includes('rescheduled'))
    ).length;

    const departmentDistribution = depts.map((d) => ({
      departmentId: d.id,
      departmentName: d.name,
      count: appointments.filter((a) => a.departmentId === d.id).length,
    }));

    const doctorDistribution = doctors.map((d) => ({
      doctorId: d.id,
      doctorName: d.fullName,
      specialization: d.specialization,
      departmentName: d.departmentName,
      count: appointments.filter((a) => a.doctorId === d.id).length,
    }));

    const recentActivity = db.auditLogs
      .filter((l) => l.hospitalId === hospitalId && l.entityType === 'Appointment')
      .slice(0, 15)
      .map((l) => {
        const actor = l.userId ? db.users.get(l.userId) : null;
        return {
          id: l.id,
          action: l.action,
          actorName: actor?.fullName || 'Hospital Staff',
          createdAt: l.createdAt.toISOString(),
          metadata: l.metadata,
        };
      });

    return {
      statistics: {
        totalAppointments: appointments.length,
        todayAppointments: todayList.length,
        upcomingAppointments: upcomingList.length,
        completedAppointments: appointments.filter((a) => a.status === 'COMPLETED').length,
        pendingAppointments: appointments.filter((a) => a.status === 'PENDING' || a.status === 'CONFIRMED').length,
        cancelledAppointments: appointments.filter((a) => a.status === 'CANCELLED').length,
        rescheduledAppointments: rescheduledCount,
        waitingPatientsCount: waitingQueue.length,
      },
      departmentDistribution,
      doctorDistribution,
      todayAppointmentsList: todayList.map((a, idx) => enrichApt(a, idx)),
      upcomingAppointmentsList: upcomingList.slice(0, 20).map((a) => enrichApt(a)),
      recentActivity,
    };
  }

  static updateAppointmentStatusInHospital(
    hospitalId: string,
    appointmentId: string,
    actorUserId: string,
    actorRole: string,
    payload: {
      status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
      notes?: string;
    }
  ) {
    const apt = clinicalStore.appointments.get(appointmentId);
    if (!apt || apt.hospitalId !== hospitalId) {
      throw ApiError.notFound('Appointment not found in this hospital');
    }

    const prevStatus = apt.status;
    apt.status = payload.status;
    if (payload.status === 'CANCELLED' && payload.notes) {
      apt.cancellationReason = payload.notes;
    }
    apt.statusHistory.push({
      fromStatus: prevStatus,
      toStatus: payload.status,
      changedByUserId: actorUserId,
      changedByRole: actorRole,
      notes: payload.notes || `Status updated to ${payload.status}`,
      changedAt: new Date().toISOString(),
    });

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: `APPOINTMENT_STATUS_${payload.status}`,
      entityType: 'Appointment',
      entityId: apt.id,
      ipAddress: null,
      userAgent: null,
      metadata: { fromStatus: prevStatus, toStatus: payload.status, notes: payload.notes },
    });

    return apt;
  }

  static rescheduleAppointmentInHospital(
    hospitalId: string,
    appointmentId: string,
    actorUserId: string,
    payload: {
      appointmentDate: string;
      slotStartTime: string;
      slotEndTime: string;
      doctorId?: string;
      notes?: string;
    }
  ) {
    const apt = clinicalStore.appointments.get(appointmentId);
    if (!apt || apt.hospitalId !== hospitalId) {
      throw ApiError.notFound('Appointment not found in this hospital');
    }
    if (apt.status === 'COMPLETED' || apt.status === 'CANCELLED') {
      throw ApiError.badRequest(`Cannot reschedule a ${apt.status.toLowerCase()} appointment`);
    }

    const targetDoctorId = payload.doctorId || apt.doctorId;
    const conflict = Array.from(clinicalStore.appointments.values()).find(
      (a) =>
        a.id !== appointmentId &&
        a.doctorId === targetDoctorId &&
        a.appointmentDate === payload.appointmentDate &&
        a.slotStartTime === payload.slotStartTime &&
        a.status !== 'CANCELLED'
    );
    if (conflict) {
      throw ApiError.conflict(
        `Slot ${payload.slotStartTime} on ${payload.appointmentDate} is already booked for this doctor`,
        'SLOT_ALREADY_BOOKED'
      );
    }

    const prevSlot = `${apt.appointmentDate} ${apt.slotStartTime}`;
    apt.doctorId = targetDoctorId;
    apt.appointmentDate = payload.appointmentDate;
    apt.slotStartTime = payload.slotStartTime;
    apt.slotEndTime = payload.slotEndTime;
    apt.statusHistory.push({
      fromStatus: apt.status,
      toStatus: apt.status,
      changedByUserId: actorUserId,
      changedByRole: 'HOSPITAL_STAFF',
      notes: payload.notes || `Rescheduled from ${prevSlot} to ${payload.appointmentDate} ${payload.slotStartTime}`,
      changedAt: new Date().toISOString(),
    });

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'APPOINTMENT_RESCHEDULED',
      entityType: 'Appointment',
      entityId: apt.id,
      ipAddress: null,
      userAgent: null,
      metadata: {
        previousSlot: prevSlot,
        newDate: payload.appointmentDate,
        newSlotStartTime: payload.slotStartTime,
      },
    });

    return apt;
  }

  // -------------------------------------------------------------------------
  // Hospital Admin Dashboard Overview & Reports (Phase 5)
  // -------------------------------------------------------------------------
  static getHospitalDashboardOverview(hospitalId: string) {
    const hospital = db.hospitals.get(hospitalId);
    const depts = this.ensureHospitalDepartmentsSynced(hospitalId);
    const patients = this.listPatients(hospitalId);
    const doctors = Array.from(clinicalStore.doctors.values()).filter((d) => d.hospitalId === hospitalId);
    const staff = this.listHospitalStaff(hospitalId);
    const appointments = Array.from(clinicalStore.appointments.values()).filter((a) => a.hospitalId === hospitalId);
    const encounters = Array.from(clinicalStore.encounters.values()).filter((e) => e.hospitalId === hospitalId);
    const fin = OperationsAndBillingService.getFinancialAnalytics(hospitalId);

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayAppointments = appointments.filter((a) => a.appointmentDate === todayStr).length;
    const pendingAppointments = appointments.filter((a) => a.status === 'PENDING' || a.status === 'CONFIRMED' || a.status === 'CHECKED_IN').length;
    const completedConsultations =
      appointments.filter((a) => a.status === 'COMPLETED').length +
      encounters.filter((e) => e.status === 'FINALIZED' || e.status === 'AMENDED').length;
    const cancelledAppointments = appointments.filter((a) => a.status === 'CANCELLED').length;

    const departmentPerformance = depts.map((d) => {
      const deptDocs = doctors.filter((doc) => doc.departmentId === d.id || doc.departmentName === d.name).length;
      const deptApts = appointments.filter((a) => a.departmentId === d.id).length;
      return {
        departmentId: d.id,
        departmentName: d.name,
        code: d.code,
        doctorsCount: deptDocs,
        appointmentsCount: deptApts,
      };
    });

    const recentAppointments = appointments.slice(-10).reverse().map((a) => {
      const pat = clinicalStore.patients.get(a.patientId);
      const doc = clinicalStore.doctors.get(a.doctorId);
      const dept = clinicalStore.departments.get(a.departmentId);
      return {
        ...a,
        patientName: pat?.fullName || 'Registered Patient',
        doctorName: doc?.fullName || 'Attending Physician',
        departmentName: dept?.name || doc?.departmentName || 'General',
      };
    });

    const recentPatients = patients.slice(-8).reverse().map((p) => {
      const link = p.hospitalLinks.find((l) => l.hospitalId === hospitalId) || p.hospitalLinks[0];
      return {
        id: p.id,
        globalPatientId: p.globalPatientId,
        fullName: p.fullName,
        phone: p.phone,
        gender: p.gender,
        bloodGroup: p.bloodGroup,
        status: link?.status || 'ACTIVE',
        registeredAt: link?.registeredAt || p.createdAt || new Date().toISOString(),
      };
    });

    const recentActivity = db.auditLogs
      .filter((l) => l.hospitalId === hospitalId)
      .slice(0, 12)
      .map((l) => {
        const actor = l.userId ? db.users.get(l.userId) : null;
        return {
          id: l.id,
          action: l.action,
          entityType: l.entityType,
          entityId: l.entityId,
          actorName: actor?.fullName || 'Hospital Staff',
          createdAt: l.createdAt.toISOString(),
        };
      });

    return {
      hospital: hospital || null,
      statistics: {
        totalPatients: patients.length,
        totalDoctors: doctors.length,
        totalStaff: staff.length,
        totalDepartments: depts.length,
        todayAppointments,
        pendingAppointments,
        completedConsultations,
        cancelledAppointments,
        collectedRevenuePaise: fin.collectedCashPaise,
        grossInvoicedPaise: fin.grossInvoicedPaise,
        outstandingReceivablesPaise: fin.outstandingReceivablesPaise,
      },
      financialSummary: fin,
      departmentPerformance,
      recentAppointments,
      recentPatients,
      recentActivity,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  static recordVitals(
    hospitalId: string,
    recordedByUserId: string,
    payload: {
      patientId: string;
      systolicBp: number;
      diastolicBp: number;
      heartRateBpm: number;
      temperatureCelsius: number;
      respiratoryRate: number;
      oxygenSaturation: number;
      heightCm: number;
      weightKg: number;
      measurementSource?: string;
    }
  ) {
    const heightM = payload.heightCm / 100;
    const bmi = Number((payload.weightKg / (heightM * heightM)).toFixed(2));
    const entry: VitalRecord = {
      id: crypto.randomUUID(),
      patientId: payload.patientId,
      hospitalId,
      systolicBp: payload.systolicBp,
      diastolicBp: payload.diastolicBp,
      heartRateBpm: payload.heartRateBpm,
      temperatureCelsius: payload.temperatureCelsius,
      respiratoryRate: payload.respiratoryRate,
      oxygenSaturation: payload.oxygenSaturation,
      heightCm: payload.heightCm,
      weightKg: payload.weightKg,
      bmi,
      measurementSource: payload.measurementSource || 'Ward Vital Monitor',
      recordedByUserId,
      recordedAt: new Date().toISOString(),
    };
    const existing = clinicalStore.vitals.get(payload.patientId) || [];
    existing.unshift(entry);
    clinicalStore.vitals.set(payload.patientId, existing);
    return entry;
  }

  static amendFinalizedEncounter(
    encounterId: string,
    hospitalId: string,
    authorUserId: string,
    payload: { reason: string; symptoms: string; assessment: string }
  ) {
    const enc = clinicalStore.encounters.get(encounterId);
    if (!enc || enc.hospitalId !== hospitalId) {
      throw ApiError.notFound('Encounter not found in this hospital');
    }
    if (!payload.reason || payload.reason.trim().length < 5) {
      throw ApiError.badRequest('Amendment reason is required for finalized clinical encounters');
    }
    enc.amendmentHistory.push({
      versionNumber: enc.version,
      authorUserId,
      reason: payload.reason,
      symptoms: enc.symptoms,
      assessment: enc.assessment,
      amendedAt: new Date().toISOString(),
    });
    enc.version += 1;
    enc.status = 'AMENDED';
    enc.symptoms = payload.symptoms;
    enc.assessment = payload.assessment;
    db.logAudit({
      userId: authorUserId,
      hospitalId,
      action: 'CLINICAL_ENCOUNTER_AMENDED',
      entityType: 'Encounter',
      entityId: encounterId,
      ipAddress: null,
      userAgent: null,
      metadata: { newVersion: enc.version, reason: payload.reason },
    });
    return enc;
  }

  static getPatientEhrTimeline(patientId: string, hospitalId: string, actorUserId?: string) {
    const patient = clinicalStore.patients.get(patientId);
    if (!patient) throw ApiError.notFound('Patient not found');
    const isOwner = actorUserId && (patient.userId === actorUserId || patient.id === actorUserId);
    const authorized =
      isOwner ||
      patient.hospitalLinks.some(
        (l) => l.hospitalId === hospitalId || l.consentToShareWithHospitalIds.includes(hospitalId)
      );
    if (!authorized) {
      throw ApiError.forbidden(
        'Cross-hospital EHR access denied without explicit patient consent',
        'EHR_CONSENT_REQUIRED'
      );
    }

    const encounters = Array.from(clinicalStore.encounters.values()).filter((e) => e.patientId === patientId);
    const vitals = clinicalStore.vitals.get(patientId) || [];
    const allergies = clinicalStore.allergies.get(patientId) || [];
    const prescriptions = Array.from(clinicalStore.prescriptions.values()).filter((p) => p.patientId === patientId);

    return {
      patient,
      allergies,
      vitals,
      encounters,
      prescriptions,
    };
  }

  static getDoctor(doctorId: string) {
    const doc = clinicalStore.doctors.get(doctorId);
    if (!doc) {
      throw ApiError.notFound('Doctor not found');
    }
    return doc;
  }

  static getDoctorAvailability(doctorId: string, date: string) {
    const doc = this.getDoctor(doctorId);
    const duration = doc.slotDurationMinutes || 30;
    const schedule = this.ensureDefaultDoctorSchedule(doc.id, doc.hospitalId, duration);

    const parsedDate = new Date(`${date}T00:00:00`);
    const dayOfWeek = Number.isNaN(parsedDate.getTime()) ? 1 : parsedDate.getDay();
    const dayRule = schedule.find((r) => r.dayOfWeek === dayOfWeek);

    const blockedRules = (clinicalStore.doctorBlockedTimes.get(doctorId) || []).filter(
      (b) => b.blockedDate === date
    );
    const isFullDayBlocked = blockedRules.some((b) => b.isFullDayLeave);

    const rawTimes = [
      { start: '09:00', end: '09:30' },
      { start: '09:30', end: '10:00' },
      { start: '10:00', end: '10:30' },
      { start: '10:30', end: '11:00' },
      { start: '11:00', end: '11:30' },
      { start: '11:30', end: '12:00' },
      { start: '12:00', end: '12:30' },
      { start: '12:30', end: '13:00' },
      { start: '14:00', end: '14:30' },
      { start: '14:30', end: '15:00' },
      { start: '15:00', end: '15:30' },
      { start: '15:30', end: '16:00' },
      { start: '16:00', end: '16:30' },
      { start: '16:30', end: '17:00' },
    ];

    const bookedAppointments = Array.from(clinicalStore.appointments.values()).filter(
      (a) => a.doctorId === doctorId && a.appointmentDate === date && a.status !== 'CANCELLED'
    );

    const slots = rawTimes
      .filter((slot) => {
        if (!dayRule) return true;
        if (!dayRule.isActive) return false;
        return slot.start >= dayRule.startTime && slot.end <= dayRule.endTime;
      })
      .map((slot) => {
        const isBooked = bookedAppointments.some((a) => a.slotStartTime === slot.start);
        const isBlocked =
          isFullDayBlocked ||
          blockedRules.some(
            (b) => !b.isFullDayLeave && b.startTime && b.endTime && slot.start >= b.startTime && slot.start < b.endTime
          );
        return {
          slotStartTime: slot.start,
          slotEndTime: slot.end,
          isAvailable: !isBooked && !isBlocked,
          isBooked,
          isBlocked,
        };
      });

    return {
      doctorId,
      doctorName: doc.fullName,
      specialization: doc.specialization,
      departmentName: doc.departmentName,
      date,
      dayOfWeek,
      isWorkingDay: dayRule ? dayRule.isActive && !isFullDayBlocked : !isFullDayBlocked,
      blockedReasons: blockedRules.map((b) => b.reason),
      slotDurationMinutes: duration,
      slots,
    };
  }

  static createEncounterInHospital(
    hospitalId: string,
    actorUserId: string,
    payload: {
      patientId: string;
      doctorId?: string;
      appointmentId?: string;
      encounterType?: 'OPD' | 'WALK_IN' | 'IPD' | 'EMERGENCY';
      symptoms: string;
      examinationFindings?: string;
      assessment: string;
      diagnoses?: Array<{ icd10Code: string; diagnosisName: string; classification: 'PRIMARY' | 'SECONDARY' }>;
      treatmentPlan?: {
        clinicalGoals: string;
        treatmentInstructions: string;
        followUpInstructions: string;
        reviewDate: string;
      };
      finalizeImmediately?: boolean;
    }
  ) {
    if (!payload.patientId || !payload.symptoms || !payload.assessment) {
      throw ApiError.badRequest('patientId, symptoms, and assessment are required to record a consultation');
    }
    const patient = clinicalStore.patients.get(payload.patientId);
    if (!patient) throw ApiError.notFound('Patient not found');

    let doctorId = payload.doctorId;
    if (!doctorId) {
      const selfDoc = Array.from(clinicalStore.doctors.values()).find(
        (d) => d.userId === actorUserId && d.hospitalId === hospitalId
      );
      const firstDoc = Array.from(clinicalStore.doctors.values()).find((d) => d.hospitalId === hospitalId);
      doctorId = selfDoc?.id || firstDoc?.id || actorUserId;
    }

    const nowIso = new Date().toISOString();
    const id = crypto.randomUUID();
    const enc: EncounterRecord = {
      id,
      patientId: payload.patientId,
      hospitalId,
      doctorId,
      appointmentId: payload.appointmentId,
      encounterType: payload.encounterType || 'OPD',
      status: payload.finalizeImmediately !== false ? 'FINALIZED' : 'IN_PROGRESS',
      version: 1,
      symptoms: payload.symptoms.trim(),
      examinationFindings: payload.examinationFindings?.trim() || 'Standard clinical examination completed.',
      assessment: payload.assessment.trim(),
      diagnoses: payload.diagnoses || [],
      treatmentPlan: payload.treatmentPlan,
      amendmentHistory: [],
      finalizedAt: payload.finalizeImmediately !== false ? nowIso : undefined,
      createdAt: nowIso,
    };
    clinicalStore.encounters.set(id, enc);

    if (payload.appointmentId) {
      const apt = clinicalStore.appointments.get(payload.appointmentId);
      if (apt && apt.hospitalId === hospitalId) {
        apt.status = 'COMPLETED';
        apt.statusHistory.push({
          fromStatus: 'IN_PROGRESS',
          toStatus: 'COMPLETED',
          changedByUserId: actorUserId,
          changedByRole: 'DOCTOR',
          notes: 'Consultation finalized',
          changedAt: nowIso,
        });
      }
    }

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'CLINICAL_ENCOUNTER_CREATED',
      entityType: 'Encounter',
      entityId: id,
      ipAddress: null,
      userAgent: null,
      metadata: { patientId: payload.patientId, status: enc.status },
    });

    return enc;
  }

  static createPrescriptionInHospital(
    hospitalId: string,
    actorUserId: string,
    payload: {
      patientId: string;
      doctorId?: string;
      encounterId?: string;
      notes?: string;
      items: Array<{
        medicineName: string;
        strength: string;
        dosage: string;
        route?: string;
        frequency: string;
        durationDays: number;
        quantity: number;
        instructions: string;
      }>;
    }
  ) {
    if (!payload.patientId || !Array.isArray(payload.items) || payload.items.length === 0) {
      throw ApiError.badRequest('patientId and at least one prescribed medicine item are required');
    }
    const patient = clinicalStore.patients.get(payload.patientId);
    if (!patient) throw ApiError.notFound('Patient not found');

    let doctorId = payload.doctorId;
    if (!doctorId) {
      const selfDoc = Array.from(clinicalStore.doctors.values()).find(
        (d) => d.userId === actorUserId && d.hospitalId === hospitalId
      );
      const firstDoc = Array.from(clinicalStore.doctors.values()).find((d) => d.hospitalId === hospitalId);
      doctorId = selfDoc?.id || firstDoc?.id || actorUserId;
    }

    const nowIso = new Date().toISOString();
    const id = crypto.randomUUID();
    const rx: PrescriptionRecord = {
      id,
      prescriptionNumber: `RX-${Date.now().toString().slice(-6)}`,
      patientId: payload.patientId,
      doctorId,
      hospitalId,
      encounterId: payload.encounterId || crypto.randomUUID(),
      status: 'SIGNED',
      digitalSignature: `SIG-SHA256-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
      signedAt: nowIso,
      notes: payload.notes?.trim() || '',
      createdAt: nowIso,
      items: payload.items.map((item) => ({
        id: crypto.randomUUID(),
        medicineName: item.medicineName.trim(),
        strength: item.strength.trim(),
        dosage: item.dosage.trim(),
        route: item.route || 'Oral',
        frequency: item.frequency.trim(),
        durationDays: Number(item.durationDays) || 5,
        quantity: Number(item.quantity) || 10,
        instructions: item.instructions?.trim() || 'Take as directed by physician',
      })),
    };
    clinicalStore.prescriptions.set(id, rx);

    db.logAudit({
      userId: actorUserId,
      hospitalId,
      action: 'PRESCRIPTION_SIGNED',
      entityType: 'Prescription',
      entityId: id,
      ipAddress: null,
      userAgent: null,
      metadata: { prescriptionNumber: rx.prescriptionNumber, patientId: rx.patientId, itemCount: rx.items.length },
    });

    SecurityAndNotificationService.enqueueOutboxNotification({
      idempotencyKey: `rx-signed-${rx.id}`,
      hospitalId,
      recipientUserId: patient.userId || actorUserId,
      category: 'OPERATIONS',
      eventType: 'PRESCRIPTION_READY_FOR_DISPENSING',
      authenticatedBody: `Prescription ${rx.prescriptionNumber} (${rx.items.length} item(s)) has been signed for ${patient.fullName} and is ready for pharmacy dispensing.`,
      deepLinkRoute: '/pharmacy',
    });

    return rx;
  }

  static getAppointment(appointmentId: string, actorUserId: string, isPatient: boolean) {
    const apt = clinicalStore.appointments.get(appointmentId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }
    if (isPatient) {
      const patient = Array.from(clinicalStore.patients.values()).find((p) => p.userId === actorUserId || p.id === actorUserId);
      const patientId = patient ? patient.id : actorUserId;
      if (apt.bookedByUserId !== actorUserId && apt.patientId !== patientId && apt.patientId !== actorUserId) {
        throw ApiError.forbidden('Access denied to this appointment');
      }
    }
    return apt;
  }

  static cancelAppointment(appointmentId: string, actorUserId: string, reason?: string) {
    const apt = clinicalStore.appointments.get(appointmentId);
    if (!apt) {
      throw ApiError.notFound('Appointment not found');
    }

    const patient = Array.from(clinicalStore.patients.values()).find((p) => p.userId === actorUserId || p.id === actorUserId);
    const patientId = patient ? patient.id : actorUserId;

    if (apt.bookedByUserId !== actorUserId && apt.patientId !== patientId && apt.patientId !== actorUserId) {
      const user = db.users.get(actorUserId);
      const isStaff = user && Array.from(db.userRoles.values()).some((ur) => ur.userId === actorUserId && ur.hospitalId === apt.hospitalId);
      if (!isStaff) {
        throw ApiError.forbidden('You are not authorized to cancel this appointment');
      }
    }

    if (apt.status === 'CANCELLED') {
      throw ApiError.badRequest('Appointment is already cancelled');
    }
    if (apt.status === 'COMPLETED') {
      throw ApiError.badRequest('Cannot cancel a completed clinical appointment');
    }

    const prevStatus = apt.status;
    apt.status = 'CANCELLED';
    apt.cancellationReason = reason || 'Cancelled';
    apt.statusHistory.push({
      fromStatus: prevStatus,
      toStatus: 'CANCELLED',
      changedByUserId: actorUserId,
      changedByRole: 'PATIENT',
      notes: reason || 'Cancelled by patient',
      changedAt: new Date().toISOString(),
    });

    db.logAudit({
      userId: actorUserId,
      hospitalId: apt.hospitalId,
      action: 'APPOINTMENT_CANCELLED',
      entityType: 'Appointment',
      entityId: appointmentId,
      ipAddress: null,
      userAgent: null,
      metadata: { reason: reason || 'Cancelled', previousStatus: prevStatus },
    });

    return apt;
  }

  static getEncounter(encounterId: string, patientId: string, actorUserId: string, _hospitalId: string, isPatient: boolean) {
    const enc = clinicalStore.encounters.get(encounterId);
    if (!enc || enc.patientId !== patientId) {
      throw ApiError.notFound('Medical record encounter not found');
    }
    if (isPatient) {
      const patient = Array.from(clinicalStore.patients.values()).find((p) => p.userId === actorUserId || p.id === actorUserId);
      const matchedPatientId = patient ? patient.id : actorUserId;
      if (patientId !== matchedPatientId && patientId !== actorUserId) {
        throw ApiError.forbidden('Access denied to this clinical record');
      }
    }
    return enc;
  }

  static listPrescriptions(userId: string, hospitalId: string, isPatient: boolean) {
    if (isPatient) {
      const patient = Array.from(clinicalStore.patients.values()).find((p) => p.userId === userId || p.id === userId);
      const patientId = patient ? patient.id : userId;
      return Array.from(clinicalStore.prescriptions.values()).filter(
        (p) => p.patientId === patientId || p.patientId === userId
      );
    }
    return Array.from(clinicalStore.prescriptions.values()).filter((p) => p.hospitalId === hospitalId);
  }

  static getPrescription(prescriptionId: string, actorUserId: string, isPatient: boolean) {
    const prescription = clinicalStore.prescriptions.get(prescriptionId);
    if (!prescription) {
      throw ApiError.notFound('Prescription not found');
    }
    if (isPatient) {
      const patient = Array.from(clinicalStore.patients.values()).find((p) => p.userId === actorUserId || p.id === actorUserId);
      const patientId = patient ? patient.id : actorUserId;
      if (prescription.patientId !== patientId && prescription.patientId !== actorUserId) {
        throw ApiError.forbidden('Access denied to this prescription');
      }
    }
    return prescription;
  }

  static getPatientProfile(userId: string) {
    let patient = Array.from(clinicalStore.patients.values()).find((p) => p.userId === userId || p.id === userId);
    const user = db.users.get(userId);
    if (!user && !patient) {
      throw ApiError.notFound('Patient profile not found');
    }

    if (!patient && user) {
      patient = {
        id: crypto.randomUUID(),
        userId: user.id,
        globalPatientId: `MC-PAT-${user.id.slice(0, 8).toUpperCase()}`,
        fullName: user.fullName,
        email: user.email || '',
        phone: user.phone || '',
        dateOfBirth: '',
        gender: '',
        bloodGroup: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        address: '',
        city: '',
        state: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hospitalLinks: user.activeHospitalId
          ? [
              {
                hospitalId: user.activeHospitalId,
                hospitalRegistrationNumber: `REG-${Date.now().toString().slice(-5)}`,
                status: 'ACTIVE',
                registeredAt: new Date().toISOString(),
                consentToShareWithHospitalIds: [],
              },
            ]
          : [],
      };
      clinicalStore.patients.set(patient.id, patient);
    }

    return {
      user: user ? AuthService.buildMeProfile(user.id) : null,
      patient,
    };
  }

  static updatePatientProfile(userId: string, payload: Partial<PatientRecord> & { fullName?: string; phone?: string }) {
    const profile = this.getPatientProfile(userId);
    const patient = profile.patient!;
    const user = db.users.get(userId);

    if (user) {
      if (payload.fullName) user.fullName = payload.fullName;
      if (payload.phone) user.phone = payload.phone;
      user.updatedAt = new Date();
    }

    if (payload.fullName) patient.fullName = payload.fullName;
    if (payload.phone) patient.phone = payload.phone;
    if (payload.dateOfBirth) patient.dateOfBirth = payload.dateOfBirth;
    if (payload.gender) patient.gender = payload.gender;
    if (payload.bloodGroup) patient.bloodGroup = payload.bloodGroup;
    if (payload.emergencyContactName) patient.emergencyContactName = payload.emergencyContactName;
    if (payload.emergencyContactPhone) patient.emergencyContactPhone = payload.emergencyContactPhone;
    if (payload.address) patient.address = payload.address;
    if (payload.city) patient.city = payload.city;
    if (payload.state) patient.state = payload.state;

    db.logAudit({
      userId,
      hospitalId: user?.activeHospitalId || null,
      action: 'PATIENT_PROFILE_UPDATED',
      entityType: 'Patient',
      entityId: patient.id,
      ipAddress: null,
      userAgent: null,
      metadata: { updatedFields: Object.keys(payload) },
    });

    return {
      user: user ? AuthService.buildMeProfile(user.id) : null,
      patient,
    };
  }
}
