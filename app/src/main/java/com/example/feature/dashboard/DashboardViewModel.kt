package com.example.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.model.DashboardSummary
import com.example.core.model.DirectoryVerificationStatus
import com.example.core.model.HealthKeyIndicator
import com.example.core.model.Hospital
import com.example.core.model.PatientHealthOverviewData
import com.example.core.model.PrescriptionAlertSummary
import com.example.core.model.UpcomingAppointmentSummary
import com.example.core.model.UserProfile
import com.example.core.model.UserRole
import com.example.data.mock.SampleData
import com.example.data.repository.AppointmentItem
import com.example.data.repository.ClinicalEncounterItem
import com.example.data.repository.MediCoreEnterpriseRepository
import com.example.data.repository.UserRepository
import com.example.data.repository.UserRepositoryImpl
import com.example.data.repository.VitalSignEntry
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.util.Locale

data class DashboardUiState(
    val currentRole: UserRole = UserRole.PATIENT,
    val selectedHospital: Hospital = SampleData.ranchiDirectoryHospitals.first(),
    val userProfile: UserProfile = SampleData.defaultUserProfile,
    val dashboardSummary: DashboardSummary = SampleData.getDashboardDataForRole(
        UserRole.PATIENT,
        SampleData.ranchiDirectoryHospitals.first().name
    ),
    val healthOverview: PatientHealthOverviewData = DashboardViewModel.buildHealthOverview(
        userProfile = SampleData.defaultUserProfile,
        hospital = SampleData.ranchiDirectoryHospitals.first(),
        vitals = emptyList(),
        appointments = emptyList(),
        encounters = emptyList()
    )
)

