package com.example.core.network

import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

interface MediCoreApiService {

    // =========================================================================
    // PHASE 3: PATIENT AUTHENTICATION (/api/v1/auth/*)
    // =========================================================================

    @POST("api/v1/auth/patient/otp/request")
    suspend fun requestPatientOtp(@Body request: RequestPatientOtpRequestDto): Response<ApiEnvelope<RequestPatientOtpResponseDto>>

    @POST("api/v1/auth/patient/otp/verify")
    suspend fun verifyPatientOtp(@Body request: VerifyPatientOtpRequestDto): Response<ApiEnvelope<AuthResponseDto>>

    @POST("api/v1/auth/patient/register")
    suspend fun registerPatient(@Body request: PatientRegisterRequestDto): Response<ApiEnvelope<AuthResponseDto>>

    @POST("api/v1/auth/patient/login")
    suspend fun loginPatient(@Body request: LoginRequestDto): Response<ApiEnvelope<AuthResponseDto>>

    @POST("api/v1/auth/register")
    suspend fun register(@Body request: RegisterRequestDto): Response<ApiEnvelope<AuthResponseDto>>

    @POST("api/v1/auth/verify-email")
    suspend fun verifyEmail(@Body request: VerifyEmailRequestDto): Response<ApiEnvelope<VerifyEmailResponseDto>>

    @POST("api/v1/auth/resend-verification")
    suspend fun resendVerification(@Body request: ResendVerificationRequestDto): Response<ApiEnvelope<ResendVerificationResponseDto>>

    @POST("api/v1/auth/forgot-password")
    suspend fun forgotPassword(@Body request: ForgotPasswordRequestDto): Response<ApiEnvelope<ForgotPasswordResponseDto>>

    @POST("api/v1/auth/reset-password")
    suspend fun resetPassword(@Body request: ResetPasswordRequestDto): Response<ApiEnvelope<Map<String, Boolean>>>

    @POST("api/v1/auth/refresh")
    suspend fun refresh(@Body request: RefreshRequestDto): Response<ApiEnvelope<AuthResponseDto>>

    @POST("api/v1/auth/logout")
    suspend fun logout(@Body request: LogoutRequestDto): Response<ApiEnvelope<Map<String, Boolean>>>

    @POST("api/v1/auth/logout-all")
    suspend fun logoutAll(): Response<ApiEnvelope<LogoutAllResponseDto>>

    @GET("api/v1/auth/me")
    suspend fun getMe(): Response<ApiEnvelope<UserProfileDto>>

    // =========================================================================
    // PHASE 4: PATIENT ONBOARDING & PROFILE MANAGEMENT (/api/v1/patient/*)
    // =========================================================================

    @GET("api/v1/patient/profile")
    suspend fun getPatientFullProfile(): Response<ApiEnvelope<PatientFullProfileDto>>

    @PUT("api/v1/patient/profile/personal")
    suspend fun updatePersonalInfo(@Body request: UpdatePersonalInfoRequestDto): Response<ApiEnvelope<PatientFullProfileDto>>

    @PUT("api/v1/patient/profile/address")
    suspend fun updateAddress(@Body request: UpdateAddressRequestDto): Response<ApiEnvelope<PatientFullProfileDto>>

    @GET("api/v1/patient/profile/emergency-contacts")
    suspend fun listEmergencyContacts(): Response<ApiEnvelope<List<EmergencyContactDto>>>

    @POST("api/v1/patient/profile/emergency-contacts")
    suspend fun addEmergencyContact(@Body request: UpsertEmergencyContactRequestDto): Response<ApiEnvelope<EmergencyContactMutationResponseDto>>

    @PUT("api/v1/patient/profile/emergency-contacts/{contactId}")
    suspend fun updateEmergencyContact(
        @Path("contactId") contactId: String,
        @Body request: UpsertEmergencyContactRequestDto
    ): Response<ApiEnvelope<EmergencyContactMutationResponseDto>>

    @DELETE("api/v1/patient/profile/emergency-contacts/{contactId}")
    suspend fun deleteEmergencyContact(
        @Path("contactId") contactId: String
    ): Response<ApiEnvelope<EmergencyContactMutationResponseDto>>

    @PUT("api/v1/patient/profile/health-information")
    suspend fun updateHealthInformation(@Body request: UpdateHealthInfoRequestDto): Response<ApiEnvelope<PatientFullProfileDto>>

    @Multipart
    @POST("api/v1/patient/profile/photo")
    suspend fun uploadProfilePhoto(@Part photo: MultipartBody.Part): Response<ApiEnvelope<PatientFullProfileDto>>

    @DELETE("api/v1/patient/profile/photo")
    suspend fun deleteProfilePhoto(): Response<ApiEnvelope<PatientFullProfileDto>>

    @POST("api/v1/patient/onboarding/complete")
    suspend fun completePatientOnboarding(): Response<ApiEnvelope<PatientFullProfileDto>>

    // =========================================================================
    // PHASE 5: PATIENT HOME DASHBOARD (/api/v1/patient/dashboard, etc.)
    // =========================================================================

