package com.example.core.network

data class ApiEnvelope<T>(
    val success: Boolean,
    val data: T? = null,
    val error: ApiErrorDto? = null,
    val meta: PaginationMetaDto? = null,
    val statistics: PlatformStatisticsDto? = null
)

data class ApiErrorDto(
    val code: String,
    val message: String
)

data class PaginationMetaDto(
    val page: Int,
    val limit: Int,
    val total: Int,
    val totalPages: Int
)

// =========================================================================
// PHASE 3: AUTHENTICATION & IDENTITY DTOs
// =========================================================================

data class RegisterRequestDto(
    val fullName: String,
    val email: String,
    val phone: String? = null,
    val password: String,
    val hospitalId: String? = null
)

data class PatientRegisterRequestDto(
    val fullName: String,
    val email: String,
    val phone: String,
    val password: String,
    val confirmPassword: String,
    val dateOfBirth: String? = null,
    val gender: String? = null,
    val termsAccepted: Boolean
)

data class LoginRequestDto(
    val emailOrPhone: String,
    val password: String,
    val deviceInfo: String = "Android MediCore Patient"
)

data class RequestPatientOtpRequestDto(
    val emailOrPhone: String,
    val channel: String
)

data class RequestPatientOtpResponseDto(
    val otpSent: Boolean = true,
    val channel: String = "PHONE",
    val maskedDestination: String = "",
    val expiresInSeconds: Int = 600,
    val cooldownSeconds: Int = 30,
    val deliveryConfigured: Boolean = false,
    val message: String = ""
)

data class VerifyPatientOtpRequestDto(
    val emailOrPhone: String,
    val otpCode: String,
    val channel: String,
    val deviceInfo: String = "Android MediCore Patient"
)

data class RefreshRequestDto(
    val refreshToken: String
)

data class LogoutRequestDto(
    val refreshToken: String? = null
)

data class ForgotPasswordRequestDto(
    val emailOrPhone: String
)

data class ResetPasswordRequestDto(
    val emailOrPhone: String,
    val otpCode: String,
    val newPassword: String
)

data class VerifyEmailRequestDto(
    val email: String,
    val code: String
)

data class ResendVerificationRequestDto(
    val email: String
)

data class AuthResponseDto(
    val user: UserProfileDto,
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long,
    val isNewUser: Boolean = false,
    val emailVerificationRequired: Boolean = false,
    val emailVerificationSent: Boolean = false,
    val emailDeliveryConfigured: Boolean = false
)

data class ForgotPasswordResponseDto(
    val requested: Boolean = true,
    val emailDeliveryConfigured: Boolean = false,
    val emailSent: Boolean = false,
    val message: String
)

data class VerifyEmailResponseDto(
    val verified: Boolean,
    val user: UserProfileDto
)

data class ResendVerificationResponseDto(
    val sent: Boolean = false,
    val alreadyVerified: Boolean = false,
    val emailDeliveryConfigured: Boolean = false,
    val message: String
)

data class LogoutAllResponseDto(
    val loggedOutAll: Boolean = true,
    val revokedSessions: Int = 0
)

data class UserProfileDto(
    val id: String,
    val fullName: String,
    val email: String,
    val phone: String? = null,
    val isEmailVerified: Boolean,
    val isActive: Boolean,
    val activeHospitalId: String? = null,
    val globalRoles: List<String> = emptyList(),
    val activeRoles: List<String> = emptyList(),
    val permissions: List<String> = emptyList(),
    val memberships: List<MembershipDto> = emptyList()
)

data class MembershipDto(
    val id: String? = null,
    val membershipId: String? = null,
    val userId: String? = null,
    val userFullName: String? = null,
    val userEmail: String? = null,
    val userPhone: String? = null,
    val hospitalId: String,
    val hospitalName: String,
    val hospitalCity: String = "",
    val hospitalCategory: String = "",
    val hospitalStatus: String = "APPROVED",
    val department: String? = "General",
    val employeeCode: String? = null,
    val status: String = "ACTIVE",
    val roles: List<String> = emptyList(),
    val joinedAt: String = ""
)

// =========================================================================
// PHASE 4: PATIENT ONBOARDING & PROFILE MANAGEMENT DTOs
// =========================================================================

