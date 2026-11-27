package com.example.data.mock

import com.example.core.model.DashboardSummary
import com.example.core.model.Hospital
import com.example.core.model.MetricCardData
import com.example.core.model.QuickActionData
import com.example.core.model.UserProfile
import com.example.core.model.UserRole

/**
 * MediCore Authentic Ranchi Hospital Contact Directory Dataset (29 Records: RNC001–RNC029)
 * Compiled directly from the provided Ranchi Hospital Contact Directory.
 * All fictional demo hospitals, sample patients, dummy doctors, and fabricated activity logs
 * have been completely removed. Blank phone numbers, emails, websites, and pincodes remain strictly null.
 */
object SampleData {

    val ranchiDirectoryHospitals: List<Hospital> = listOf(
        Hospital(
            id = "RNC001",
            directoryCode = "RNC001",
            name = "RIMS – Rajendra Institute of Medical Sciences",
            facilityType = "Government / multispeciality",
            ownershipType = "Government",
            address = "Bariatu, Ranchi – 834009",
            pincode = "834009",
            primaryPhone = "0651-2541533",
            secondaryPhone = "0651-2544471",
            email = null,
            website = "https://www.rimsranchi.org/contact.html",
            specialties = listOf("Multispeciality"),
            emergencyAvailable = null,
            dataStatus = "Verify phone before visit",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://www.rimsranchi.org/contact.html"
        ),
        Hospital(
            id = "RNC002",
            directoryCode = "RNC002",
            name = "Sadar Hospital Ranchi",
            facilityType = "Government",
            ownershipType = "Government",
            address = "Mahatma Gandhi Main Road, New Barhi Toli, Ranchi – 834001",
            pincode = "834001",
            primaryPhone = "97090 16627",
            secondaryPhone = null,
            email = null,
            website = "https://ranchi.nic.in/public-utility-category/hospital/",
            specialties = emptyList(),
            emergencyAvailable = null,
            dataStatus = "Verify number and OPD timings",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC003",
            directoryCode = "RNC003",
            name = "Bhagwan Mahavir Manipal Hospital",
            facilityType = "Private / multispeciality",
            ownershipType = "Private",
            address = "Near PHED Colony, Booty More, Bariatu Road, Ranchi – 834009",
            pincode = "834009",
            primaryPhone = "0651-6621000",
            secondaryPhone = "70330 93309",
            email = null,
            website = "https://www.manipalhospitals.com/ranchi/contact-us/",
            specialties = listOf("Multispeciality"),
            emergencyAvailable = null,
            dataStatus = "Confirm current contact number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://www.manipalhospitals.com/ranchi/contact-us/"
        ),
        Hospital(
            id = "RNC004",
            directoryCode = "RNC004",
            name = "Paras HEC Hospital",
            facilityType = "Private / multispeciality",
            ownershipType = "Private",
            address = "Sector 3, Dhurwa, near JSCA Stadium, Ranchi – 834004",
            pincode = "834004",
            primaryPhone = "078350 84932",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Multispeciality"),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC005",
            directoryCode = "RNC005",
            name = "Santevita Hospital",
            facilityType = "Private / multispeciality",
            ownershipType = "Private",
            address = "1 H.B. Road, near Firayalal Chowk, Ranchi – 834001",
            pincode = "834001",
            primaryPhone = "73600 33390",
            secondaryPhone = "0651-7111555",
            email = null,
            website = "https://www.santevitahospital.com/contact",
            specialties = listOf("Multispeciality"),
            emergencyAvailable = null,
            dataStatus = "Verify current contact details",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://www.santevitahospital.com/contact"
        ),
        Hospital(
            id = "RNC006",
            directoryCode = "RNC006",
            name = "Raj Hospitals",
            facilityType = "Private / multispeciality",
            ownershipType = "Private",
            address = "Main Road, behind Central, Hindpiri, Ranchi – 834001",
            pincode = "834001",
            primaryPhone = "97714 88888",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Multispeciality"),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC007",
            directoryCode = "RNC007",
            name = "Medanta Abdur Razzaque Ansari Memorial Weavers’ Hospital",
            facilityType = "Private / multispeciality",
            ownershipType = "Private",
            address = "NH-33, P.O. Irba, P.S. Ormanjhi, Ranchi – 835217",
            pincode = "835217",
            primaryPhone = "1800 891 3100",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Multispeciality"),
            emergencyAvailable = null,
            dataStatus = "Confirm hospital switchboard",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC008",
            directoryCode = "RNC008",
            name = "Samford Hospital",
            facilityType = "Private",
            ownershipType = "Private",
            address = "Kokar Chowk, Kokar, Ranchi – 834001",
            pincode = "834001",
            primaryPhone = "73600 80040",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = emptyList(),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC009",
            directoryCode = "RNC009",
            name = "R.P.S. Hospital",
            facilityType = "Private",
            ownershipType = "Private",
            address = "Bariatu Road, near RIMS petrol pump, Ranchi – 834009",
            pincode = "834009",
            primaryPhone = "95251 40001",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = emptyList(),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC010",
            directoryCode = "RNC010",
            name = "Maa Ram Pyari Super Speciality Hospital",
            facilityType = "Private / multispeciality",
            ownershipType = "Private",
            address = "Harihar Singh Road, Bariatu, Ranchi – 834009",
            pincode = "834009",
            primaryPhone = "92644 43201",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Multispeciality"),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC011",
            directoryCode = "RNC011",
            name = "Devanika Hospital",
            facilityType = "Private",
            ownershipType = "Private",
            address = "Ancillary Industrial Area, Tupudana, Ranchi – 834003",
            pincode = "834003",
            primaryPhone = "72099 48555",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = emptyList(),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC012",
            directoryCode = "RNC012",
            name = "Panacea Superspeciality Hospital",
            facilityType = "Private / multispeciality",
            ownershipType = "Private",
            address = "Near Jai Prakash Nagar, Deepatoli, Bariatu, Ranchi – 834012",
            pincode = "834012",
            primaryPhone = "92418 27500",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Multispeciality"),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC013",
            directoryCode = "RNC013",
            name = "ESIC Model Hospital",
            facilityType = "Government / ESIC",
            ownershipType = "Government",
            address = "Purulia Road, Namkum, Ranchi – 834010",
            pincode = "834010",
            primaryPhone = "1800 11 2526",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("ESIC"),
            emergencyAvailable = null,
            dataStatus = "Confirm local hospital contact",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC014",
            directoryCode = "RNC014",
            name = "Alam Hospital & Research Centre",
            facilityType = "Private",
            ownershipType = "Private",
            address = "Booty Road, Bariatu, Ranchi – 834009",
            pincode = "834009",
            primaryPhone = "0651-2547233",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = emptyList(),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC015",
            directoryCode = "RNC015",
            name = "Orchid Medical Centre",
            facilityType = "Private / multispeciality",
            ownershipType = "Private",
            address = "Near Plaza Cinema, H.B. Road, Ranchi – 834001",
            pincode = "834001",
            primaryPhone = "93042 84818",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Multispeciality"),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC016",
            directoryCode = "RNC016",
            name = "Nagarmal Modi Seva Sadan",
            facilityType = "Private",
            ownershipType = "Private",
            address = "Seva Sadan Road, Upper Bazar, Ranchi – 834001",
            pincode = "834001",
            primaryPhone = "0651-2209570",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = emptyList(),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC017",
            directoryCode = "RNC017",
            name = "Rani Children Hospital",
            facilityType = "Private / paediatric",
            ownershipType = "Private",
            address = "Near Karamtoli Chowk, Bariatu Road, Ranchi – 834009",
            pincode = "834009",
            primaryPhone = "93344 32308",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Paediatric"),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC018",
            directoryCode = "RNC018",
            name = "Central Institute of Psychiatry (CIP)",
            facilityType = "Government / mental health",
            ownershipType = "Government",
            address = "Kanke, Ranchi – 834006",
            pincode = "834006",
            primaryPhone = "0651-2451115",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Mental health", "Psychiatry"),
            emergencyAvailable = null,
            dataStatus = "Verify number and appointment process",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC019",
            directoryCode = "RNC019",
            name = "Abdul Razzak Ansari Memorial Hospital",
            facilityType = "Private / multispeciality",
            ownershipType = "Private",
            address = "Irba Post Office, NH-23, Rukka, Ranchi – 834001",
            pincode = "834001",
            primaryPhone = "0651-2275717",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Multispeciality"),
            emergencyAvailable = null,
            dataStatus = "Verify number and postal address",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC020",
            directoryCode = "RNC020",
            name = "HCG Curie Abdur Razzaque Ansari Cancer Institute",
            facilityType = "Private / oncology",
            ownershipType = "Private",
            address = "NH-33, H.B. Road, Irba, Ormanjhi, Ranchi – 835217",
            pincode = "835217",
            primaryPhone = "70911 68222",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Oncology"),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC021",
            directoryCode = "RNC021",
            name = "Hill View Hospital & Research Centre",
            facilityType = "Private",
            ownershipType = "Private",
            address = "Hill View Road, Bariatu, Ranchi – 834009",
            pincode = "834009",
            primaryPhone = "0651-2542363",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = emptyList(),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC022",
            directoryCode = "RNC022",
            name = "Kashyap Memorial Eye Hospital",
            facilityType = "Private / eye care",
            ownershipType = "Private",
            address = "Purulia Road, near Dangra Toli Chowk, Ranchi – 834001",
            pincode = "834001",
            primaryPhone = "0651-2531255",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Eye care"),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC023",
            directoryCode = "RNC023",
            name = "Devkamal Hospital & Research Centre",
            facilityType = "Private / multispeciality",
            ownershipType = "Private",
            address = "Bajra, Itki Road, Ranchi – 834005",
            pincode = "834005",
            primaryPhone = "0651-9431109615",
            secondaryPhone = "9204055638",
            email = null,
            website = null,
            specialties = listOf("Multispeciality"),
            emergencyAvailable = null,
            dataStatus = "Verify phone formatting",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC024",
            directoryCode = "RNC024",
            name = "Kanke General Hospital & Research Centre",
            facilityType = "Private",
            ownershipType = "Private",
            address = "Block Chowk, Kanke, Ranchi – 834006",
            pincode = "834006",
            primaryPhone = "0651-2450072",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = emptyList(),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC025",
            directoryCode = "RNC025",
            name = "Ram Pyari Ortho Hospital",
            facilityType = "Private / orthopaedics",
            ownershipType = "Private",
            address = "Yadav Bhawan, Karam Toli, Ranchi – 834001",
            pincode = "834001",
            primaryPhone = "0651-2561822",
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Orthopaedics"),
            emergencyAvailable = null,
            dataStatus = "Verify number",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC026",
            directoryCode = "RNC026",
            name = "Gandhi Nagar Hospital",
            facilityType = "Hospital / local facility",
            ownershipType = "Not confirmed",
            address = "Kanke Road, Ranchi, Jharkhand, India",
            pincode = null,
            primaryPhone = null,
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = emptyList(),
            emergencyAvailable = null,
            dataStatus = "Contact details need verification",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC027",
            directoryCode = "RNC027",
            name = "HEC Hospital",
            facilityType = "Hospital / local facility",
            ownershipType = "Not confirmed",
            address = "Dhurwa, Ranchi, Jharkhand, India",
            pincode = null,
            primaryPhone = null,
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = emptyList(),
            emergencyAvailable = null,
            dataStatus = "Contact details need verification",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC028",
            directoryCode = "RNC028",
            name = "Ranchi Cancer Hospital & Research Centre",
            facilityType = "Specialty / oncology",
            ownershipType = "Not confirmed",
            address = "Kanke, Ranchi, Jharkhand, India",
            pincode = null,
            primaryPhone = null,
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Oncology"),
            emergencyAvailable = null,
            dataStatus = "Contact details need verification",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        ),
        Hospital(
            id = "RNC029",
            directoryCode = "RNC029",
            name = "Anvi Newborn and Child Hospital",
            facilityType = "Specialty / paediatric",
            ownershipType = "Not confirmed",
            address = "Lalpur, Ranchi, Jharkhand, India",
            pincode = null,
            primaryPhone = null,
            secondaryPhone = null,
            email = null,
            website = null,
            specialties = listOf("Paediatric"),
            emergencyAvailable = null,
            dataStatus = "Contact details need verification",
            sourceName = "Ranchi Hospital Contact Directory",
            sourceUrl = "https://ranchi.nic.in/public-utility-category/hospital/"
        )
    )