class DashboardViewModel(
    private val userRepository: UserRepository = UserRepositoryImpl()
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadData()
        observeClinicalAndAppointmentUpdates()
    }

    private fun observeClinicalAndAppointmentUpdates() {
        viewModelScope.launch {
            combine(
                MediCoreEnterpriseRepository.appointments,
                MediCoreEnterpriseRepository.vitals,
                MediCoreEnterpriseRepository.encounters,
                MediCoreEnterpriseRepository.patients,
                MediCoreEnterpriseRepository.invoices
            ) { appointments, vitals, encounters, patients, invoices ->
                quint(appointments, vitals, encounters, patients.size, invoices.size)
            }.collect { (appointments, vitals, encounters, patientsCount, invoicesCount) ->
                val current = _uiState.value
                val hospitals = MediCoreEnterpriseRepository.directoryHospitals.value
                val verifiedCount = hospitals.count { it.verificationStatus == DirectoryVerificationStatus.VERIFIED }
                val summary = SampleData.getDashboardDataForRole(
                    role = UserRole.PATIENT,
                    hospitalName = current.selectedHospital.name,
                    directoryCount = hospitals.size,
                    verifiedCount = verifiedCount,
                    scheduledAppointmentsCount = appointments.size,
                    registeredPatientsCount = patientsCount,
                    invoicesCount = invoicesCount
                )
                val overview = buildHealthOverview(
                    userProfile = current.userProfile,
                    hospital = current.selectedHospital,
                    vitals = vitals,
                    appointments = appointments,
                    encounters = encounters
                )
                _uiState.value = current.copy(
                    dashboardSummary = summary,
                    healthOverview = overview
                )
            }
        }
    }

    fun loadData() {
        val currentHospitalId = _uiState.value.selectedHospital.id.ifBlank {
            _uiState.value.userProfile.selectedHospitalId
        }
        val hospitals = MediCoreEnterpriseRepository.directoryHospitals.value
        val hospital = MediCoreEnterpriseRepository.getHospitalByIdOrCode(currentHospitalId)
            ?: hospitals.first()
        val verifiedCount = hospitals.count { it.verificationStatus == DirectoryVerificationStatus.VERIFIED }
        val appointments = MediCoreEnterpriseRepository.appointments.value
        val vitals = MediCoreEnterpriseRepository.vitals.value
        val encounters = MediCoreEnterpriseRepository.encounters.value

        val summary = SampleData.getDashboardDataForRole(
            role = UserRole.PATIENT,
            hospitalName = hospital.name,
            directoryCount = hospitals.size,
            verifiedCount = verifiedCount,
            scheduledAppointmentsCount = appointments.size,
            registeredPatientsCount = MediCoreEnterpriseRepository.patients.value.size,
            invoicesCount = MediCoreEnterpriseRepository.invoices.value.size
        )
        val overview = buildHealthOverview(
            userProfile = _uiState.value.userProfile,
            hospital = hospital,
            vitals = vitals,
            appointments = appointments,
            encounters = encounters
        )

        _uiState.value = _uiState.value.copy(
            selectedHospital = hospital,
            dashboardSummary = summary,
            healthOverview = overview
        )
    }

    fun setHospital(hospitalId: String) {
        val hospitals = MediCoreEnterpriseRepository.directoryHospitals.value
        val hospital = MediCoreEnterpriseRepository.getHospitalByIdOrCode(hospitalId)
            ?: hospitals.first()
        userRepository.updateSelectedHospital(hospital.id)
        val verifiedCount = hospitals.count { it.verificationStatus == DirectoryVerificationStatus.VERIFIED }
        val appointments = MediCoreEnterpriseRepository.appointments.value
        val vitals = MediCoreEnterpriseRepository.vitals.value
        val encounters = MediCoreEnterpriseRepository.encounters.value

        val summary = SampleData.getDashboardDataForRole(
            role = UserRole.PATIENT,
            hospitalName = hospital.name,
            directoryCount = hospitals.size,
            verifiedCount = verifiedCount,
            scheduledAppointmentsCount = appointments.size,
            registeredPatientsCount = MediCoreEnterpriseRepository.patients.value.size,
            invoicesCount = MediCoreEnterpriseRepository.invoices.value.size
        )
        val overview = buildHealthOverview(
            userProfile = _uiState.value.userProfile,
            hospital = hospital,
            vitals = vitals,
            appointments = appointments,
            encounters = encounters
        )

        _uiState.value = _uiState.value.copy(
            selectedHospital = hospital,
            dashboardSummary = summary,
            healthOverview = overview
        )
    }

    fun applyAuthenticatedIdentity(
        userId: String?,
        fullName: String?,
        email: String?,
        phone: String?,
        onboardingCompleted: Boolean = false
    ) {
        val current = _uiState.value.userProfile
        val normalizedNewEmail = email?.trim()?.takeIf { it.isNotBlank() }
        val isSameIdentity = !normalizedNewEmail.isNullOrBlank() &&
            normalizedNewEmail.equals(current.email, ignoreCase = true) &&
            current.onboardingCompleted

        val base = if (isSameIdentity) {
            current
        } else {
            UserProfile(
                id = userId?.takeIf { it.isNotBlank() } ?: "USR-${System.currentTimeMillis()}",
                fullName = fullName?.trim().orEmpty(),
                email = normalizedNewEmail.orEmpty(),
                phone = phone?.trim().orEmpty(),
                selectedHospitalId = current.selectedHospitalId,
                onboardingCompleted = onboardingCompleted
            )
        }

        val updated = base.copy(
            id = userId?.takeIf { it.isNotBlank() } ?: base.id,
            fullName = fullName?.trim()?.takeIf { it.isNotBlank() } ?: base.fullName,
            email = normalizedNewEmail ?: base.email,
            phone = phone?.trim()?.takeIf { it.isNotBlank() } ?: base.phone,
            onboardingCompleted = onboardingCompleted
        )
        userRepository.updateUserProfile { updated }
        val overview = buildHealthOverview(
            userProfile = updated,
            hospital = _uiState.value.selectedHospital,
            vitals = MediCoreEnterpriseRepository.vitals.value,
            appointments = MediCoreEnterpriseRepository.appointments.value,
            encounters = MediCoreEnterpriseRepository.encounters.value
        )
        _uiState.value = _uiState.value.copy(
            userProfile = updated,
            healthOverview = overview
        )
    }

    fun applyPatientDetails(updatedProfile: UserProfile) {
        userRepository.updateUserProfile { updatedProfile }
        val overview = buildHealthOverview(
            userProfile = updatedProfile,
            hospital = _uiState.value.selectedHospital,
            vitals = MediCoreEnterpriseRepository.vitals.value,
            appointments = MediCoreEnterpriseRepository.appointments.value,
            encounters = MediCoreEnterpriseRepository.encounters.value
        )
        _uiState.value = _uiState.value.copy(
            userProfile = updatedProfile,
            healthOverview = overview
        )
    }

    fun resetSession() {
        userRepository.clearUserProfile()
        _uiState.value = DashboardUiState()
        loadData()
    }

    private data class Quint<A, B, C, D, E>(
        val first: A,
        val second: B,
        val third: C,
        val fourth: D,
        val fifth: E
    )

    private fun <A, B, C, D, E> quint(a: A, b: B, c: C, d: D, e: E) = Quint(a, b, c, d, e)

    companion object {
        fun buildHealthOverview(
            userProfile: UserProfile,
            hospital: Hospital,
            vitals: List<VitalSignEntry>,
            appointments: List<AppointmentItem>,
            encounters: List<ClinicalEncounterItem>
        ): PatientHealthOverviewData {
            val latestVital = vitals.firstOrNull()
            val systolic = latestVital?.systolicBp ?: 120
            val diastolic = latestVital?.diastolicBp ?: 80
            val pulse = latestVital?.heartRateBpm ?: 72
            val spo2 = latestVital?.oxygenSaturation ?: 99
            val bmi = latestVital?.bmi ?: 22.5

            val bpNormal = systolic in 90..129 && diastolic in 60..84
            val pulseNormal = pulse in 60..100
            val spo2Normal = spo2 >= 95 && bmi in 18.5..24.9

            val bloodGroupDisplay = userProfile.bloodGroup?.takeIf { it.isNotBlank() } ?: "O+"
            val allergies = userProfile.knownAllergies
            val allergyDisplay = if (allergies.isEmpty()) {
                "$bloodGroupDisplay • No Allergies"
            } else {
                "$bloodGroupDisplay • ${allergies.size} Allerg${if (allergies.size == 1) "y" else "ies"}"
            }

            val indicators = listOf(
                HealthKeyIndicator(
                    id = "bp",
                    label = "Blood Pressure",
                    value = "$systolic/$diastolic mmHg",
                    referenceText = if (bpNormal) "Optimal arterial range" else "Monitor BP closely",
                    statusLabel = if (bpNormal) "NORMAL" else "ELEVATED",
                    isNormal = bpNormal,
                    iconName = "MonitorHeart"
                ),
                HealthKeyIndicator(
                    id = "pulse",
                    label = "Heart Rate",
                    value = "$pulse bpm",
                    referenceText = if (pulseNormal) "Resting sinus rhythm" else "Outside resting range",
                    statusLabel = if (pulseNormal) "OPTIMAL" else "CHECK",
                    isNormal = pulseNormal,
                    iconName = "Favorite"
                ),
                HealthKeyIndicator(
                    id = "spo2_bmi",
                    label = "SpO2 & BMI",
                    value = String.format(Locale.US, "%d%% • %.1f", spo2, bmi),
                    referenceText = "Oxygen sat & body mass",
                    statusLabel = if (spo2Normal) "HEALTHY" else "REVIEW",
                    isNormal = spo2Normal,
                    iconName = "HealthAndSafety"
                ),
                HealthKeyIndicator(
                    id = "blood_allergy",
                    label = "Blood & Allergies",
                    value = allergyDisplay,
                    referenceText = if (allergies.isEmpty()) "Clinical profile ready" else allergies.joinToString(", "),
                    statusLabel = if (allergies.isEmpty()) "VERIFIED" else "ALLERGY ALERT",
                    isNormal = allergies.isEmpty(),
                    iconName = "Bloodtype"
                )
            )

            val upcomingAppointments = if (appointments.isNotEmpty()) {
                appointments.map { apt ->
                    val hospName = MediCoreEnterpriseRepository.getHospitalByIdOrCode(apt.hospitalId)?.name
                        ?: hospital.name
                    UpcomingAppointmentSummary(
                        id = apt.id,
                        bookingNumber = apt.bookingNumber,
                        doctorName = apt.doctorName,
                        department = apt.department,
                        hospitalName = hospName,
                        appointmentDate = apt.appointmentDate,
                        slotTime = apt.slotTime,
                        status = apt.status,
                        queueToken = apt.queueToken
                    )
                }
            } else {
                listOf(
                    UpcomingAppointmentSummary(
                        id = "APT-UPCOMING-01",
                        bookingNumber = "OPD-RNC-104",
                        doctorName = "Dr. A. K. Choudhary",
                        department = "Cardiology & Internal Medicine",
                        hospitalName = hospital.name,
                        appointmentDate = "Tomorrow",
                        slotTime = "10:00 AM",
                        status = "CONFIRMED",
                        queueToken = 4
                    ),
                    UpcomingAppointmentSummary(
                        id = "APT-UPCOMING-02",
                        bookingNumber = "OPD-RNC-119",
                        doctorName = "Dr. Rajesh Sinha",
                        department = "General Medicine Follow-up",
                        hospitalName = hospital.name,
                        appointmentDate = "In 5 Days",
                        slotTime = "11:30 AM",
                        status = "SCHEDULED",
                        queueToken = 9
                    )
                )
            }

            val dynamicEncounterAlerts = encounters.mapIndexed { idx, enc ->
                PrescriptionAlertSummary(
                    id = "RX-ENC-${enc.id}",
                    medicineName = enc.prescriptionSummary.ifBlank { "Clinical Encounter Rx #${idx + 1}" },
                    dosageAndFrequency = "Diagnosis: ${enc.chiefComplaint} (${enc.icd10Code})",
                    prescribedBy = "Hospital Care Team • ${hospital.name}",
                    alertTitle = "New Clinical Prescription Issued",
                    alertBadge = "NEW RX",
                    isUrgent = true
                )
            }

            val defaultPrescriptionAlerts = listOf(
                PrescriptionAlertSummary(
                    id = "RX-ALERT-01",
                    medicineName = "Amlodipine 5mg",
                    dosageAndFrequency = "1 tablet • Once daily (Morning)",
                    prescribedBy = "Dr. A. K. Choudhary",
                    alertTitle = "Refill Ready at Hospital Dispensary",
                    alertBadge = "REFILL READY",
                    isUrgent = true
                ),
                PrescriptionAlertSummary(
                    id = "RX-ALERT-02",
                    medicineName = "Paracetamol 650mg",
                    dosageAndFrequency = "1 tablet • As needed for fever/pain (5 days)",
                    prescribedBy = "Dr. Rajesh Sinha",
                    alertTitle = "Active Prescription • Dose Tracking Enabled",
                    alertBadge = "ACTIVE DOSE",
                    isUrgent = false
                ),
                PrescriptionAlertSummary(
                    id = "RX-ALERT-03",
                    medicineName = "Pantoprazole 40mg",
                    dosageAndFrequency = "1 capsule • Before breakfast (14 days)",
                    prescribedBy = "Dr. Rajesh Sinha",
                    alertTitle = "Dispensed by Pharmacy • Morning Schedule",
                    alertBadge = "DISPENSED",
                    isUrgent = false
                )
            )

            val allAlerts = (dynamicEncounterAlerts + defaultPrescriptionAlerts).take(4)
            val allVitalsNormal = bpNormal && pulseNormal && spo2Normal

            return PatientHealthOverviewData(
                patientName = userProfile.fullName.ifBlank { "Patient" },
                hospitalName = hospital.name,
                bloodGroup = bloodGroupDisplay,
                knownAllergies = allergies,
                overallStatusLabel = if (allVitalsNormal) "All Vitals Stable" else "Vitals Need Review",
                keyIndicators = indicators,
                upcomingAppointments = upcomingAppointments,
                prescriptionAlerts = allAlerts
            )
        }
    }
}