data class PatientProfileUserDto(
    val id: String,
    val fullName: String,
    val email: String,
    val phone: String? = null,
    val isEmailVerified: Boolean
)

data class PatientCoreDto(
    val id: String,
    val globalPatientId: String,
    val dateOfBirth: String? = null,
    val gender: String? = null,
    val onboardingCompleted: Boolean = false,
    val healthConsentGranted: Boolean = false,
    val healthConsentAt: String? = null,
    val profileCompletionPercent: Int = 0
)

data class PatientAddressDto(
    val id: String,
    val houseNumber: String? = null,
    val street: String,
    val locality: String? = null,
    val city: String,
    val state: String,
    val postalCode: String,
    val country: String
)

data class EmergencyContactDto(
    val id: String,
    val name: String,
    val phone: String,
    val relationship: String,
    val isPrimary: Boolean = false
)

data class HealthInformationDto(
    val bloodGroup: String? = null,
    val knownAllergies: List<String> = emptyList(),
    val existingConditions: List<String> = emptyList(),
    val currentMedications: List<String> = emptyList(),
    val medicalNotes: String? = null,
    val consentGranted: Boolean = false,
    val consentTimestamp: String? = null
)

data class ProfilePhotoDto(
    val id: String,
    val fileName: String,
    val mimeType: String,
    val sizeBytes: Int,
    val url: String,
    val uploadedAt: String
)

data class ProfileCompletionSectionsDto(
    val personalInfo: Boolean = false,
    val contactInfo: Boolean = false,
    val address: Boolean = false,
    val emergencyContact: Boolean = false,
    val healthInformationOptional: Boolean = false,
    val profilePhotoOptional: Boolean = false
)

data class ProfileCompletionDto(
    val percent: Int = 0,
    val isComplete: Boolean = false,
    val sections: ProfileCompletionSectionsDto = ProfileCompletionSectionsDto(),
    val missingRequiredSections: List<String> = emptyList()
)

data class PatientHospitalAssociationDto(
    val membershipId: String,
    val hospitalId: String,
    val hospitalName: String,
    val city: String? = null,
    val status: String,
    val joinedAt: String
)

data class PatientFullProfileDto(
    val user: PatientProfileUserDto,
    val patient: PatientCoreDto,
    val address: PatientAddressDto? = null,
    val emergencyContacts: List<EmergencyContactDto> = emptyList(),
    val healthInformation: HealthInformationDto? = null,
    val profilePhoto: ProfilePhotoDto? = null,
    val profileCompletion: ProfileCompletionDto = ProfileCompletionDto(),
    val hospitalAssociations: List<PatientHospitalAssociationDto> = emptyList(),
    val me: UserProfileDto? = null
)

data class EmergencyContactMutationResponseDto(
    val contact: EmergencyContactDto? = null,
    val deleted: Boolean? = null,
    val profile: PatientFullProfileDto
)

data class UpdatePersonalInfoRequestDto(
    val fullName: String,
    val dateOfBirth: String? = null,
    val gender: String? = null,
    val phone: String? = null
)

data class UpdateAddressRequestDto(
    val houseNumber: String? = null,
    val street: String,
    val locality: String? = null,
    val city: String,
    val state: String,
    val postalCode: String,
    val country: String = "India"
)

data class UpsertEmergencyContactRequestDto(
    val name: String,
    val phone: String,
    val relationship: String,
    val isPrimary: Boolean = true
)

data class UpdateHealthInfoRequestDto(
    val consentGranted: Boolean,
    val bloodGroup: String? = null,
    val knownAllergies: List<String> = emptyList(),
    val existingConditions: List<String> = emptyList(),
    val currentMedications: List<String> = emptyList(),
    val medicalNotes: String? = null
)

// =========================================================================
// PHASE 5: PATIENT HOME DASHBOARD DTOs
// =========================================================================

data class DashboardPatientDto(
    val id: String,
    val userId: String,
    val globalPatientId: String,
    val fullName: String,
    val firstName: String,
    val email: String,
    val phone: String? = null,
    val isEmailVerified: Boolean,
    val hasProfilePhoto: Boolean = false,
    val profilePhotoUrl: String? = null,
    val onboardingCompleted: Boolean = false,
    val profileCompletionPercent: Int = 0,
    val missingRequiredSections: List<String> = emptyList()
)