    // Backwards-compatible alias pointing to real Ranchi Directory hospitals (zero fictional hospitals)
    val sampleHospitals: List<Hospital>
        get() = ranchiDirectoryHospitals

    val defaultUserProfile = UserProfile(
        id = "",
        fullName = "",
        email = "",
        phone = "",
        selectedHospitalId = "RNC001",
        role = UserRole.PATIENT,
        isDemoAccount = false
    )

    /**
     * Returns authentic, zero-demo-data operational summaries for each role.
     * No fake appointments, fake patient names, or fabricated revenue statistics.
     */
    fun getDashboardDataForRole(
        role: UserRole,
        hospitalName: String,
        directoryCount: Int = ranchiDirectoryHospitals.size,
        verifiedCount: Int = 0,
        scheduledAppointmentsCount: Int = 0,
        registeredPatientsCount: Int = 0,
        invoicesCount: Int = 0
    ): DashboardSummary {
        val pendingCount = (directoryCount - verifiedCount).coerceAtLeast(0)
        return when (role) {
            UserRole.PATIENT -> DashboardSummary(
                role = role,
                welcomeTitle = "Patient Care Portal",
                subtitle = "Selected facility: $hospitalName",
                metrics = listOf(
                    MetricCardData("Ranchi Directory", "$directoryCount Facilities", "Public reference directory", true, "Domain"),
                    MetricCardData("Appointments", "$scheduledAppointmentsCount Scheduled", "Book with verified hospitals", true, "Event"),
                    MetricCardData("Medical Records", "$registeredPatientsCount Records", "Hospital-scoped EHR", true, "Description"),
                    MetricCardData("Invoices", "$invoicesCount Generated", "Transparent itemised billing", true, "ReceiptLong")
                ),
                quickActions = listOf(
                    QuickActionData("find_hospitals", "Hospitals", "Domain"),
                    QuickActionData("find_doctors", "Doctors", "Person"),
                    QuickActionData("book_app", "Appointments", "EventAvailable"),
                    QuickActionData("view_ehr", "Medical Records", "Description"),
                    QuickActionData("prescriptions", "Prescriptions", "Medication"),
                    QuickActionData("medications", "Medications", "Medication"),
                    QuickActionData("lab_reports", "Lab Reports", "Biotech"),
                    QuickActionData("billing", "Payments", "Payments"),
                    QuickActionData("ai_assist", "AI Health Assistant", "AutoAwesome", "24/7")
                ),
                recentActivities = emptyList()
            )
            UserRole.DOCTOR -> DashboardSummary(
                role = role,
                welcomeTitle = "Clinical Workspace",
                subtitle = "Clinical consultations & EHR at $hospitalName",
                metrics = listOf(
                    MetricCardData("Appointments", "$scheduledAppointmentsCount Scheduled", "Today's clinical queue", true, "CalendarToday"),
                    MetricCardData("Patient EHR", "$registeredPatientsCount Profiles", "Scoped clinical records", true, "People"),
                    MetricCardData("AI Drafts", "Consent Required", "Doctor approval enforced", true, "AutoAwesome"),
                    MetricCardData("Directory Status", "Ranchi ($directoryCount)", "Public hospital reference", true, "Domain")
                ),
                quickActions = listOf(
                    QuickActionData("view_ehr", "Clinical EHR & Vitals", "MonitorHeart"),
                    QuickActionData("book_app", "Consultations & Queue", "CalendarToday"),
                    QuickActionData("ai_assist", "AI Clinical Assistant", "AutoAwesome", "AI"),
                    QuickActionData("find_hospitals", "Find Hospitals", "Domain")
                ),
                recentActivities = emptyList()
            )
            UserRole.NURSE -> DashboardSummary(
                role = role,
                welcomeTitle = "Nursing & IPD Station",
                subtitle = "Vitals logging & ward care at $hospitalName",
                metrics = listOf(
                    MetricCardData("Registered Patients", "$registeredPatientsCount Patients", "Active clinical roster", true, "People"),
                    MetricCardData("IPD & Wards", "0 Occupied", "Ready for admission", true, "Bed"),
                    MetricCardData("Vitals Queue", "0 Pending", "BMI auto-calculated", true, "MonitorHeart"),
                    MetricCardData("Alerts", "0 Active", "No urgent nursing alerts", true, "NotificationsActive")
                ),
                quickActions = listOf(
                    QuickActionData("view_ehr", "Record Patient Vitals", "MonitorHeart"),
                    QuickActionData("ipd_ops", "IPD Wards & Beds", "Bed"),
                    QuickActionData("find_hospitals", "Find Hospitals", "Domain"),
                    QuickActionData("security_center", "Notifications & Security", "Security")
                ),
                recentActivities = emptyList()
            )
            UserRole.RECEPTIONIST -> DashboardSummary(
                role = role,
                welcomeTitle = "Front Desk & OPD Queue",
                subtitle = "Patient registration & scheduling at $hospitalName",
                metrics = listOf(
                    MetricCardData("Registered Patients", "$registeredPatientsCount Patients", "Global & hospital IDs", true, "PersonAdd"),
                    MetricCardData("OPD Appointments", "$scheduledAppointmentsCount Scheduled", "Token & slot queue", true, "ConfirmationNumber"),
                    MetricCardData("Invoices", "$invoicesCount Generated", "OPD & service billing", true, "ReceiptLong"),
                    MetricCardData("Ranchi Directory", "$directoryCount Listed", "Reference facilities", true, "Domain")
                ),
                quickActions = listOf(
                    QuickActionData("view_ehr", "Register Patient", "PersonAdd"),
                    QuickActionData("book_app", "Schedule Appointment", "EventAvailable"),
                    QuickActionData("billing", "Create Service Invoice", "Payments"),
                    QuickActionData("find_hospitals", "Find Hospitals", "Domain")
                ),
                recentActivities = emptyList()
            )
            UserRole.PHARMACIST -> DashboardSummary(
                role = role,
                welcomeTitle = "Pharmacy & Inventory",
                subtitle = "Expiry-aware batch dispensing at $hospitalName",
                metrics = listOf(
                    MetricCardData("Prescriptions", "0 Pending", "Digital Rx queue", true, "Medication"),
                    MetricCardData("Stock Batches", "0 Low Stock", "Batch expiry tracked", true, "Inventory2"),
                    MetricCardData("Dispensed Today", "0 Units", "Verified batch log", true, "CheckCircle"),
                    MetricCardData("Purchase Orders", "0 Open", "Supplier procurement", true, "LocalPharmacy")
                ),
                quickActions = listOf(
                    QuickActionData("lab_pharmacy", "Pharmacy & Lab Hub", "LocalPharmacy"),
                    QuickActionData("ipd_ops", "Inventory & Stock", "Inventory2"),
                    QuickActionData("billing", "Pharmacy Billing", "ReceiptLong"),
                    QuickActionData("find_hospitals", "Find Hospitals", "Domain")
                ),
                recentActivities = emptyList()
            )
            UserRole.LAB_TECHNICIAN -> DashboardSummary(
                role = role,
                welcomeTitle = "Laboratory Information System",
                subtitle = "Sample tracking & report verification at $hospitalName",
                metrics = listOf(
                    MetricCardData("Test Orders", "0 Pending", "OPD & IPD requests", true, "Biotech"),
                    MetricCardData("Samples Tracked", "0 Active", "Barcode sample IDs", true, "Science"),
                    MetricCardData("Verified Reports", "0 Published", "Pathologist sign-off", true, "Verified"),
                    MetricCardData("Critical Values", "0 Alerts", "All results within range", true, "NotificationsActive")
                ),
                quickActions = listOf(
                    QuickActionData("lab_pharmacy", "Lab Orders & Samples", "Biotech"),
                    QuickActionData("view_ehr", "Patient Clinical Records", "Description"),
                    QuickActionData("billing", "Lab Service Billing", "Payments"),
                    QuickActionData("find_hospitals", "Find Hospitals", "Domain")
                ),
                recentActivities = emptyList()
            )
            UserRole.ACCOUNTANT -> DashboardSummary(
                role = role,
                welcomeTitle = "Finance & Revenue Ledger",
                subtitle = "Integer paise billing & insurance claims at $hospitalName",
                metrics = listOf(
                    MetricCardData("Invoices", "$invoicesCount Generated", "Exact paise ledger", true, "ReceiptLong"),
                    MetricCardData("Collections", "₹0.00", "Idempotent payment log", true, "AccountBalanceWallet"),
                    MetricCardData("Insurance Claims", "0 Active", "TPA pre-auth & settlement", true, "Verified"),
                    MetricCardData("Credit Notes", "0 Issued", "Audited adjustments", true, "Description")
                ),
                quickActions = listOf(
                    QuickActionData("billing", "Service Billing & Claims", "Payments"),
                    QuickActionData("saas_portal", "SaaS Subscription & Plans", "DomainVerification"),
                    QuickActionData("find_hospitals", "Find Hospitals", "Domain"),
                    QuickActionData("security_center", "Audit & Security Center", "Security")
                ),
                recentActivities = emptyList()
            )
            UserRole.HOSPITAL_ADMIN -> DashboardSummary(
                role = role,
                welcomeTitle = "Hospital Administration",
                subtitle = "Operations, onboarding & SaaS subscription for $hospitalName",
                metrics = listOf(
                    MetricCardData("Patients", "$registeredPatientsCount Registered", "Hospital registry", true, "People"),
                    MetricCardData("Appointments", "$scheduledAppointmentsCount Scheduled", "Department slots", true, "Event"),
                    MetricCardData("Invoices", "$invoicesCount Generated", "Financial ledger", true, "Payments"),
                    MetricCardData("SaaS Plan", "Configurable", "Starter / Pro / Enterprise", true, "Verified")
                ),
                quickActions = listOf(
                    QuickActionData("saas_portal", "SaaS Onboarding & Plans", "DomainVerification"),
                    QuickActionData("view_ehr", "Patients, Doctors & EHR", "People"),
                    QuickActionData("billing", "Billing & Financials", "Payments"),
                    QuickActionData("find_hospitals", "Ranchi Hospital Directory", "Domain")
                ),
                recentActivities = emptyList()
            )
            UserRole.SUPER_ADMIN -> DashboardSummary(
                role = role,
                welcomeTitle = "MediCore Platform Governance",
                subtitle = "Ranchi Hospital Directory ($directoryCount records) & Multi-Tenant SaaS Control",
                metrics = listOf(
                    MetricCardData("Ranchi Directory", "$directoryCount Hospitals", "RNC001–RNC029 loaded", true, "Domain"),
                    MetricCardData("Pending Verification", "$pendingCount Records", "Awaiting admin verification", false, "PendingActions"),
                    MetricCardData("Verified Facilities", "$verifiedCount Hospitals", "Confirmed contact data", true, "Verified"),
                    MetricCardData("SaaS Plans", "3 Tiers Active", "Starter, Pro, Enterprise", true, "CheckCircle")
                ),
                quickActions = listOf(
                    QuickActionData("admin_directory", "Manage Directory ($directoryCount)", "DomainVerification", "$pendingCount Pending"),
                    QuickActionData("find_hospitals", "Find Hospitals", "Domain"),
                    QuickActionData("saas_portal", "SaaS Governance & Plans", "Analytics"),
                    QuickActionData("security_center", "Security, MFA & Outbox", "Security")
                ),
                recentActivities = emptyList()
            )
        }
    }
}
