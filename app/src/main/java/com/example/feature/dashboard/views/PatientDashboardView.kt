package com.example.feature.dashboard.views

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bloodtype
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Medication
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.core.designsystem.components.MediCoreCard
import com.example.core.designsystem.components.MediCoreStatusBadge
import com.example.core.model.DashboardSummary
import com.example.core.model.HealthKeyIndicator
import com.example.core.model.PatientHealthOverviewData
import com.example.core.model.PrescriptionAlertSummary
import com.example.core.model.UpcomingAppointmentSummary
import com.example.ui.theme.MediCoreBorder
import com.example.ui.theme.MediCoreError
import com.example.ui.theme.MediCorePrimary
import com.example.ui.theme.MediCorePrimaryDark
import com.example.ui.theme.MediCoreSecondary
import com.example.ui.theme.MediCoreSuccess
import com.example.ui.theme.MediCoreSurfaceSoft
import com.example.ui.theme.MediCoreSurfaceVariant
import com.example.ui.theme.MediCoreTextDark
import com.example.ui.theme.MediCoreTextMuted
import com.example.ui.theme.MediCoreWarning

enum class HealthOverviewFilter(val label: String, val tag: String) {
    ALL("All Overview", "health_overview_filter_all"),
    INDICATORS("Key Indicators", "health_overview_filter_indicators"),
    APPOINTMENTS("Appointments", "health_overview_filter_appointments"),
    PRESCRIPTIONS("Rx Alerts", "health_overview_filter_prescriptions")
}

@Composable
fun PatientDashboardView(
    summary: DashboardSummary,
    healthOverview: PatientHealthOverviewData = PatientHealthOverviewData(),
    onActionClick: (String) -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // AI Health Assistant Hero Banner
        Surface(
            color = MediCorePrimary,
            shape = RoundedCornerShape(18.dp),
            shadowElevation = 4.dp,
            modifier = Modifier
                .testTag("ai_assistant_hero_banner")
                .fillMaxWidth()
                .clickable { onActionClick("ai_assist") }
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(20.dp)
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(54.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.2f))
                ) {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        contentDescription = "AI Assistant",
                        tint = Color.White,
                        modifier = Modifier.size(30.dp)
                    )
                }

                Spacer(modifier = Modifier.width(16.dp))

                Column(
                    modifier = Modifier.weight(1f)
                ) {
                    Surface(
                        color = Color.White.copy(alpha = 0.2f),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = "MediCore AI Assistant",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Need symptoms guidance or prescription help?",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = "Ask our medical query assistant anytime 24/7",
                        fontSize = 12.sp,
                        color = Color.White.copy(alpha = 0.85f)
                    )
                }
            }
        }

        // Unified 'My Health Overview' Patient Component
        MyHealthOverviewComponent(
            overview = healthOverview,
            onActionClick = onActionClick
        )
    }
}