    @GET("api/v1/patient/dashboard")
    suspend fun getPatientDashboard(): Response<ApiEnvelope<PatientDashboardResponseDto>>

    @GET("api/v1/patient/prescriptions/recent")
    suspend fun getRecentPrescriptions(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 10
    ): Response<ApiEnvelope<List<DashboardPrescriptionDto>>>

    @GET("api/v1/patient/lab-reports/recent")
    suspend fun getRecentLabReports(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 10
    ): Response<ApiEnvelope<List<DashboardLabReportDto>>>

    @GET("api/v1/patient/activities")
    suspend fun getPatientActivities(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 15
    ): Response<ApiEnvelope<List<DashboardActivityDto>>>

    // =========================================================================
    // PHASE 6: HOSPITAL & DOCTOR DISCOVERY (/api/v1/patient/hospitals & doctors)
    // =========================================================================

    @GET("api/v1/patient/hospitals")
    suspend fun discoverHospitals(
        @Query("search") search: String? = null,
        @Query("city") city: String? = null,
        @Query("location") location: String? = null,
        @Query("specialty") specialty: String? = null,
        @Query("hospitalType") hospitalType: String? = null,
        @Query("verifiedOnly") verifiedOnly: Boolean? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<ApiEnvelope<List<PatientHospitalDto>>>

    @GET("api/v1/patient/hospitals/{hospitalId}")
    suspend fun getPatientHospitalDetail(@Path("hospitalId") hospitalId: String): Response<ApiEnvelope<HospitalDetailResponseDto>>

    @GET("api/v1/patient/hospitals/{hospitalId}/doctors")
    suspend fun getPatientHospitalDoctors(
        @Path("hospitalId") hospitalId: String,
        @Query("search") search: String? = null,
        @Query("specialty") specialty: String? = null,
        @Query("availableOnly") availableOnly: Boolean? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<ApiEnvelope<List<PatientDoctorDto>>>

    @GET("api/v1/patient/doctors")
    suspend fun discoverDoctors(
        @Query("search") search: String? = null,
        @Query("specialty") specialty: String? = null,
        @Query("hospitalId") hospitalId: String? = null,
        @Query("availableOnly") availableOnly: Boolean? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<ApiEnvelope<List<PatientDoctorDto>>>

    @GET("api/v1/patient/doctors/{doctorId}")
    suspend fun getPatientDoctorDetail(@Path("doctorId") doctorId: String): Response<ApiEnvelope<PatientDoctorDto>>

    @GET("api/v1/patient/specialties")
    suspend fun getDiscoverySpecialties(): Response<ApiEnvelope<SpecialtyFilterOptionsDto>>

    // =========================================================================
    // PHASE 7: APPOINTMENT BOOKING & SCHEDULING (/api/v1/patient/appointments)
    // =========================================================================

    @GET("api/v1/patient/doctors/{doctorId}/availability")
    suspend fun getDoctorAvailability(
        @Path("doctorId") doctorId: String,
        @Query("date") date: String? = null,
        @Query("hospitalId") hospitalId: String? = null,
        @Query("days") days: Int = 14
    ): Response<ApiEnvelope<DoctorAvailabilityResponseDto>>

    @GET("api/v1/patient/appointments")
    suspend fun listPatientAppointments(
        @Query("filter") filter: String = "ALL",
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<ApiEnvelope<List<PatientAppointmentDto>>>

    @GET("api/v1/patient/appointments/upcoming")
    suspend fun listUpcomingAppointments(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 10
    ): Response<ApiEnvelope<List<PatientAppointmentDto>>>

    @GET("api/v1/patient/appointments/{appointmentId}")
    suspend fun getPatientAppointmentDetail(@Path("appointmentId") appointmentId: String): Response<ApiEnvelope<PatientAppointmentDto>>

    @POST("api/v1/patient/appointments")
    suspend fun bookPatientAppointment(@Body request: BookAppointmentRequestDto): Response<ApiEnvelope<BookAppointmentResponseDto>>

    @PATCH("api/v1/patient/appointments/{appointmentId}/cancel")
    suspend fun cancelPatientAppointment(
        @Path("appointmentId") appointmentId: String,
        @Body request: CancelAppointmentRequestDto
    ): Response<ApiEnvelope<BookAppointmentResponseDto>>

    // =========================================================================
    // PHASE 10: MEDICINE REMINDERS & MEDICATION TRACKING (/api/v1/patient/*)
    // =========================================================================

    @GET("api/v1/patient/medications")
    suspend fun getPatientMedications(
        @Query("status") status: String = "ALL",
        @Query("timezone") timezone: String? = null,
        @Query("date") date: String? = null
    ): Response<ApiEnvelope<MedicationDashboardResponseDto>>

    @GET("api/v1/patient/medications/{medicationId}")
    suspend fun getPatientMedicationDetail(
        @Path("medicationId") medicationId: String,
        @Query("timezone") timezone: String? = null
    ): Response<ApiEnvelope<MedicationDetailResponseDto>>

    @GET("api/v1/patient/medication-reminders")
    suspend fun listMedicationReminders(
        @Query("medicationId") medicationId: String? = null,
        @Query("enabledOnly") enabledOnly: Boolean? = null,
        @Query("timezone") timezone: String? = null,
        @Query("date") date: String? = null
    ): Response<ApiEnvelope<ReminderListResponseDto>>

    @POST("api/v1/patient/medication-reminders")
    suspend fun createMedicationReminder(
        @Body request: CreateMedicationReminderRequestDto
    ): Response<ApiEnvelope<MedicationReminderDto>>

    @PATCH("api/v1/patient/medication-reminders/{reminderId}")
    suspend fun updateMedicationReminder(
        @Path("reminderId") reminderId: String,
        @Body request: UpdateMedicationReminderRequestDto
    ): Response<ApiEnvelope<MedicationReminderDto>>

    @DELETE("api/v1/patient/medication-reminders/{reminderId}")
    suspend fun deleteMedicationReminder(
        @Path("reminderId") reminderId: String
    ): Response<ApiEnvelope<DeleteReminderResponseDto>>

    @GET("api/v1/patient/medication-doses")
    suspend fun listMedicationDoses(
        @Query("medicationId") medicationId: String? = null,
        @Query("reminderId") reminderId: String? = null,
        @Query("startDate") startDate: String? = null,
        @Query("endDate") endDate: String? = null,
        @Query("status") status: String = "ALL",
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50
    ): Response<ApiEnvelope<DoseListResponseDto>>

    @POST("api/v1/patient/medication-doses")
    suspend fun recordMedicationDose(
        @Body request: RecordDoseRequestDto
    ): Response<ApiEnvelope<MedicationDoseLogDto>>

    @PATCH("api/v1/patient/medication-doses/{doseId}")
    suspend fun updateMedicationDose(
        @Path("doseId") doseId: String,
        @Body request: UpdateDoseRequestDto
    ): Response<ApiEnvelope<MedicationDoseLogDto>>

    // =========================================================================
    // PHASE 13: PATIENT BILLING, PAYMENTS & VERIFIED RECEIPTS
    // =========================================================================

    @GET("api/v1/patient/invoices")
    suspend fun getPatientInvoicesDashboard(
        @Query("status") status: String = "ALL",
        @Query("sortBy") sortBy: String = "newest",
        @Query("search") search: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<BillingDashboardEnvelope>

    @GET("api/v1/patient/invoices/{invoiceId}")
    suspend fun getPatientInvoiceDetail(
        @Path("invoiceId") invoiceId: String
    ): Response<ApiEnvelope<PatientInvoiceDetailDto>>

    @Streaming
    @GET("api/v1/patient/invoices/{invoiceId}/pdf")
    suspend fun downloadInvoicePdf(
        @Path("invoiceId") invoiceId: String
    ): Response<ResponseBody>

    @POST("api/v1/patient/invoices/{invoiceId}/payment-orders")
    suspend fun createPatientPaymentOrder(
        @Path("invoiceId") invoiceId: String,
        @Body request: CreatePaymentOrderRequestDto
    ): Response<ApiEnvelope<CreatePaymentOrderResponseDto>>

    @GET("api/v1/patient/payments")
    suspend fun listPatientPayments(
        @Query("status") status: String = "ALL",
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20
    ): Response<ApiEnvelope<List<PatientPaymentDto>>>

    @GET("api/v1/patient/payments/{paymentId}/status")
    suspend fun getPatientPaymentStatus(
        @Path("paymentId") paymentId: String
    ): Response<ApiEnvelope<PaymentStatusResponseDto>>

    @POST("api/v1/patient/payments/{paymentId}/verify")
    suspend fun verifyPatientPayment(
        @Path("paymentId") paymentId: String,
        @Body request: VerifyPaymentRequestDto
    ): Response<ApiEnvelope<VerifyPaymentResponseDto>>

    @POST("api/v1/patient/payments/{paymentId}/cancel")
    suspend fun cancelOrFailPatientPayment(
        @Path("paymentId") paymentId: String,
        @Body request: CancelOrFailPaymentRequestDto
    ): Response<ApiEnvelope<PatientPaymentDto>>

    @GET("api/v1/patient/payments/{paymentId}/receipt")
    suspend fun getPatientPaymentReceipt(
        @Path("paymentId") paymentId: String
    ): Response<ApiEnvelope<PaymentReceiptDetailDto>>

    @Streaming
    @GET("api/v1/patient/payments/{paymentId}/receipt/pdf")
    suspend fun downloadReceiptPdf(
        @Path("paymentId") paymentId: String
    ): Response<ResponseBody>

    // Legacy endpoints kept for compilation compatibility with existing non-UI references
    @GET("api/v1/hospitals")
    suspend fun getHospitals(
        @Query("search") search: String? = null,
        @Query("category") category: String? = null,
        @Query("status") status: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50
    ): Response<ApiEnvelope<List<HospitalDto>>>

    @GET("api/v1/hospitals/{id}")
    suspend fun getHospitalById(@Path("id") id: String): Response<ApiEnvelope<HospitalDto>>
}
