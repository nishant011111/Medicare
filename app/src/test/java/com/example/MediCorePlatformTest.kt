package com.example

import com.example.core.model.DirectoryVerificationStatus
import com.example.data.mock.SampleData
import com.example.data.repository.MediCoreEnterpriseRepository
import com.example.feature.auth.OtpAuthValidator
import com.example.feature.auth.OtpChannel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class MediCorePlatformTest {

    @Before
    fun setUp() {
        MediCoreEnterpriseRepository.resetForTest()
    }

    @Test
    fun testRanchiDirectoryContains29RecordsAndZeroFictionalHospitals() {
        val directory = MediCoreEnterpriseRepository.directoryHospitals.value
        assertEquals("Must contain exactly 29 Ranchi directory records", 29, directory.size)
        assertEquals("First record must be RNC001", "RNC001", directory.first().directoryCode)
        assertEquals("Last record must be RNC029", "RNC029", directory.last().directoryCode)

        // Verify zero fictional hospitals exist
        val hasFictionalCityCare = directory.any { it.name.contains("City Care Hospital", ignoreCase = true) }
        val hasGreenLife = directory.any { it.name.contains("Green Life Medical Centre", ignoreCase = true) }
        val hasApolloDemo = directory.any { it.name.contains("Apollo Demo Hospital", ignoreCase = true) }

        assertFalse("Fictional 'City Care Hospital' must be removed", hasFictionalCityCare)
        assertFalse("Fictional 'Green Life' must be removed", hasGreenLife)
        assertFalse("Fictional 'Apollo Demo' must be removed", hasApolloDemo)
    }

    @Test
    fun testMissingContactFieldsPreservedAsNull() {
        val gandhiNagar = MediCoreEnterpriseRepository.getHospitalByIdOrCode("RNC026")
        assertNotNull("Gandhi Nagar Hospital RNC026 must exist", gandhiNagar)
        assertNull("Missing phone must remain null and not invented", gandhiNagar?.primaryPhone)
        assertNull("Missing email must remain null and not invented", gandhiNagar?.email)
        assertNull("Missing website must remain null and not invented", gandhiNagar?.website)
        assertNull("Missing pincode must remain null and not invented", gandhiNagar?.pincode)

        val hecHospital = MediCoreEnterpriseRepository.getHospitalByIdOrCode("RNC027")
        assertNotNull("HEC Hospital RNC027 must exist", hecHospital)
        assertNull("Missing phone must remain null", hecHospital?.primaryPhone)
        assertNull("Missing email must remain null", hecHospital?.email)

        val cancerHospital = MediCoreEnterpriseRepository.getHospitalByIdOrCode("RNC028")
        assertNotNull("Ranchi Cancer Hospital RNC028 must exist", cancerHospital)
        assertNull("Unconfirmed emergency flag must remain null", cancerHospital?.emergencyAvailable)
    }

    @Test
    fun testDirectorySearchByPinAndSpecialty() {
        val bariatuHospitals = MediCoreEnterpriseRepository.searchDirectoryHospitals(query = "834009")
        assertTrue("PIN 834009 must return hospitals in Bariatu", bariatuHospitals.isNotEmpty())

        val psychHospitals = MediCoreEnterpriseRepository.searchDirectoryHospitals(specialtyFilter = "Psychiatry")
        assertTrue("Psychiatry search must include CIP (RNC018)", psychHospitals.any { it.directoryCode == "RNC018" })
    }

    @Test
    fun testSuperAdminVerificationWorkflow() {
        val rnc26 = MediCoreEnterpriseRepository.getHospitalByIdOrCode("RNC026")
        assertNotNull(rnc26)
        assertEquals(DirectoryVerificationStatus.PENDING_VERIFICATION, rnc26?.verificationStatus)

        // Super Admin verifies contact info
        val verified = MediCoreEnterpriseRepository.verifyHospitalDirectoryRecord(
            hospitalId = "RNC026",
            primaryPhone = "+91-651-2200000",
            email = "gandhinagar.ranchi@jharkhand.gov.in"
        )
        assertNotNull(verified)
        assertEquals(DirectoryVerificationStatus.VERIFIED, verified?.verificationStatus)
        assertEquals("+91-651-2200000", verified?.primaryPhone)

        // Re-importing dataset must NOT overwrite admin-verified data
        val summary = MediCoreEnterpriseRepository.importRanchiDirectoryDataset()
        assertTrue(summary.skippedDuplicatesCount >= 1)
        val afterReimport = MediCoreEnterpriseRepository.getHospitalByIdOrCode("RNC026")
        assertEquals(DirectoryVerificationStatus.VERIFIED, afterReimport?.verificationStatus)
        assertEquals("+91-651-2200000", afterReimport?.primaryPhone)
    }

    @Test
    fun testHospitalClaimToSaasOnboardingWorkflow() {
        val app = MediCoreEnterpriseRepository.claimHospitalForOnboarding(
            directoryCode = "RNC015",
            hospitalName = "Orchid Medical Centre",
            city = "Ranchi",
            adminEmail = "director@orchidmedcentre.com",
            registrationLicenseNumber = "LIC-RNC-015",
            gstNumber = "20AAACM0000A1Z5",
            selectedPlanCode = "ENTERPRISE"
        )
        assertEquals("UNDER_REVIEW", app.status)

        // Super Admin approves and activates tenant
        val activated = MediCoreEnterpriseRepository.approveAndActivateOnboarding(app.id)
        assertNotNull(activated)
        assertEquals("ACTIVATED", activated?.status)

        val hosp = MediCoreEnterpriseRepository.getHospitalByIdOrCode("RNC015")
        assertTrue("Claimed hospital must become active tenant", hosp?.isActiveTenant == true)
        assertEquals(DirectoryVerificationStatus.VERIFIED, hosp?.verificationStatus)
        assertTrue(MediCoreEnterpriseRepository.isFeatureEntitled("AI_ASSISTANT"))
    }

    @Test
    fun testClinicalVitalsBmiAndIntegerBilling() {
        val vitals = MediCoreEnterpriseRepository.recordVitalsWithBmi(
            patientId = "PAT-1",
            patientName = "Test Patient",
            systolicBp = 120,
            diastolicBp = 80,
            heartRateBpm = 72,
            temperatureCelsius = 37.0,
            oxygenSaturation = 98,
            heightCm = 175.0,
            weightKg = 70.0
        )
        assertEquals(22.9, vitals.bmi, 0.1)

        val invoice = MediCoreEnterpriseRepository.createInvoiceInPaise(
            hospitalId = "RNC001",
            patientName = "Test Patient",
            serviceCategory = "Consultation",
            subtotalPaise = 50000L, // ₹500.00
            taxPercent = 5
        )
        assertEquals(52500L, invoice.totalAmountPaise) // ₹525.00
        val paidInvoice = MediCoreEnterpriseRepository.recordInvoicePaymentInPaise(invoice.id, 52500L)
        assertEquals("PAID", paidInvoice.status)
        assertEquals(0L, paidInvoice.balanceDuePaise)
    }

    @Test
    fun testOtpAuthValidatorPhoneEmailAndCodeRules() {
        assertTrue(OtpAuthValidator.isValidPhone("+91 98765 43210"))
        assertTrue(OtpAuthValidator.isValidPhone("9876543210"))
        assertFalse(OtpAuthValidator.isValidPhone("12345"))
        assertFalse(OtpAuthValidator.isValidPhone("not-a-phone"))

        assertTrue(OtpAuthValidator.isValidEmail("patient@medicore.org"))
        assertFalse(OtpAuthValidator.isValidEmail("patient@"))
        assertFalse(OtpAuthValidator.isValidEmail("plain-text"))

        assertTrue(OtpAuthValidator.isValidOtp("739204"))
        assertFalse(OtpAuthValidator.isValidOtp("73920"))
        assertFalse(OtpAuthValidator.isValidOtp("7392041"))
        assertFalse(OtpAuthValidator.isValidOtp("73920a"))

        assertEquals("+******3210", OtpAuthValidator.maskIdentifier("+919876543210", OtpChannel.PHONE))
        assertEquals("pa***@medicore.org", OtpAuthValidator.maskIdentifier("patient@medicore.org", OtpChannel.EMAIL))
    }
}