data class DashboardHealthOverviewDto(
    val healthConsentGranted: Boolean = false,
    val bloodGroup: String? = null,
    val knownAllergies: List<String> = emptyList(),
    val existingConditions: List<String> = emptyList(),
    val currentMedications: List<String> = emptyList(),
    val hasAnyHealthInfo: Boolean = false
)

data class DashboardAppointmentDto(
    val id: String,
    val appointmentNumber: String,
    val hospitalId: String,
    val hospitalName: String,
    val hospitalCity: String = "",
    val doctorId: String,
    val doctorName: String,
    val doctorSpecialization: String = "",
    val appointmentDate: String,
    val slotStartTime: String,
    val slotEndTime: String,
    val timezone: String = "Asia/Kolkata",
    val type: String,
    val status: String,
    val reasonForVisit: String = ""
)

data class DashboardPrescriptionDto(
    val id: String,
    val prescriptionNumber: String,
    val hospitalId: String,
    val hospitalName: String,
    val doctorId: String,
    val doctorName: String,
    val status: String,
    val signedAt: String? = null,
    val medicineCount: Int = 0,
    val medicinesSummary: List<String> = emptyList()
)

data class DashboardLabReportDto(
    val id: String,
    val orderNumber: String,
    val hospitalId: String,
    val hospitalName: String,
    val testCode: String,
    val testName: String,
    val category: String,
    val status: String,
    val observedValue: String? = null,
    val unit: String = "",
    val referenceInterval: String = "",
    val verifiedAt: String? = null,
    val createdAt: String
)

data class DashboardActivityDto(
    val id: String,
    val action: String,
    val title: String,
    val entityType: String,
    val entityId: String? = null,
    val timestamp: String
)

data class DashboardQuickStatsDto(
    val upcomingAppointmentCount: Int = 0,
    val totalAppointmentCount: Int = 0,
    val prescriptionCount: Int = 0,
    val labReportCount: Int = 0,
    val linkedHospitalCount: Int = 0
)

data class PatientDashboardResponseDto(
    val patient: DashboardPatientDto,
    val healthOverview: DashboardHealthOverviewDto = DashboardHealthOverviewDto(),
    val nextAppointment: DashboardAppointmentDto? = null,
    val upcomingAppointments: List<DashboardAppointmentDto> = emptyList(),
    val recentPrescriptions: List<DashboardPrescriptionDto> = emptyList(),
    val recentLabReports: List<DashboardLabReportDto> = emptyList(),
    val recentActivities: List<DashboardActivityDto> = emptyList(),
    val quickStats: DashboardQuickStatsDto = DashboardQuickStatsDto(),
    val unreadNotificationCount: Int = 0,
    val serverTimestamp: String = ""
)

// =========================================================================
// PHASE 6: HOSPITAL & DOCTOR DISCOVERY DTOs
// =========================================================================

data class PatientHospitalDto(
    val id: String,
    val directoryCode: String? = null,
    val name: String,
    val hospitalType: String = "",
    val ownershipType: String? = null,
    val logoUrl: String? = null,
    val address: String,
    val city: String,
    val state: String,
    val pincode: String? = null,
    val contactPhone: String? = null,
    val contactEmail: String? = null,
    val website: String? = null,
    val specialties: List<String> = emptyList(),
    val departments: List<String> = emptyList(),
    val verificationStatus: String? = null,
    val isVerified: Boolean = false,
    val emergencyAvailable: Boolean? = null,
    val about: String? = null,
    val operatingHours: String? = null,
    val doctorCount: Int = 0,
    val cancellationPolicyHours: Int? = null
)

data class DoctorScheduleSummaryDto(
    val dayOfWeek: Int,
    val dayName: String,
    val startTime: String,
    val endTime: String,
    val timezone: String = "Asia/Kolkata"
)

data class PatientDoctorDto(
    val id: String,
    val fullName: String,
    val specialization: String,
    val qualification: String,
    val experienceYears: Int,
    val bio: String? = null,
    val profilePhotoUrl: String? = null,
    val hospitalId: String,
    val hospitalName: String,
    val hospitalCity: String = "",
    val departmentId: String,
    val departmentName: String,
    val consultationFee: Int? = null,
    val slotDurationMinutes: Int = 30,
    val verificationStatus: String = "",
    val isAvailable: Boolean = false,
    val scheduleSummary: List<DoctorScheduleSummaryDto> = emptyList()
)

