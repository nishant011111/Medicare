package com.example.data.repository

import com.example.core.model.DirectoryVerificationStatus
import com.example.core.model.Hospital
import com.example.core.model.HospitalStatus
import com.example.core.network.MediCoreApiService
import com.example.data.mock.SampleData
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

interface HospitalRepository {
    fun getHospitals(): Flow<List<Hospital>>
    fun getHospitalById(id: String): Hospital?
    suspend fun syncFromBackend(apiService: MediCoreApiService): Boolean = false
}

class HospitalRepositoryImpl : HospitalRepository {
    private val hospitalsState = MutableStateFlow(SampleData.sampleHospitals)

    override fun getHospitals(): Flow<List<Hospital>> = hospitalsState.asStateFlow()

    override fun getHospitalById(id: String): Hospital? {
        return hospitalsState.value.find { it.id == id } ?: hospitalsState.value.firstOrNull()
    }

    override suspend fun syncFromBackend(apiService: MediCoreApiService): Boolean {
        return try {
            val response = apiService.discoverHospitals()
            val parsed = ApiResponseParser.parse(response)
            if (parsed is ApiResult.Success && parsed.data.isNotEmpty()) {
                val mapped = parsed.data.map { dto ->
                    Hospital(
                        id = dto.id,
                        directoryCode = dto.directoryCode ?: dto.id,
                        name = dto.name,
                        facilityType = dto.hospitalType.ifBlank { "Hospital" },
                        ownershipType = dto.ownershipType ?: "Private",
                        address = dto.address,
                        city = dto.city.ifBlank { "Ranchi" },
                        state = dto.state.ifBlank { "Jharkhand" },
                        pincode = dto.pincode,
                        specialties = dto.specialties.ifEmpty { dto.departments },
                        primaryPhone = dto.contactPhone,
                        email = dto.contactEmail,
                        website = dto.website,
                        emergencyAvailable = dto.emergencyAvailable,
                        verificationStatus = if (dto.isVerified || dto.verificationStatus == "VERIFIED") {
                            DirectoryVerificationStatus.VERIFIED
                        } else {
                            DirectoryVerificationStatus.PENDING_VERIFICATION
                        },
                        status = HospitalStatus.APPROVED,
                        isActiveTenant = true
                    )
                }
                hospitalsState.value = mapped
                true
            } else {
                false
            }
        } catch (_: Exception) {
            false
        }
    }
}
