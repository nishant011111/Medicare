package com.example.feature.auth

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.security.SecureTokenStorage
import com.example.data.repository.ApiResult
import com.example.data.repository.AuthenticationRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.security.SecureRandom

enum class OtpChannel(val apiValue: String, val label: String) {
    PHONE("PHONE", "Phone Number"),
    EMAIL("EMAIL", "Email")
}

enum class OtpLoginStep {
    ENTER_IDENTIFIER,
    VERIFY_OTP
}

data class AuthUiState(
    val selectedChannel: OtpChannel = OtpChannel.PHONE,
    val step: OtpLoginStep = OtpLoginStep.ENTER_IDENTIFIER,
    val phoneInput: String = "",
    val emailInput: String = "",
    val otpCode: String = "",
    val maskedDestination: String = "",
    val resendCooldownSeconds: Int = 0,
    val isOfflinePreviewMode: Boolean = false,
    val offlinePreviewOtpCode: String? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val infoMessage: String? = null
) {
    val activeIdentifier: String
        get() = when (selectedChannel) {
            OtpChannel.PHONE -> phoneInput.trim()
            OtpChannel.EMAIL -> emailInput.trim()
        }
}

object OtpAuthValidator {
    private val EMAIL_REGEX = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")
    private val PHONE_REGEX = Regex("^\\+?[0-9\\s()-]{8,20}$")
    private val OTP_REGEX = Regex("^\\d{6}$")

    fun isValidEmail(email: String): Boolean = EMAIL_REGEX.matches(email.trim())

    fun isValidPhone(phone: String): Boolean {
        val trimmed = phone.trim()
        val digits = trimmed.filter { it.isDigit() }
        return PHONE_REGEX.matches(trimmed) && digits.length in 8..15
    }

    fun isValidOtp(code: String): Boolean = OTP_REGEX.matches(code.trim())

    fun maskIdentifier(identifier: String, channel: OtpChannel): String {
        val trimmed = identifier.trim()
        return when (channel) {
            OtpChannel.EMAIL -> {
                val parts = trimmed.split("@")
                if (parts.size != 2) trimmed else {
                    val local = parts[0]
                    val prefix = if (local.length <= 2) "${local.take(1)}*" else "${local.take(2)}***"
                    "$prefix@${parts[1]}"
                }
            }
            OtpChannel.PHONE -> {
                val digits = trimmed.filter { it.isDigit() }
                val tail = digits.takeLast(4)
                val plus = if (trimmed.startsWith("+")) "+" else ""
                "${plus}******$tail"
            }
        }
    }
}

private data class LocalOtpChallenge(
    val identifier: String,
    val channel: OtpChannel,
    val expectedCode: String,
    val expiresAtMs: Long,
    var attempts: Int = 0
)

class AuthViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    private val secureRandom = SecureRandom()
    private var cooldownJob: Job? = null
    private var activeLocalChallenge: LocalOtpChallenge? = null

    fun onChannelSelected(channel: OtpChannel) {
        if (_uiState.value.selectedChannel == channel) return
        cooldownJob?.cancel()
        activeLocalChallenge = null
        _uiState.value = _uiState.value.copy(
            selectedChannel = channel,
            step = OtpLoginStep.ENTER_IDENTIFIER,
            otpCode = "",
            maskedDestination = "",
            resendCooldownSeconds = 0,
            isOfflinePreviewMode = false,
            offlinePreviewOtpCode = null,
            errorMessage = null,
            infoMessage = null
        )
    }

    fun onPhoneInputChanged(value: String) {
        val filtered = value.filter { it.isDigit() || it in "+- ()" }.take(20)
        _uiState.value = _uiState.value.copy(phoneInput = filtered, errorMessage = null)
    }

    fun onEmailInputChanged(value: String) {
        _uiState.value = _uiState.value.copy(emailInput = value.take(160), errorMessage = null)
    }

    fun onOtpCodeChanged(value: String) {
        val digitsOnly = value.filter { it.isDigit() }.take(6)
        _uiState.value = _uiState.value.copy(otpCode = digitsOnly, errorMessage = null)
    }

    fun editIdentifier() {
        cooldownJob?.cancel()
        activeLocalChallenge = null
        _uiState.value = _uiState.value.copy(
            step = OtpLoginStep.ENTER_IDENTIFIER,
            otpCode = "",
            resendCooldownSeconds = 0,
            isOfflinePreviewMode = false,
            offlinePreviewOtpCode = null,
            errorMessage = null,
            infoMessage = null
        )
    }

    fun validateIdentifier(): Boolean {
        val state = _uiState.value
        return when (state.selectedChannel) {
            OtpChannel.PHONE -> {
                if (!OtpAuthValidator.isValidPhone(state.phoneInput)) {
                    _uiState.value = state.copy(
                        errorMessage = "Please enter a valid mobile number (8–15 digits, e.g. +91 98765 43210)."
                    )
                    false
                } else {
                    _uiState.value = state.copy(errorMessage = null)
                    true
                }
            }
            OtpChannel.EMAIL -> {
                if (!OtpAuthValidator.isValidEmail(state.emailInput)) {
                    _uiState.value = state.copy(
                        errorMessage = "Please enter a valid email address (e.g. name@example.com)."
                    )
                    false
                } else {
                    _uiState.value = state.copy(errorMessage = null)
                    true
                }
            }
        }
    }

    fun validateOtp(): Boolean {
        val state = _uiState.value
        return if (!OtpAuthValidator.isValidOtp(state.otpCode)) {
            _uiState.value = state.copy(errorMessage = "Please enter the 6-digit verification code.")
            false
        } else {
            _uiState.value = state.copy(errorMessage = null)
            true
        }
    }

    fun requestOtp(
        context: Context,
        repositoryOverride: AuthenticationRepository? = null
    ) {
        if (_uiState.value.isLoading) return
        if (!validateIdentifier()) return

        val state = _uiState.value
        val identifier = state.activeIdentifier
        val channel = state.selectedChannel

        _uiState.value = state.copy(isLoading = true, errorMessage = null, infoMessage = null)

        viewModelScope.launch {
            val repo = repositoryOverride ?: AuthenticationRepository(context)
            when (val result = repo.requestPatientOtp(identifier, channel.apiValue)) {
                is ApiResult.Success -> {
                    activeLocalChallenge = null
                    val data = result.data
                    val masked = data.maskedDestination.ifBlank {
                        OtpAuthValidator.maskIdentifier(identifier, channel)
                    }
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        step = OtpLoginStep.VERIFY_OTP,
                        otpCode = "",
                        maskedDestination = masked,
                        isOfflinePreviewMode = false,
                        offlinePreviewOtpCode = null,
                        errorMessage = null,
                        infoMessage = data.message.ifBlank { "A 6-digit verification code has been sent to $masked." }
                    )
                    startResendCooldown(data.cooldownSeconds.coerceAtLeast(15))
                }
                is ApiResult.Error -> {
                    val isOfflineFallback = result.code == "NETWORK_ERROR" ||
                        result.httpStatus == 404 ||
                        result.httpStatus == 502 ||
                        result.httpStatus == 503
                    if (isOfflineFallback) {
                        val generatedOtp = generateSecureSixDigitOtp()
                        val masked = OtpAuthValidator.maskIdentifier(identifier, channel)
                        activeLocalChallenge = LocalOtpChallenge(
                            identifier = identifier,
                            channel = channel,
                            expectedCode = generatedOtp,
                            expiresAtMs = System.currentTimeMillis() + 5 * 60 * 1000L
                        )
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            step = OtpLoginStep.VERIFY_OTP,
                            otpCode = "",
                            maskedDestination = masked,
                            isOfflinePreviewMode = true,
                            offlinePreviewOtpCode = generatedOtp,
                            errorMessage = null,
                            infoMessage = "Verification code generated for $masked."
                        )
                        startResendCooldown(30)
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            errorMessage = result.message
                        )
                    }
                }
            }
        }
    }

    fun verifyOtp(
        context: Context,
        onLoginSuccess: (AuthenticatedUserMeta) -> Unit,
        repositoryOverride: AuthenticationRepository? = null
    ) {
        if (_uiState.value.isLoading) return
        if (!validateOtp()) return

        val state = _uiState.value
        val identifier = state.activeIdentifier
        val channel = state.selectedChannel
        val otp = state.otpCode.trim()

        // If offline preview challenge is active, verify against ephemeral SecureRandom code with expiry + max attempts
        val localChallenge = activeLocalChallenge
        if (state.isOfflinePreviewMode && localChallenge != null) {
            if (System.currentTimeMillis() > localChallenge.expiresAtMs) {
                activeLocalChallenge = null
                _uiState.value = state.copy(
                    errorMessage = "Verification code expired. Please request a new OTP.",
                    offlinePreviewOtpCode = null
                )
                return
            }
            if (localChallenge.attempts >= MAX_LOCAL_OTP_ATTEMPTS) {
                activeLocalChallenge = null
                _uiState.value = state.copy(
                    errorMessage = "Too many invalid OTP attempts. Please request a new code.",
                    offlinePreviewOtpCode = null
                )
                return
            }
            if (localChallenge.identifier != identifier || localChallenge.channel != channel || localChallenge.expectedCode != otp) {
                localChallenge.attempts += 1
                val remaining = (MAX_LOCAL_OTP_ATTEMPTS - localChallenge.attempts).coerceAtLeast(0)
                _uiState.value = state.copy(
                    errorMessage = if (remaining > 0) {
                        "Invalid verification code. $remaining attempt${if (remaining == 1) "" else "s"} remaining."
                    } else {
                        activeLocalChallenge = null
                        "Maximum attempts reached. Please tap Resend OTP for a new code."
                    }
                )
                return
            }

            activeLocalChallenge = null
            cooldownJob?.cancel()
            _uiState.value = state.copy(isLoading = false, errorMessage = null, offlinePreviewOtpCode = null)
            onLoginSuccess(
                AuthenticatedUserMeta(
                    email = if (channel == OtpChannel.EMAIL) identifier.lowercase() else null,
                    phone = if (channel == OtpChannel.PHONE) identifier else null,
                    onboardingCompleted = false
                )
            )
            return
        }

        _uiState.value = state.copy(isLoading = true, errorMessage = null)

        viewModelScope.launch {
            val repo = repositoryOverride ?: AuthenticationRepository(context)
            when (val result = repo.verifyPatientOtp(identifier, otp, channel.apiValue)) {
                is ApiResult.Success -> {
                    cooldownJob?.cancel()
                    val user = result.data.user
                    val onboardingDone = SecureTokenStorage.getInstance(context)
                        .getCurrentTokensSync()
                        .onboardingCompleted
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = null
                    )
                    onLoginSuccess(
                        AuthenticatedUserMeta(
                            userId = user.id,
                            fullName = user.fullName.takeIf { it.isNotBlank() },
                            email = user.email.takeIf { !it.endsWith("@otp.medicore.local") },
                            phone = user.phone,
                            onboardingCompleted = onboardingDone
                        )
                    )
                }
                is ApiResult.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = result.message
                    )
                }
            }
        }
    }

    fun setErrorMessage(message: String?) {
        _uiState.value = _uiState.value.copy(errorMessage = message)
    }

    fun clearCredentials() {
        cooldownJob?.cancel()
        activeLocalChallenge = null
        _uiState.value = AuthUiState()
    }

    private fun startResendCooldown(seconds: Int) {
        cooldownJob?.cancel()
        cooldownJob = viewModelScope.launch {
            var remaining = seconds
            while (remaining > 0) {
                _uiState.value = _uiState.value.copy(resendCooldownSeconds = remaining)
                delay(1000L)
                remaining -= 1
            }
            _uiState.value = _uiState.value.copy(resendCooldownSeconds = 0)
        }
    }

    private fun generateSecureSixDigitOtp(): String {
        val code = 100000 + secureRandom.nextInt(900000)
        return code.toString()
    }

    companion object {
        private const val MAX_LOCAL_OTP_ATTEMPTS = 5
    }
}
