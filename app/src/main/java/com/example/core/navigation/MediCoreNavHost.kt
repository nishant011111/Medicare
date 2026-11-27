package com.example.core.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.example.core.network.LogoutRequestDto
import com.example.core.network.NetworkClientProvider
import com.example.core.security.SecureTokenStorage
import kotlinx.coroutines.launch
import com.example.feature.auth.AuthViewModel
import com.example.feature.auth.LoginScreen
import com.example.feature.billing.BillingDashboardScreen
import com.example.feature.billing.BillingViewModel
import com.example.feature.billing.InvoiceDetailScreen
import com.example.feature.billing.PaymentCheckoutScreen
import com.example.feature.billing.PaymentHistoryScreen
import com.example.feature.billing.PaymentStatusScreen
import com.example.feature.billing.ReceiptViewerScreen
import com.example.feature.dashboard.DashboardScreen
import com.example.feature.dashboard.DashboardViewModel
import com.example.feature.directory.HospitalDirectoryDetailScreen
import com.example.feature.directory.HospitalDirectoryScreen
import com.example.feature.hospital.HospitalSelectionScreen
import com.example.feature.hospital.HospitalViewModel
import com.example.feature.medications.AddEditReminderScreen
import com.example.feature.medications.MedicationDashboardScreen
import com.example.feature.medications.MedicationDetailScreen
import com.example.feature.medications.MedicationTrackingViewModel
import com.example.feature.modules.AiAssistantHubScreen
import com.example.feature.modules.AppointmentsHubScreen
import com.example.feature.modules.PatientDoctorsScreen
import com.example.feature.modules.PatientLabReportsScreen
import com.example.feature.modules.PatientMedicalRecordsScreen
import com.example.feature.modules.PatientNotificationsScreen
import com.example.feature.modules.PatientPrescriptionsScreen
import com.example.feature.onboarding.OnboardingScreen
import com.example.feature.onboarding.PatientDetailsScreen
import com.example.feature.onboarding.PatientDetailsViewModel
import com.example.feature.profile.ProfileScreen
import com.example.feature.settings.SettingsScreen
import com.example.feature.splash.SplashScreen