data class HospitalDetailResponseDto(
    val hospital: PatientHospitalDto,
    val availableDoctors: List<PatientDoctorDto> = emptyList()
)

data class SpecialtyFilterOptionsDto(
    val specialties: List<String> = emptyList(),
    val hospitalTypes: List<String> = emptyList(),
    val cities: List<String> = emptyList()
)

// =========================================================================
// PHASE 7: APPOINTMENT BOOKING & SCHEDULING DTOs
// =========================================================================

data class TimeSlotDto(
    val startTime: String,
    val endTime: String,
    val isAvailable: Boolean,
    val isBooked: Boolean = false,
    val isBlocked: Boolean = false,
    val isPast: Boolean = false,
    val unavailableReason: String? = null
)

data class AvailableDateDto(
    val date: String,
    val dayOfWeek: Int,
    val dayName: String,
    val availableSlotCount: Int
)

data class DoctorAvailabilityResponseDto(
    val doctorId: String,
    val hospitalId: String,
    val date: String,
    val timezone: String = "Asia/Kolkata",
    val hasScheduleConfigured: Boolean = false,
    val slots: List<TimeSlotDto> = emptyList(),
    val availableDates: List<AvailableDateDto> = emptyList()
)

data class AppointmentStatusHistoryDto(
    val fromStatus: String? = null,
    val toStatus: String,
    val changedByRole: String,
    val notes: String? = null,
    val changedAt: String
)

data class PatientAppointmentDto(
    val id: String,
    val appointmentNumber: String,
    val hospitalId: String,
    val hospitalName: String,
    val hospitalAddress: String = "",
    val hospitalCity: String = "",
    val departmentId: String,
    val departmentName: String,
    val doctorId: String,
    val doctorName: String,
    val doctorSpecialization: String = "",
    val doctorQualification: String = "",
    val consultationFee: Int? = null,
    val appointmentDate: String,
    val slotStartTime: String,
    val slotEndTime: String,
    val timezone: String = "Asia/Kolkata",
    val type: String = "OPD",
    val status: String,
    val reasonForVisit: String,
    val cancellationReason: String? = null,
    val canCancel: Boolean = false,
    val cancellationPolicyHours: Int? = null,
    val statusHistory: List<AppointmentStatusHistoryDto> = emptyList(),
    val createdAt: String = ""
)

data class NotificationDispatchDto(
    val inAppNotificationQueued: Boolean = false,
    val pushConfigured: Boolean = false,
    val smsConfigured: Boolean = false,
    val emailConfigured: Boolean = false
)

data class BookAppointmentRequestDto(
    val hospitalId: String,
    val doctorId: String,
    val appointmentDate: String,
    val slotStartTime: String,
    val type: String = "OPD",
    val reasonForVisit: String
)

data class BookAppointmentResponseDto(
    val appointment: PatientAppointmentDto,
    val notificationDispatch: NotificationDispatchDto = NotificationDispatchDto()
)

data class CancelAppointmentRequestDto(
    val reason: String? = null
)

// Legacy Hospital / Admin DTOs kept only for compilation compatibility
data class HospitalDto(
    val id: String,
    val name: String,
    val registrationNumber: String,
    val category: String,
    val logoUrl: String? = null,
    val address: String,
    val city: String,
    val state: String,
    val contactEmail: String,
    val contactPhone: String,
    val totalBeds: Int,
    val availableBeds: Int,
    val status: String,
    val departments: List<String> = emptyList(),
    val createdByUserId: String? = null,
    val approvedByUserId: String? = null,
    val rejectionReason: String? = null
)

data class SelectHospitalResponseDto(
    val selectedHospital: HospitalDto,
    val accessToken: String,
    val user: UserProfileDto
)

data class PlatformStatisticsDto(
    val totalHospitals: Int = 0,
    val approvedHospitals: Int = 0,
    val pendingHospitals: Int = 0,
    val rejectedHospitals: Int = 0,
    val suspendedHospitals: Int = 0,
    val totalUsers: Int = 0,
    val totalMemberships: Int = 0
)

// =========================================================================
// PHASE 10: MEDICINE REMINDERS & MEDICATION TRACKING DTOs
// =========================================================================

