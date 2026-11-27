package com.example.feature.auth

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.MarkEmailRead
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Pin
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.core.designsystem.components.MediCoreButtonLoader
import com.example.core.designsystem.components.MediCoreCard
import com.example.ui.theme.MediCoreBackground
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

data class AuthenticatedUserMeta(
    val userId: String? = null,
    val fullName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val onboardingCompleted: Boolean = false
)

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onLoginSuccess: (AuthenticatedUserMeta) -> Unit,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    BackHandler(enabled = uiState.step == OtpLoginStep.VERIFY_OTP) {
        viewModel.editIdentifier()
    }

    Scaffold(
        modifier = modifier
            .testTag("login_screen")
            .fillMaxSize(),
        containerColor = MediCoreBackground,
        contentWindowInsets = WindowInsets.safeDrawing
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(12.dp))

            // Brand Emblem
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(72.dp)
                    .clip(CircleShape)
                    .background(MediCorePrimary.copy(alpha = 0.12f))
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(54.dp)
                        .clip(CircleShape)
                        .background(MediCorePrimary)
                ) {
                    Icon(
                        imageVector = Icons.Default.HealthAndSafety,
                        contentDescription = "MediCore Patient Portal",
                        tint = Color.White,
                        modifier = Modifier.size(30.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            Text(
                text = if (uiState.step == OtpLoginStep.ENTER_IDENTIFIER) {
                    "Patient OTP Sign In"
                } else {
                    "Verify 6-Digit OTP"
                },
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = MediCoreTextDark,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = if (uiState.step == OtpLoginStep.ENTER_IDENTIFIER) {
                    "Sign in securely using only your phone number or email with a one-time verification code."
                } else {
                    "Enter the 6-digit code sent to ${uiState.maskedDestination}"
                },
                fontSize = 13.sp,
                color = MediCoreTextMuted,
                textAlign = TextAlign.Center,
                lineHeight = 19.sp
            )

            Spacer(modifier = Modifier.height(24.dp))

            MediCoreCard(
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp)
                ) {
                    // Phone vs Email OTP Channel Selector (Always visible on Step 1)
                    if (uiState.step == OtpLoginStep.ENTER_IDENTIFIER) {
                        Text(
                            text = "Choose OTP Login Method",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MediCoreTextMuted
                        )
                        Spacer(modifier = Modifier.height(10.dp))

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            OtpChannelTab(
                                label = "Phone Number",
                                icon = Icons.Default.Phone,
                                selected = uiState.selectedChannel == OtpChannel.PHONE,
                                onClick = { viewModel.onChannelSelected(OtpChannel.PHONE) },
                                modifier = Modifier
                                    .weight(1f)
                                    .testTag("otp_channel_phone")
                            )
                            OtpChannelTab(
                                label = "Email",
                                icon = Icons.Default.Email,
                                selected = uiState.selectedChannel == OtpChannel.EMAIL,
                                onClick = { viewModel.onChannelSelected(OtpChannel.EMAIL) },
                                modifier = Modifier
                                    .weight(1f)
                                    .testTag("otp_channel_email")
                            )
                        }

                        Spacer(modifier = Modifier.height(20.dp))
                    }

                    // Error Banner
                    AnimatedVisibility(visible = uiState.errorMessage != null) {
                        Surface(
                            color = MediCoreError.copy(alpha = 0.1f),
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, MediCoreError.copy(alpha = 0.3f)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 14.dp)
                                .testTag("login_error_banner")
                        ) {
                            Text(
                                text = uiState.errorMessage.orEmpty(),
                                color = MediCoreError,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    }

                    AnimatedContent(
                        targetState = uiState.step,
                        transitionSpec = { fadeIn() togetherWith fadeOut() },
                        label = "otp_login_step"
                    ) { step ->
                        if (step == OtpLoginStep.ENTER_IDENTIFIER) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                val isPhone = uiState.selectedChannel == OtpChannel.PHONE
                                Text(
                                    text = if (isPhone) "Mobile Number *" else "Email Address *",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MediCoreTextDark
                                )
                                Spacer(modifier = Modifier.height(6.dp))

                                OutlinedTextField(
                                    value = if (isPhone) uiState.phoneInput else uiState.emailInput,
                                    onValueChange = {
                                        if (isPhone) {
                                            viewModel.onPhoneInputChanged(it)
                                        } else {
                                            viewModel.onEmailInputChanged(it)
                                        }
                                    },
                                    placeholder = {
                                        Text(
                                            text = if (isPhone) "+91 98765 43210" else "aarav.kumar@example.com",
                                            fontSize = 14.sp,
                                            color = MediCoreTextMuted
                                        )
                                    },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = if (isPhone) Icons.Default.Phone else Icons.Default.Email,
                                            contentDescription = if (isPhone) "Mobile number" else "Email address",
                                            tint = MediCorePrimary
                                        )
                                    },
                                    keyboardOptions = KeyboardOptions(
                                        keyboardType = if (isPhone) KeyboardType.Phone else KeyboardType.Email
                                    ),
                                    singleLine = true,
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = MediCorePrimary,
                                        unfocusedBorderColor = MediCoreBorder
                                    ),
                                    modifier = Modifier
                                        .testTag(if (isPhone) "login_phone_input" else "login_email_input")
                                        .fillMaxWidth()
                                )

                                Spacer(modifier = Modifier.height(10.dp))

                                Text(
                                    text = if (isPhone) {
                                        "We will send a one-time 6-digit SMS verification code to this number."
                                    } else {
                                        "We will send a one-time 6-digit verification code to this email inbox."
                                    },
                                    fontSize = 12.sp,
                                    color = MediCoreTextMuted
                                )

                                Spacer(modifier = Modifier.height(22.dp))

                                Button(
                                    onClick = { viewModel.requestOtp(context) },
                                    enabled = !uiState.isLoading,
                                    colors = ButtonDefaults.buttonColors(containerColor = MediCorePrimary),
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier
                                        .testTag("login_send_otp_button")
                                        .fillMaxWidth()
                                        .height(52.dp)
                                ) {
                                    if (uiState.isLoading) {
                                        MediCoreButtonLoader(lineColor = Color.White)
                                    } else {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(
                                                text = "Send OTP",
                                                fontSize = 16.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Icon(
                                                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                                contentDescription = null,
                                                modifier = Modifier.size(18.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        } else {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                // Destination summary chip with Edit action
                                Surface(
                                    color = MediCoreSurfaceSoft,
                                    shape = RoundedCornerShape(12.dp),
                                    border = BorderStroke(1.dp, MediCoreBorder),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 12.dp, vertical = 10.dp)
                                    ) {
                                        Icon(
                                            imageVector = if (uiState.selectedChannel == OtpChannel.PHONE) {
                                                Icons.Default.Sms
                                            } else {
                                                Icons.Default.MarkEmailRead
                                            },
                                            contentDescription = "OTP destination",
                                            tint = MediCorePrimary,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.width(10.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = if (uiState.selectedChannel == OtpChannel.PHONE) {
                                                    "SMS OTP sent to"
                                                } else {
                                                    "Email OTP sent to"
                                                },
                                                fontSize = 11.sp,
                                                color = MediCoreTextMuted
                                            )
                                            Text(
                                                text = uiState.maskedDestination.ifBlank { uiState.activeIdentifier },
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = MediCoreTextDark
                                            )
                                        }
                                        TextButton(
                                            onClick = { viewModel.editIdentifier() },
                                            modifier = Modifier
                                                .testTag("otp_change_identifier_button")
                                                .minimumInteractiveComponentSize()
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Edit,
                                                contentDescription = "Change contact",
                                                tint = MediCorePrimary,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(
                                                text = "Change",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = MediCorePrimary
                                            )
                                        }
                                    }
                                }

                                // Offline Preview Code Notice (shown only when backend server is unreachable in preview)
                                if (uiState.isOfflinePreviewMode && !uiState.offlinePreviewOtpCode.isNullOrBlank()) {
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Surface(
                                        color = MediCoreSurfaceVariant,
                                        shape = RoundedCornerShape(10.dp),
                                        border = BorderStroke(1.dp, MediCorePrimary.copy(alpha = 0.3f)),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .testTag("otp_offline_preview_banner")
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.padding(12.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Pin,
                                                contentDescription = null,
                                                tint = MediCorePrimaryDark,
                                                modifier = Modifier.size(18.dp)
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(
                                                text = "Preview OTP code: ${uiState.offlinePreviewOtpCode} (expires in 5 min)",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = MediCorePrimaryDark
                                            )
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(16.dp))

                                Text(
                                    text = "6-Digit Verification Code *",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MediCoreTextDark
                                )
                                Spacer(modifier = Modifier.height(6.dp))

                                OutlinedTextField(
                                    value = uiState.otpCode,
                                    onValueChange = { viewModel.onOtpCodeChanged(it) },
                                    placeholder = {
                                        Text(
                                            text = "Enter 6-digit OTP",
                                            fontSize = 14.sp,
                                            color = MediCoreTextMuted
                                        )
                                    },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Default.Pin,
                                            contentDescription = "One-time passcode",
                                            tint = MediCorePrimary
                                        )
                                    },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    singleLine = true,
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = MediCorePrimary,
                                        unfocusedBorderColor = MediCoreBorder
                                    ),
                                    modifier = Modifier
                                        .testTag("login_otp_input")
                                        .fillMaxWidth()
                                )

                                Spacer(modifier = Modifier.height(10.dp))

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = if (uiState.resendCooldownSeconds > 0) {
                                            "Resend available in ${uiState.resendCooldownSeconds}s"
                                        } else {
                                            "Didn't receive your code?"
                                        },
                                        fontSize = 12.sp,
                                        color = MediCoreTextMuted
                                    )

                                    TextButton(
                                        onClick = { viewModel.requestOtp(context) },
                                        enabled = uiState.resendCooldownSeconds == 0 && !uiState.isLoading,
                                        modifier = Modifier
                                            .testTag("login_resend_otp_button")
                                            .minimumInteractiveComponentSize()
                                    ) {
                                        Text(
                                            text = "Resend OTP",
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (uiState.resendCooldownSeconds == 0) {
                                                MediCoreSecondary
                                            } else {
                                                MediCoreTextMuted
                                            }
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(18.dp))

                                Button(
                                    onClick = {
                                        viewModel.verifyOtp(
                                            context = context,
                                            onLoginSuccess = onLoginSuccess
                                        )
                                    },
                                    enabled = !uiState.isLoading && uiState.otpCode.length == 6,
                                    colors = ButtonDefaults.buttonColors(containerColor = MediCorePrimary),
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier
                                        .testTag("login_verify_otp_button")
                                        .fillMaxWidth()
                                        .height(52.dp)
                                ) {
                                    if (uiState.isLoading) {
                                        MediCoreButtonLoader(lineColor = Color.White)
                                    } else {
                                        Text(
                                            text = "Verify & Sign In",
                                            fontSize = 16.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Security & New Patient Info Banner
            Surface(
                color = MediCoreSuccess.copy(alpha = 0.08f),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, MediCoreSuccess.copy(alpha = 0.25f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(14.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.VerifiedUser,
                        contentDescription = "OTP security",
                        tint = MediCoreSuccess,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Passwordless OTP authentication for patients only. New patients will be guided to complete their personal & emergency details right after verification.",
                        fontSize = 12.sp,
                        color = MediCoreTextDark,
                        lineHeight = 17.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun OtpChannelTab(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        color = if (selected) MediCorePrimary else MediCoreSurfaceSoft,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, if (selected) MediCorePrimary else MediCoreBorder),
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .minimumInteractiveComponentSize()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (selected) Color.White else MediCoreTextMuted,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = label,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = if (selected) Color.White else MediCoreTextDark
            )
        }
    }
}