@Composable
fun MyHealthOverviewComponent(
    overview: PatientHealthOverviewData,
    onActionClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedFilter by remember { mutableStateOf(HealthOverviewFilter.ALL) }
    val filterScrollState = rememberScrollState()

    MediCoreCard(
        modifier = modifier
            .fillMaxWidth()
            .testTag("my_health_overview_card")
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Component Header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .size(42.dp)
                            .clip(CircleShape)
                            .background(MediCorePrimary.copy(alpha = 0.12f))
                    ) {
                        Icon(
                            imageVector = Icons.Default.MonitorHeart,
                            contentDescription = "My Health Overview",
                            tint = MediCorePrimary,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "My Health Overview",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = MediCoreTextDark
                        )
                        Text(
                            text = "Key indicators, upcoming visits & Rx alerts",
                            fontSize = 12.sp,
                            color = MediCoreTextMuted
                        )
                    }
                }

                Surface(
                    color = MediCoreSuccess.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, MediCoreSuccess.copy(alpha = 0.3f))
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = MediCoreSuccess,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = overview.overallStatusLabel,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = MediCoreSuccess
                        )
                    }
                }
            }

            // Interactive Section Filter Chips
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(filterScrollState)
            ) {
                HealthOverviewFilter.entries.forEach { filter ->
                    val isSelected = selectedFilter == filter
                    FilterChip(
                        selected = isSelected,
                        onClick = { selectedFilter = filter },
                        label = {
                            Text(
                                text = filter.label,
                                fontSize = 12.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MediCorePrimary,
                            selectedLabelColor = Color.White,
                            containerColor = MediCoreSurfaceSoft,
                            labelColor = MediCoreTextDark
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = isSelected,
                            borderColor = MediCoreBorder,
                            selectedBorderColor = MediCorePrimary
                        ),
                        modifier = Modifier
                            .testTag(filter.tag)
                            .minimumInteractiveComponentSize()
                    )
                }
            }

            // 1. KEY HEALTH INDICATORS SECTION
            AnimatedVisibility(
                visible = selectedFilter == HealthOverviewFilter.ALL || selectedFilter == HealthOverviewFilter.INDICATORS
            ) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("health_overview_indicators_section")
                ) {
                    OverviewSubHeader(
                        title = "Key Health Indicators",
                        actionLabel = "View EHR",
                        actionTag = "health_overview_view_ehr_button",
                        onActionClick = { onActionClick("view_ehr") }
                    )

                    val indicators = overview.keyIndicators
                    if (indicators.isNotEmpty()) {
                        val rows = indicators.chunked(2)
                        rows.forEach { pair ->
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                pair.forEach { indicator ->
                                    HealthIndicatorTile(
                                        indicator = indicator,
                                        onClick = { onActionClick("view_ehr") },
                                        modifier = Modifier
                                            .weight(1f)
                                            .testTag("health_indicator_${indicator.id}")
                                    )
                                }
                                if (pair.size == 1) {
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }

            if (selectedFilter == HealthOverviewFilter.ALL) {
                HorizontalDivider(color = MediCoreBorder.copy(alpha = 0.6f))
            }

            // 2. UPCOMING APPOINTMENT SUMMARIES SECTION
            AnimatedVisibility(
                visible = selectedFilter == HealthOverviewFilter.ALL || selectedFilter == HealthOverviewFilter.APPOINTMENTS
            ) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("health_overview_appointments_section")
                ) {
                    OverviewSubHeader(
                        title = "Upcoming Appointments (${overview.upcomingAppointments.size})",
                        actionLabel = "Book / Manage",
                        actionTag = "health_overview_book_appointment_button",
                        onActionClick = { onActionClick("book_app") }
                    )

                    overview.upcomingAppointments.forEach { appointment ->
                        UpcomingAppointmentOverviewRow(
                            appointment = appointment,
                            onClick = { onActionClick("book_app") }
                        )
                    }
                }
            }

            if (selectedFilter == HealthOverviewFilter.ALL) {
                HorizontalDivider(color = MediCoreBorder.copy(alpha = 0.6f))
            }

            // 3. RECENT PRESCRIPTION ALERTS SECTION
            AnimatedVisibility(
                visible = selectedFilter == HealthOverviewFilter.ALL || selectedFilter == HealthOverviewFilter.PRESCRIPTIONS
            ) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("health_overview_prescriptions_section")
                ) {
                    OverviewSubHeader(
                        title = "Recent Prescription Alerts (${overview.prescriptionAlerts.size})",
                        actionLabel = "Prescriptions",
                        actionTag = "health_overview_view_prescriptions_button",
                        onActionClick = { onActionClick("prescriptions") }
                    )

                    overview.prescriptionAlerts.forEach { alert ->
                        PrescriptionAlertOverviewRow(
                            alert = alert,
                            onClick = { onActionClick("prescriptions") }
                        )
                    }

                    OutlinedButton(
                        onClick = { onActionClick("medications") },
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, MediCoreSecondary.copy(alpha = 0.45f)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("health_overview_dose_reminders_button")
                            .minimumInteractiveComponentSize()
                    ) {
                        Icon(
                            imageVector = Icons.Default.Schedule,
                            contentDescription = null,
                            tint = MediCoreSecondary,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Medication Schedule & Dose Reminders",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MediCoreSecondary
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OverviewSubHeader(
    title: String,
    actionLabel: String,
    actionTag: String,
    onActionClick: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            text = title,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = MediCoreTextDark
        )
        TextButton(
            onClick = onActionClick,
            modifier = Modifier
                .testTag(actionTag)
                .minimumInteractiveComponentSize()
        ) {
            Text(
                text = actionLabel,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = MediCorePrimary
            )
            Spacer(modifier = Modifier.width(4.dp))
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = actionLabel,
                tint = MediCorePrimary,
                modifier = Modifier.size(14.dp)
            )
        }
    }
}

