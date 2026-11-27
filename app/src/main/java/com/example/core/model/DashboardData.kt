package com.example.core.model

data class MetricCardData(
    val title: String,
    val value: String,
    val changeText: String,
    val isPositive: Boolean,
    val iconName: String
)

data class QuickActionData(
    val id: String,
    val label: String,
    val iconName: String,
    val badge: String? = null
)

data class RecentActivityData(
    val id: String,
    val title: String,
    val subtitle: String,
    val timeAgo: String,
    val statusTag: String,
    val statusColorHex: Long
)

data class DashboardSummary(
    val role: UserRole,
    val welcomeTitle: String,
    val subtitle: String,
    val metrics: List<MetricCardData>,
    val quickActions: List<QuickActionData>,
    val recentActivities: List<RecentActivityData>
)

data class HealthKeyIndicator(
    val id: String,
    val label: String,
    val value: String,
    val referenceText: String,
    val statusLabel: String,
    val isNormal: Boolean = true,
    val iconName: String
)

data class UpcomingAppointmentSummary(
    val id: String,
    val bookingNumber: String,
    val doctorName: String,
    val department: String,
    val hospitalName: String,
    val appointmentDate: String,
    val slotTime: String,
    val status: String,
    val queueToken: Int
)

data class PrescriptionAlertSummary(
    val id: String,
    val medicineName: String,
    val dosageAndFrequency: String,
    val prescribedBy: String,
    val alertTitle: String,
    val alertBadge: String,
    val isUrgent: Boolean = false
)

data class PatientHealthOverviewData(
    val patientName: String = "Patient",
    val hospitalName: String = "",
    val bloodGroup: String = "O+",
    val knownAllergies: List<String> = emptyList(),
    val overallStatusLabel: String = "Vitals Stable",
    val keyIndicators: List<HealthKeyIndicator> = emptyList(),
    val upcomingAppointments: List<UpcomingAppointmentSummary> = emptyList(),
    val prescriptionAlerts: List<PrescriptionAlertSummary> = emptyList()
)