@Composable
fun MediCoreNavHost(
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController(),
    startDestination: String = Screen.Splash.route,
    authViewModel: AuthViewModel = viewModel(),
    hospitalViewModel: HospitalViewModel = viewModel(),
    dashboardViewModel: DashboardViewModel = viewModel(),
    billingViewModel: BillingViewModel = viewModel(),
    medicationTrackingViewModel: MedicationTrackingViewModel = viewModel(),
    patientDetailsViewModel: PatientDetailsViewModel = viewModel()
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val performSecureLogout: () -> Unit = {
        coroutineScope.launch {
            try {
                // 1. Revoke session on backend via REST API
                val tokenStorage = SecureTokenStorage.getInstance(context)
                val currentTokens = tokenStorage.getCurrentTokensSync()
                val apiService = NetworkClientProvider.getApiService(context)
                apiService.logout(LogoutRequestDto(refreshToken = currentTokens.refreshToken))
            } catch (_: Exception) {}

            try {
                // 2. Revoke Firebase Auth session
                Firebase.auth.signOut()
            } catch (_: Exception) {}

            try {
                // 3. Purge Android Keystore-backed session tokens and DataStore
                val tokenStorage = SecureTokenStorage.getInstance(context)
                tokenStorage.clearTokens()
            } catch (_: Exception) {}

            // 4. Clear memory state in ViewModels
            dashboardViewModel.resetSession()
            patientDetailsViewModel.resetHydration()
            authViewModel.clearCredentials()

            // 5. Navigate securely back to Login screen, clearing backstack
            navController.navigate(Screen.Login.route) {
                popUpTo(0) { inclusive = true }
                launchSingleTop = true
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier
    ) {
        composable(Screen.Splash.route) {
            SplashScreen(
                onNavigateToOnboarding = {
                    navController.navigate(Screen.Onboarding.route) {
                        popUpTo(Screen.Splash.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Onboarding.route) {
            OnboardingScreen(
                onFinishOnboarding = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(Screen.Onboarding.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Login.route) {
            LoginScreen(
                viewModel = authViewModel,
                onLoginSuccess = { authMeta ->
                    dashboardViewModel.applyAuthenticatedIdentity(
                        userId = authMeta.userId,
                        fullName = authMeta.fullName,
                        email = authMeta.email,
                        phone = authMeta.phone,
                        onboardingCompleted = authMeta.onboardingCompleted
                    )
                    patientDetailsViewModel.resetHydration()
                    val nextRoute = if (authMeta.onboardingCompleted) {
                        Screen.HospitalSelection.route
                    } else {
                        Screen.PatientDetails.createRoute(editMode = false)
                    }
                    navController.navigate(nextRoute) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }

        composable(
            route = Screen.PatientDetails.route,
            arguments = listOf(
                navArgument("editMode") {
                    type = NavType.BoolType
                    defaultValue = false
                }
            )
        ) { backStackEntry ->
            val editMode = backStackEntry.arguments?.getBoolean("editMode") ?: false
            val dashState by dashboardViewModel.uiState.collectAsState()
            PatientDetailsScreen(
                currentProfile = dashState.userProfile,
                isEditMode = editMode,
                onDetailsCompleted = { updatedProfile ->
                    dashboardViewModel.applyPatientDetails(updatedProfile)
                    if (editMode) {
                        navController.popBackStack()
                    } else {
                        navController.navigate(Screen.HospitalSelection.route) {
                            popUpTo(Screen.PatientDetails.route) { inclusive = true }
                        }
                    }
                },
                onNavigateBack = if (editMode) {
                    { navController.popBackStack() }
                } else {
                    null
                },
                viewModel = patientDetailsViewModel
            )
        }

        composable(Screen.HospitalSelection.route) {
            HospitalSelectionScreen(
                viewModel = hospitalViewModel,
                onHospitalSelected = { hospitalId ->
                    dashboardViewModel.setHospital(hospitalId)
                    navController.navigate(Screen.Dashboard.route) {
                        popUpTo(Screen.HospitalSelection.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Dashboard.route) {
            DashboardScreen(
                viewModel = dashboardViewModel,
                onNavigateToHospitalSelection = {
                    navController.navigate(Screen.HospitalSelection.route)
                },
                onNavigateToProfile = {
                    navController.navigate(Screen.Profile.route)
                },
                onNavigateToSettings = {
                    navController.navigate(Screen.Settings.route)
                },
                onNavigateToHospitals = {
                    navController.navigate(Screen.Hospitals.route)
                },
                onNavigateToDoctors = {
                    navController.navigate(Screen.Doctors.route)
                },
                onNavigateToAppointments = {
                    navController.navigate(Screen.Appointments.route)
                },
                onNavigateToMedicalRecords = {
                    navController.navigate(Screen.MedicalRecords.route)
                },
                onNavigateToPrescriptions = {
                    navController.navigate(Screen.Prescriptions.route)
                },
                onNavigateToMedications = {
                    navController.navigate(Screen.Medications.route)
                },
                onNavigateToLabReports = {
                    navController.navigate(Screen.LabReports.route)
                },
                onNavigateToPayments = {
                    navController.navigate(Screen.Payments.route)
                },
                onNavigateToAiHealthAssistant = {
                    navController.navigate(Screen.AiHealthAssistant.route)
                },
                onNavigateToNotifications = {
                    navController.navigate(Screen.Notifications.route)
                },
                onLogout = performSecureLogout
            )
        }

        // Ranchi Hospital Directory Navigation
        composable(Screen.Hospitals.route) {
            HospitalDirectoryScreen(
                onNavigateBack = { navController.popBackStack() },
                onSelectHospitalDetail = { hospitalId ->
                    navController.navigate(Screen.HospitalDetail.createRoute(hospitalId))
                },
                onClaimHospitalOnboarding = { /* Staff only, no-op for patient */ }
            )
        }

        composable(Screen.HospitalDirectory.route) {
            HospitalDirectoryScreen(
                onNavigateBack = { navController.popBackStack() },
                onSelectHospitalDetail = { hospitalId ->
                    navController.navigate(Screen.HospitalDetail.createRoute(hospitalId))
                },
                onClaimHospitalOnboarding = { /* Staff only, no-op for patient */ }
            )
        }

        composable(
            route = Screen.HospitalDetail.route,
            arguments = listOf(navArgument("hospitalId") { type = NavType.StringType })
        ) { backStackEntry ->
            val hospitalId = backStackEntry.arguments?.getString("hospitalId") ?: "RNC001"
            HospitalDirectoryDetailScreen(
                hospitalId = hospitalId,
                onNavigateBack = { navController.popBackStack() },
                onRegisterHospitalClaim = { /* Staff only, no-op for patient */ }
            )
        }

        composable(
            route = Screen.HospitalDirectoryDetail.route,
            arguments = listOf(navArgument("hospitalId") { type = NavType.StringType })
        ) { backStackEntry ->
            val hospitalId = backStackEntry.arguments?.getString("hospitalId") ?: "RNC001"
            HospitalDirectoryDetailScreen(
                hospitalId = hospitalId,
                onNavigateBack = { navController.popBackStack() },
                onRegisterHospitalClaim = { /* Staff only, no-op for patient */ }
            )
        }

        // Patient Dedicated Destinations
        composable(Screen.Doctors.route) {
            PatientDoctorsScreen(
                onNavigateBack = { navController.popBackStack() },
                onBookConsultation = { _ ->
                    navController.navigate(Screen.Appointments.route)
                }
            )
        }

        composable(Screen.Appointments.route) {
            val dashState by dashboardViewModel.uiState.collectAsState()
            AppointmentsHubScreen(
                onNavigateBack = { navController.popBackStack() },
                selectedHospitalId = dashState.selectedHospital.id
            )
        }

        composable(Screen.MedicalRecords.route) {
            PatientMedicalRecordsScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Prescriptions.route) {
            PatientPrescriptionsScreen(
                onNavigateBack = { navController.popBackStack() },
                onOpenMedicationTracking = {
                    navController.navigate(Screen.Medications.route)
                }
            )
        }

        composable(Screen.Medications.route) {
            MedicationDashboardScreen(
                onNavigateBack = { navController.popBackStack() },
                onOpenMedicationDetail = { medicationId ->
                    navController.navigate(Screen.MedicationDetail.createRoute(medicationId))
                },
                onAddReminderForMedication = { medicationId ->
                    navController.navigate(Screen.AddEditReminder.createRoute(medicationId))
                },
                viewModel = medicationTrackingViewModel
            )
        }

        composable(
            route = Screen.MedicationDetail.route,
            arguments = listOf(navArgument("medicationId") { type = NavType.StringType })
        ) { backStackEntry ->
            val medicationId = backStackEntry.arguments?.getString("medicationId") ?: ""
            MedicationDetailScreen(
                medicationId = medicationId,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToAddReminder = { medId, reminderId ->
                    navController.navigate(Screen.AddEditReminder.createRoute(medId, reminderId))
                },
                viewModel = medicationTrackingViewModel
            )
        }

        composable(
            route = Screen.AddEditReminder.route,
            arguments = listOf(
                navArgument("medicationId") { type = NavType.StringType },
                navArgument("reminderId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) { backStackEntry ->
            val medicationId = backStackEntry.arguments?.getString("medicationId") ?: ""
            val reminderId = backStackEntry.arguments?.getString("reminderId")
            AddEditReminderScreen(
                medicationId = medicationId,
                existingReminderId = reminderId,
                onNavigateBack = { navController.popBackStack() },
                viewModel = medicationTrackingViewModel
            )
        }

        composable(Screen.LabReports.route) {
            PatientLabReportsScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Payments.route) {
            BillingDashboardScreen(
                onNavigateBack = { navController.popBackStack() },
                onOpenInvoiceDetail = { invoiceId ->
                    navController.navigate(Screen.InvoiceDetail.createRoute(invoiceId))
                },
                onPayInvoice = { invoiceId ->
                    navController.navigate(Screen.PaymentCheckout.createRoute(invoiceId))
                },
                onOpenPaymentHistory = {
                    navController.navigate(Screen.PaymentHistory.route)
                },
                onOpenReceipt = { paymentId ->
                    navController.navigate(Screen.ReceiptViewer.createRoute(paymentId))
                },
                viewModel = billingViewModel
            )
        }

        composable(
            route = Screen.InvoiceDetail.route,
            arguments = listOf(navArgument("invoiceId") { type = NavType.StringType })
        ) { backStackEntry ->
            val invoiceId = backStackEntry.arguments?.getString("invoiceId") ?: ""
            InvoiceDetailScreen(
                invoiceId = invoiceId,
                onNavigateBack = { navController.popBackStack() },
                onPayInvoice = { id ->
                    navController.navigate(Screen.PaymentCheckout.createRoute(id))
                },
                onOpenReceipt = { paymentId ->
                    navController.navigate(Screen.ReceiptViewer.createRoute(paymentId))
                },
                viewModel = billingViewModel
            )
        }

        composable(
            route = Screen.PaymentCheckout.route,
            arguments = listOf(navArgument("invoiceId") { type = NavType.StringType })
        ) { backStackEntry ->
            val invoiceId = backStackEntry.arguments?.getString("invoiceId") ?: ""
            PaymentCheckoutScreen(
                invoiceId = invoiceId,
                onNavigateBack = { navController.popBackStack() },
                onOrderVerifiedOrUpdated = { paymentId ->
                    navController.navigate(Screen.PaymentStatus.createRoute(paymentId)) {
                        popUpTo(Screen.PaymentCheckout.route) { inclusive = true }
                    }
                },
                viewModel = billingViewModel
            )
        }

        composable(
            route = Screen.PaymentStatus.route,
            arguments = listOf(navArgument("paymentId") { type = NavType.StringType })
        ) { backStackEntry ->
            val paymentId = backStackEntry.arguments?.getString("paymentId") ?: ""
            PaymentStatusScreen(
                paymentId = paymentId,
                onNavigateBack = { navController.popBackStack() },
                onOpenReceipt = { id ->
                    navController.navigate(Screen.ReceiptViewer.createRoute(id))
                },
                onRetryInvoicePayment = { invoiceId ->
                    navController.navigate(Screen.PaymentCheckout.createRoute(invoiceId))
                },
                viewModel = billingViewModel
            )
        }

        composable(Screen.PaymentHistory.route) {
            PaymentHistoryScreen(
                onNavigateBack = { navController.popBackStack() },
                onOpenReceipt = { paymentId ->
                    navController.navigate(Screen.ReceiptViewer.createRoute(paymentId))
                },
                onOpenStatus = { paymentId ->
                    navController.navigate(Screen.PaymentStatus.createRoute(paymentId))
                },
                viewModel = billingViewModel
            )
        }

        composable(
            route = Screen.ReceiptViewer.route,
            arguments = listOf(navArgument("paymentId") { type = NavType.StringType })
        ) { backStackEntry ->
            val paymentId = backStackEntry.arguments?.getString("paymentId") ?: ""
            ReceiptViewerScreen(
                paymentId = paymentId,
                onNavigateBack = { navController.popBackStack() },
                viewModel = billingViewModel
            )
        }

        composable(Screen.AiHealthAssistant.route) {
            AiAssistantHubScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Notifications.route) {
            PatientNotificationsScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Profile.route) {
            val dashState by dashboardViewModel.uiState.collectAsState()
            ProfileScreen(
                userProfile = dashState.userProfile,
                selectedHospital = dashState.selectedHospital,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToHospitalSelection = {
                    navController.navigate(Screen.HospitalSelection.route)
                },
                onEditPatientDetails = {
                    patientDetailsViewModel.resetHydration()
                    navController.navigate(Screen.PatientDetails.createRoute(editMode = true))
                },
                onLogout = performSecureLogout
            )
        }

        composable(Screen.Settings.route) {
            SettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onLogout = performSecureLogout
            )
        }
    }
}