@Composable
private fun HealthIndicatorTile(
    indicator: HealthKeyIndicator,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val accentColor = when {
        !indicator.isNormal -> MediCoreWarning
        indicator.id == "bp" -> MediCorePrimary
        indicator.id == "pulse" -> MediCoreSecondary
        indicator.id == "spo2_bmi" -> MediCoreSuccess
        else -> MediCorePrimaryDark
    }

    Surface(
        color = MediCoreSurfaceSoft,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, MediCoreBorder),
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(accentColor.copy(alpha = 0.14f))
                ) {
                    Icon(
                        imageVector = getIndicatorIcon(indicator.iconName),
                        contentDescription = indicator.label,
                        tint = accentColor,
                        modifier = Modifier.size(18.dp)
                    )
                }

                Surface(
                    color = accentColor.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = indicator.statusLabel,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = accentColor,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = indicator.label,
                fontSize = 11.sp,
                color = MediCoreTextMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = indicator.value,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = MediCoreTextDark,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = indicator.referenceText,
                fontSize = 10.sp,
                color = MediCoreTextMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun UpcomingAppointmentOverviewRow(
    appointment: UpcomingAppointmentSummary,
    onClick: () -> Unit
) {
    Surface(
        color = MediCoreSurfaceSoft,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, MediCoreBorder),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("overview_appointment_${appointment.id}")
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(MediCorePrimary.copy(alpha = 0.12f))
                    ) {
                        Icon(
                            imageVector = Icons.Default.EventAvailable,
                            contentDescription = "Upcoming appointment",
                            tint = MediCorePrimary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = appointment.doctorName,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = MediCoreTextDark
                        )
                        Text(
                            text = appointment.department,
                            fontSize = 12.sp,
                            color = MediCoreSecondary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                MediCoreStatusBadge(
                    label = appointment.status,
                    statusType = appointment.status
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = Icons.Default.LocalHospital,
                        contentDescription = null,
                        tint = MediCoreTextMuted,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = appointment.hospitalName,
                        fontSize = 11.sp,
                        color = MediCoreTextMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Spacer(modifier = Modifier.width(8.dp))

                Surface(
                    color = MediCoreSurfaceVariant,
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.AccessTime,
                            contentDescription = null,
                            tint = MediCorePrimaryDark,
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "${appointment.appointmentDate} • ${appointment.slotTime} (Token #${appointment.queueToken})",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MediCorePrimaryDark
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PrescriptionAlertOverviewRow(
    alert: PrescriptionAlertSummary,
    onClick: () -> Unit
) {
    val badgeColor = if (alert.isUrgent) MediCoreError else MediCoreSecondary

    Surface(
        color = MediCoreSurfaceSoft,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(
            width = 1.dp,
            color = if (alert.isUrgent) MediCoreError.copy(alpha = 0.3f) else MediCoreBorder
        ),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("overview_rx_alert_${alert.id}")
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
    ) {
        Row(
            verticalAlignment = Alignment.Top,
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(badgeColor.copy(alpha = 0.12f))
            ) {
                Icon(
                    imageVector = if (alert.isUrgent) Icons.Default.NotificationsActive else Icons.Default.Medication,
                    contentDescription = alert.alertTitle,
                    tint = badgeColor,
                    modifier = Modifier.size(18.dp)
                )
            }

            Spacer(modifier = Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = alert.medicineName,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MediCoreTextDark,
                        modifier = Modifier.weight(1f)
                    )
                    Surface(
                        color = badgeColor.copy(alpha = 0.12f),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = alert.alertBadge,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = badgeColor,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(3.dp))

                Text(
                    text = alert.alertTitle,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (alert.isUrgent) MediCoreError else MediCorePrimaryDark
                )

                Spacer(modifier = Modifier.height(2.dp))

                Text(
                    text = "${alert.dosageAndFrequency} • ${alert.prescribedBy}",
                    fontSize = 11.sp,
                    color = MediCoreTextMuted
                )
            }
        }
    }
}

private fun getIndicatorIcon(iconName: String): ImageVector {
    return when (iconName) {
        "MonitorHeart" -> Icons.Default.MonitorHeart
        "Favorite" -> Icons.Default.Favorite
        "HealthAndSafety" -> Icons.Default.HealthAndSafety
        "Bloodtype" -> Icons.Default.Bloodtype
        "Description" -> Icons.Default.Description
        else -> Icons.Default.Person
    }
}