data class NextScheduledDoseDto(
    val reminderId: String,
    val medicationId: String,
    val medicineName: String,
    val scheduledDate: String,
    val scheduledTime: String,
    val timezone: String = "Asia/Kolkata",
    val status: String = "NOT_RECORDED",
    val isSnoozed: Boolean = false,
    val snoozedUntil: String? = null
)

data class MedicationSummaryDto(
    val id: String,
    val prescriptionId: String,
    val prescriptionNumber: String,
    val prescriptionStatus: String,
    val prescriptionDate: String? = null,
    val hospitalId: String,
    val hospitalName: String,
    val doctorId: String,
    val doctorName: String? = null,
    val doctorSpecialization: String? = null,
    val medicineName: String,
    val strength: String,
    val dosage: String,
    val route: String? = null,
    val frequency: String,
    val durationDays: Int? = null,
    val quantity: Int? = null,
    val instructions: String,
    val specialInstructions: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val discontinuedAt: String? = null,
    val discontinuationReason: String? = null,
    val status: String = "ACTIVE",
    val isPrescriptionReadOnly: Boolean = true,
    val reminderCount: Int = 0,
    val activeReminderCount: Int = 0,
    val nextScheduledDose: NextScheduledDoseDto? = null
)

data class ScheduledDoseSlotDto(
    val occurrenceKey: String,
    val reminderId: String,
    val medicationId: String,
    val prescriptionId: String,
    val medicineName: String,
    val strength: String,
    val dosage: String,
    val route: String? = null,
    val scheduledDate: String,
    val scheduledTime: String,
    val timezone: String = "Asia/Kolkata",
    val status: String = "NOT_RECORDED",
    val isMissed: Boolean = false,
    val isUpcoming: Boolean = false,
    val doseLogId: String? = null,
    val actionAt: String? = null,
    val snoozedUntil: String? = null,
    val notes: String? = null,
    val personalNotes: String? = null
)

data class MedicationReminderDto(
    val id: String,
    val medicationId: String,
    val prescriptionId: String,
    val medicineName: String,
    val strength: String,
    val dosage: String,
    val label: String? = null,
    val scheduleType: String = "DAILY",
    val daysOfWeek: List<Int> = listOf(0, 1, 2, 3, 4, 5, 6),
    val reminderTimes: List<String> = emptyList(),
    val timezone: String = "Asia/Kolkata",
    val startDate: String,
    val endDate: String? = null,
    val isEnabled: Boolean = true,
    val personalNotes: String? = null,
    val isReminderOnlyNotice: String = "",
    val nextScheduledDose: NextScheduledDoseDto? = null,
    val createdAt: String = "",
    val updatedAt: String = ""
)

data class MedicationDoseLogDto(
    val id: String,
    val medicationId: String,
    val prescriptionId: String,
    val medicineName: String,
    val strength: String,
    val dosage: String,
    val reminderId: String? = null,
    val scheduledDate: String,
    val scheduledTime: String,
    val scheduledFor: String,
    val status: String,
    val actionAt: String? = null,
    val snoozedUntil: String? = null,
    val notes: String? = null,
    val previousStatus: String? = null,
    val correctionReason: String? = null,
    val correctedAt: String? = null,
    val createdAt: String = "",
    val updatedAt: String = ""
)

data class AdherenceSummaryDto(
    val takenCount: Int = 0,
    val skippedCount: Int = 0,
    val snoozedCount: Int = 0,
    val recordedCount: Int = 0,
    val scheduledTodayCount: Int = 0,
    val upcomingTodayCount: Int = 0,
    val missedTodayCount: Int = 0,
    val adherencePercent: Int? = null
)

data class MedicationCountsDto(
    val total: Int = 0,
    val active: Int = 0,
    val completed: Int = 0,
    val discontinued: Int = 0
)

data class MedicationDashboardResponseDto(
    val medications: List<MedicationSummaryDto> = emptyList(),
    val active: List<MedicationSummaryDto> = emptyList(),
    val completed: List<MedicationSummaryDto> = emptyList(),
    val discontinued: List<MedicationSummaryDto> = emptyList(),
    val todaySchedule: List<ScheduledDoseSlotDto> = emptyList(),
    val missedReminders: List<ScheduledDoseSlotDto> = emptyList(),
    val adherenceSummary: AdherenceSummaryDto = AdherenceSummaryDto(),
    val counts: MedicationCountsDto = MedicationCountsDto()
)

