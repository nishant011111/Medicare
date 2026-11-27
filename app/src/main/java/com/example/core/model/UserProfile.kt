package com.example.core.model

enum class MembershipStatus(val label: String, val colorHex: Long) {
    ACTIVE("Active", 0xFF10B981),
    INACTIVE("Inactive", 0xFF64748B),
    INVITED("Invited", 0xFFF59E0B),
    SUSPENDED("Suspended", 0xFFEF4444)
}

data class HospitalMembership(
    val id: String,
    val userId: String,
    val userFullName: String,
    val userEmail: String,
    val userPhone: String? = null,
    val hospitalId: String,
    val hospitalName: String,
    val hospitalCity: String,
    val hospitalCategory: String,
    val hospitalStatus: HospitalStatus = HospitalStatus.APPROVED,
    val department: String? = "General",
    val employeeCode: String? = null,
    val status: MembershipStatus = MembershipStatus.ACTIVE,
    val roles: List<UserRole> = listOf(UserRole.PATIENT),
    val joinedAt: String = "2026-11-08"
)

data class HospitalInvitation(
    val id: String,
    val hospitalId: String,
    val hospitalName: String,
    val email: String,
    val role: UserRole,
    val department: String,
    val inviteCode: String,
    val status: String = "PENDING",
    val createdAt: String = "Just now"
)

data class AuditLogEntry(
    val id: String,
    val userId: String?,
    val userEmail: String?,
    val hospitalId: String?,
    val hospitalName: String?,
    val action: String,
    val entityType: String,
    val entityId: String?,
    val timestamp: String,
    val details: String
)

data class UserProfile(
    val id: String = "",
    val fullName: String = "",
    val email: String = "",
    val phone: String = "",
    val isEmailVerified: Boolean = false,
    val isActive: Boolean = true,
    val selectedHospitalId: String = "RNC001",
    val role: UserRole = UserRole.PATIENT,
    val globalRoles: List<UserRole> = emptyList(),
    val activeRoles: List<UserRole> = listOf(UserRole.PATIENT),
    val permissions: List<String> = emptyList(),
    val memberships: List<HospitalMembership> = emptyList(),
    val avatarUrl: String? = null,
    val isDemoAccount: Boolean = false,
    val dateOfBirth: String? = null,
    val gender: String? = null,
    val houseNumber: String? = null,
    val streetAddress: String? = null,
    val locality: String? = null,
    val city: String? = null,
    val state: String? = null,
    val postalCode: String? = null,
    val country: String = "India",
    val emergencyContactName: String? = null,
    val emergencyContactPhone: String? = null,
    val emergencyContactRelationship: String? = null,
    val bloodGroup: String? = null,
    val knownAllergies: List<String> = emptyList(),
    val existingConditions: List<String> = emptyList(),
    val currentMedications: List<String> = emptyList(),
    val medicalNotes: String? = null,
    val healthConsentGranted: Boolean = false,
    val onboardingCompleted: Boolean = false,
    val profileCompletionPercent: Int = 0
)
