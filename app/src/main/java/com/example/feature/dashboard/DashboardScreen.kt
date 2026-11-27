package com.example.feature.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Biotech
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Domain
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Medication
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.core.designsystem.components.HospitalBadge
import com.example.core.designsystem.components.MediCoreCard
import com.example.feature.dashboard.views.PatientDashboardView
import com.example.ui.theme.MediCoreBorder
import com.example.ui.theme.MediCorePrimary
import com.example.ui.theme.MediCorePrimaryDark
import com.example.ui.theme.MediCoreSurface
import com.example.ui.theme.MediCoreSurfaceVariant
import com.example.ui.theme.MediCoreTextDark
import com.example.ui.theme.MediCoreTextMuted

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    onNavigateToHospitalSelection: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToHospitals: () -> Unit,
    onNavigateToDoctors: () -> Unit,
    onNavigateToAppointments: () -> Unit,
    onNavigateToMedicalRecords: () -> Unit,
    onNavigateToPrescriptions: () -> Unit,
    onNavigateToMedications: () -> Unit = {},
    onNavigateToLabReports: () -> Unit,
    onNavigateToPayments: () -> Unit,
    onNavigateToAiHealthAssistant: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    var selectedBottomNavIndex by remember { mutableIntStateOf(0) }
    var showLogoutConfirmDialog by remember { mutableStateOf(false) }

    fun handleAction(actionId: String) {
        when (actionId) {
            "find_hospitals" -> onNavigateToHospitals()
            "find_doctors" -> onNavigateToDoctors()
            "book_app" -> onNavigateToAppointments()
            "view_ehr" -> onNavigateToMedicalRecords()
            "prescriptions" -> onNavigateToPrescriptions()
            "medications" -> onNavigateToMedications()
            "lab_reports" -> onNavigateToLabReports()
            "billing" -> onNavigateToPayments()
            "ai_assist" -> onNavigateToAiHealthAssistant()
            else -> onNavigateToHospitals()
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MediCoreSurface)
                    .padding(horizontal = 16.dp, vertical = 10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = uiState.dashboardSummary.welcomeTitle,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = MediCoreTextDark,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        HospitalBadge(
                            hospitalName = uiState.selectedHospital.name,
                            cityName = uiState.selectedHospital.city,
                            onClick = onNavigateToHospitalSelection
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        IconButton(
                            onClick = onNavigateToNotifications,
                            modifier = Modifier.testTag("notification_button")
                        ) {
                            BadgedBox(badge = { Badge(containerColor = MediCorePrimary) { Text("2") } }) {
                                Icon(
                                    imageVector = Icons.Default.Notifications,
                                    contentDescription = "Notifications",
                                    tint = MediCorePrimary
                                )
                            }
                        }

                        IconButton(
                            onClick = onNavigateToSettings,
                            modifier = Modifier.testTag("settings_button")
                        ) {
                            Icon(
                                imageVector = Icons.Default.Settings,
                                contentDescription = "Settings",
                                tint = MediCorePrimary
                            )
                        }

                        IconButton(
                            onClick = onNavigateToProfile,
                            modifier = Modifier.testTag("profile_button")
                        ) {
                            Icon(
                                imageVector = Icons.Default.AccountCircle,
                                contentDescription = "Profile",
                                tint = MediCorePrimary,
                                modifier = Modifier.size(30.dp)
                            )
                        }

                        IconButton(
                            onClick = { showLogoutConfirmDialog = true },
                            modifier = Modifier.testTag("logout_icon_button")
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.Logout,
                                contentDescription = "Sign Out",
                                tint = MediCorePrimary,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }
                }
            }
        },
        bottomBar = {
            val navItems = listOf(
                BottomNavItem("Home", Icons.Default.Home),
                BottomNavItem("Hospitals", Icons.Default.Domain),
                BottomNavItem("Appointments", Icons.Default.EventAvailable),
                BottomNavItem("Records", Icons.Default.Description),
                BottomNavItem("Profile", Icons.Default.Person)
            )
            NavigationBar(
                containerColor = MediCoreSurface,
                tonalElevation = 4.dp,
                modifier = Modifier.testTag("dashboard_bottom_nav")
            ) {
                navItems.forEachIndexed { index, item ->
                    NavigationBarItem(
                        selected = selectedBottomNavIndex == index,
                        onClick = {
                            selectedBottomNavIndex = index
                            when (item.label) {
                                "Hospitals" -> onNavigateToHospitals()
                                "Appointments" -> onNavigateToAppointments()
                                "Records" -> onNavigateToMedicalRecords()
                                "Profile" -> onNavigateToProfile()
                            }
                        },
                        icon = { Icon(item.icon, contentDescription = item.label) },
                        label = { Text(item.label, fontSize = 11.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MediCorePrimary,
                            selectedTextColor = MediCorePrimaryDark,
                            indicatorColor = MediCoreSurfaceVariant,
                            unselectedIconColor = MediCoreTextMuted,
                            unselectedTextColor = MediCoreTextMuted
                        )
                    )
                }
            }
        },
        modifier = modifier.testTag("dashboard_screen")
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Patient Dashboard Health Summary & AI Banner
            item {
                PatientDashboardView(
                    summary = uiState.dashboardSummary,
                    healthOverview = uiState.healthOverview,
                    onActionClick = { handleAction(it) }
                )
            }

            // Patient Health Services Grid
            item {
                Text(
                    text = "Patient Health Services",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = MediCoreTextDark
                )
            }

            // Grid of Patient Services
            val actions = uiState.dashboardSummary.quickActions
            val chunkedActions = actions.chunked(4)
            items(chunkedActions.size) { chunkIndex ->
                val chunk = chunkedActions[chunkIndex]
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    chunk.forEach { action ->
                        MediCoreCard(
                            onClick = { handleAction(action.id) },
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier
                                    .padding(12.dp)
                                    .fillMaxWidth()
                            ) {
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier
                                        .size(42.dp)
                                        .clip(CircleShape)
                                        .background(MediCoreSurfaceVariant)
                                        .border(1.dp, MediCoreBorder, CircleShape)
                                ) {
                                    Icon(
                                        imageVector = getPatientActionIcon(action.iconName),
                                        contentDescription = action.label,
                                        tint = MediCorePrimary,
                                        modifier = Modifier.size(22.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = action.label,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MediCoreTextDark,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                    // Fill remaining slots in row if less than 4
                    repeat(4 - chunk.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }

    if (showLogoutConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutConfirmDialog = false },
            title = {
                Text(
                    text = "Sign Out Confirmation",
                    fontWeight = FontWeight.Bold,
                    color = MediCoreTextDark
                )
            },
            text = {
                Text(
                    text = "Are you sure you want to log out of your MediCore patient portal?",
                    color = MediCoreTextMuted
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showLogoutConfirmDialog = false
                        onLogout()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = com.example.ui.theme.MediCoreError)
                ) {
                    Text("Log Out", color = Color.White, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutConfirmDialog = false }) {
                    Text("Cancel", color = MediCoreTextDark)
                }
            }
        )
    }
}

data class BottomNavItem(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

fun getPatientActionIcon(iconName: String): androidx.compose.ui.graphics.vector.ImageVector {
    return when (iconName) {
        "Domain" -> Icons.Default.Domain
        "Person", "Doctor" -> Icons.Default.Person
        "EventAvailable", "Event" -> Icons.Default.EventAvailable
        "Description" -> Icons.Default.Description
        "Medication" -> Icons.Default.Medication
        "Biotech" -> Icons.Default.Biotech
        "Payments" -> Icons.Default.Payments
        "AutoAwesome" -> Icons.Default.AutoAwesome
        "Notifications" -> Icons.Default.Notifications
        else -> Icons.Default.Home
    }
}