data class MedicationDetailResponseDto(
    val medication: MedicationSummaryDto,
    val reminders: List<MedicationReminderDto> = emptyList(),
    val doseHistory: List<MedicationDoseLogDto> = emptyList(),
    val todaySchedule: List<ScheduledDoseSlotDto> = emptyList(),
    val adherenceSummary: AdherenceSummaryDto = AdherenceSummaryDto()
)

data class ReminderListResponseDto(
    val items: List<MedicationReminderDto> = emptyList(),
    val upcoming: List<ScheduledDoseSlotDto> = emptyList(),
    val missed: List<ScheduledDoseSlotDto> = emptyList(),
    val todaySchedule: List<ScheduledDoseSlotDto> = emptyList()
)

data class DoseListResponseDto(
    val items: List<MedicationDoseLogDto> = emptyList(),
    val todaySchedule: List<ScheduledDoseSlotDto> = emptyList(),
    val adherenceSummary: AdherenceSummaryDto = AdherenceSummaryDto()
)

data class DeleteReminderResponseDto(
    val id: String,
    val deleted: Boolean,
    val deletedAt: String = ""
)

data class CreateMedicationReminderRequestDto(
    val medicationId: String,
    val label: String? = null,
    val scheduleType: String = "DAILY",
    val daysOfWeek: List<Int>? = null,
    val reminderTimes: List<String>,
    val timezone: String,
    val startDate: String,
    val endDate: String? = null,
    val isEnabled: Boolean = true,
    val personalNotes: String? = null
)

data class UpdateMedicationReminderRequestDto(
    val label: String? = null,
    val scheduleType: String? = null,
    val daysOfWeek: List<Int>? = null,
    val reminderTimes: List<String>? = null,
    val timezone: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val isEnabled: Boolean? = null,
    val personalNotes: String? = null
)

data class RecordDoseRequestDto(
    val medicationId: String,
    val reminderId: String? = null,
    val scheduledDate: String,
    val scheduledTime: String,
    val status: String,
    val snoozeMinutes: Int? = null,
    val notes: String? = null,
    val timezone: String? = null
)

data class UpdateDoseRequestDto(
    val status: String,
    val snoozeMinutes: Int? = null,
    val notes: String? = null,
    val correctionReason: String? = null
)

// =========================================================================
// PHASE 13: PATIENT BILLING, PAYMENTS & RECEIPTS DTOs
// =========================================================================

data class BillingDashboardSummaryDto(
    val currency: String = "INR",
    val totalOutstandingPaise: Long = 0L,
    val totalPaidPaise: Long = 0L,
    val pendingInvoiceCount: Int = 0,
    val partialInvoiceCount: Int = 0,
    val paidInvoiceCount: Int = 0,
    val overdueInvoiceCount: Int = 0
)

data class PatientInvoiceSummaryDto(
    val id: String,
    val invoiceNumber: String,
    val hospitalId: String,
    val hospitalName: String = "",
    val status: String,
    val displayStatus: String = "PENDING",
    val isOverdue: Boolean = false,
    val invoiceDate: String = "",
    val dueDate: String? = null,
    val subtotalPaise: Long = 0L,
    val discountPaise: Long = 0L,
    val taxPaise: Long = 0L,
    val creditNotePaise: Long = 0L,
    val paidPaise: Long = 0L,
    val insuranceSettledPaise: Long = 0L,
    val totalPaise: Long = 0L,
    val balanceDuePaise: Long = 0L,
    val itemCount: Int = 0,
    val createdAt: String = ""
)

data class BillingDashboardEnvelope(
    val success: Boolean,
    val data: List<PatientInvoiceSummaryDto> = emptyList(),
    val summary: BillingDashboardSummaryDto? = null,
    val recentTransactions: List<PatientPaymentDto> = emptyList(),
    val meta: PaginationMetaDto? = null,
    val error: ApiErrorDto? = null
)

data class InvoiceLineItemDto(
    val serviceCategory: String,
    val description: String,
    val quantity: Int,
    val unitPricePaise: Long,
    val taxRatePercent: Int = 0,
    val taxAmountPaise: Long = 0L,
    val lineTotalPaise: Long = 0L
)

