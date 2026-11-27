package com.example.core.navigation

sealed class Screen(val route: String) {
    object Splash : Screen("splash")
    object Onboarding : Screen("onboarding")
    object Login : Screen("login")
    object HospitalSelection : Screen("hospital_selection")
    object PatientDetails : Screen("patient_details?editMode={editMode}") {
        fun createRoute(editMode: Boolean = false): String =
            "patient_details?editMode=$editMode"
    }
    object Dashboard : Screen("dashboard")
    object Profile : Screen("profile")
    object Settings : Screen("settings")

    // Patient Navigation Structure Destinations
    object Hospitals : Screen("hospitals")
    object HospitalDetail : Screen("hospital_detail/{hospitalId}") {
        fun createRoute(hospitalId: String): String = "hospital_detail/$hospitalId"
    }
    object Doctors : Screen("doctors")
    object Appointments : Screen("appointments")
    object MedicalRecords : Screen("medical_records")
    object Prescriptions : Screen("prescriptions")
    object Medications : Screen("medications")
    object MedicationDetail : Screen("medication_detail/{medicationId}") {
        fun createRoute(medicationId: String): String = "medication_detail/$medicationId"
    }
    object AddEditReminder : Screen("add_edit_reminder/{medicationId}?reminderId={reminderId}") {
        fun createRoute(medicationId: String, reminderId: String? = null): String =
            if (reminderId.isNullOrBlank()) {
                "add_edit_reminder/$medicationId"
            } else {
                "add_edit_reminder/$medicationId?reminderId=$reminderId"
            }
    }
    object LabReports : Screen("lab_reports")
    object Payments : Screen("payments")
    object InvoiceDetail : Screen("invoice_detail/{invoiceId}") {
        fun createRoute(invoiceId: String): String = "invoice_detail/$invoiceId"
    }
    object PaymentCheckout : Screen("payment_checkout/{invoiceId}") {
        fun createRoute(invoiceId: String): String = "payment_checkout/$invoiceId"
    }
    object PaymentStatus : Screen("payment_status/{paymentId}") {
        fun createRoute(paymentId: String): String = "payment_status/$paymentId"
    }
    object PaymentHistory : Screen("payment_history")
    object ReceiptViewer : Screen("receipt_viewer/{paymentId}") {
        fun createRoute(paymentId: String): String = "receipt_viewer/$paymentId"
    }
    object AiHealthAssistant : Screen("ai_health_assistant")
    object Notifications : Screen("notifications")

    // Backwards compatibility routes
    object HospitalDirectory : Screen("hospital_directory")
    object HospitalDirectoryDetail : Screen("hospital_directory_detail/{hospitalId}") {
        fun createRoute(hospitalId: String): String = "hospital_directory_detail/$hospitalId"
    }
}