data class InvoiceCreditNoteDto(
    val id: String,
    val creditNoteNumber: String,
    val amountPaise: Long,
    val reason: String,
    val issuedAt: String
)

data class PatientInvoiceDetailDto(
    val id: String,
    val invoiceNumber: String,
    val hospitalId: String,
    val hospitalName: String = "",
    val status: String,
    val displayStatus: String = "PENDING",
    val isOverdue: Boolean = false,
    val invoiceDate: String = "",
    val dueDate: String? = null,
    val subtotalPaise: Long = 0L,
    val discountPaise: Long = 0L,
    val taxPaise: Long = 0L,
    val creditNotePaise: Long = 0L,
    val paidPaise: Long = 0L,
    val insuranceSettledPaise: Long = 0L,
    val totalPaise: Long = 0L,
    val balanceDuePaise: Long = 0L,
    val notes: String? = null,
    val items: List<InvoiceLineItemDto> = emptyList(),
    val creditNotes: List<InvoiceCreditNoteDto> = emptyList(),
    val payments: List<PatientPaymentDto> = emptyList()
)

data class PatientPaymentDto(
    val id: String,
    val receiptNumber: String? = null,
    val hospitalId: String,
    val hospitalName: String? = null,
    val invoiceId: String,
    val invoiceNumber: String? = null,
    val patientId: String,
    val amountPaise: Long,
    val currency: String = "INR",
    val method: String,
    val methodDetail: String? = null,
    val status: String,
    val gatewayProvider: String? = null,
    val gatewayOrderId: String? = null,
    val gatewayPaymentId: String? = null,
    val failureReason: String? = null,
    val cancelledAt: String? = null,
    val verifiedAt: String? = null,
    val paidAt: String? = null,
    val createdAt: String? = null,
    val receiptAvailable: Boolean = false
)

data class GatewayOrderPayloadDto(
    val provider: String = "RAZORPAY",
    val mode: String = "sandbox",
    val gatewayOrderId: String,
    val amountPaise: Long,
    val currency: String = "INR",
    val keyId: String? = null,
    val checkoutRequired: Boolean = true
)

data class CreatePaymentOrderRequestDto(
    val amountPaise: Long? = null,
    val method: String = "UPI",
    val methodDetail: String? = null,
    val idempotencyKey: String
)

data class CreatePaymentOrderResponseDto(
    val idempotentReplay: Boolean = false,
    val payment: PatientPaymentDto,
    val gatewayOrder: GatewayOrderPayloadDto
)

data class VerifyPaymentRequestDto(
    val gatewayOrderId: String,
    val gatewayPaymentId: String,
    val gatewaySignature: String
)

data class CancelOrFailPaymentRequestDto(
    val outcome: String = "CANCELLED",
    val reason: String? = null
)

data class PaymentReceiptDto(
    val id: String,
    val receiptNumber: String,
    val paymentId: String,
    val invoiceId: String,
    val hospitalId: String,
    val patientId: String,
    val amountPaise: Long,
    val currency: String = "INR",
    val issuedAt: String
)

data class VerifyPaymentResponseDto(
    val payment: PatientPaymentDto,
    val invoice: PatientInvoiceSummaryDto? = null,
    val receipt: PaymentReceiptDto? = null,
    val alreadyVerified: Boolean = false
)

data class PaymentStatusResponseDto(
    val id: String,
    val receiptNumber: String? = null,
    val hospitalId: String,
    val hospitalName: String? = null,
    val invoiceId: String,
    val invoiceNumber: String? = null,
    val invoiceStatus: String? = null,
    val invoiceBalanceDuePaise: Long? = null,
    val amountPaise: Long,
    val currency: String = "INR",
    val method: String,
    val status: String,
    val gatewayOrderId: String? = null,
    val gatewayPaymentId: String? = null,
    val failureReason: String? = null,
    val receiptAvailable: Boolean = false,
    val receipt: PaymentReceiptDto? = null
)

data class PaymentReceiptDetailDto(
    val receipt: PaymentReceiptDto,
    val payment: PatientPaymentDto,
    val hospitalName: String = "",
    val invoiceNumber: String = "",
    val invoiceItems: List<InvoiceLineItemDto> = emptyList()
)

