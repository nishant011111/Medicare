package com.example.core.security

import android.annotation.SuppressLint
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private val Context.secureSessionDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "medicore_keystore_protected_session"
)

data class StoredSessionTokens(
    val accessToken: String?,
    val refreshToken: String?,
    val expiresAtEpochMillis: Long,
    val userId: String?,
    val activeHospitalId: String?,
    val userEmail: String? = null,
    val isEmailVerified: Boolean = false,
    val onboardingCompleted: Boolean = false
) {
    val isExpired: Boolean
        get() = accessToken.isNullOrBlank() || (expiresAtEpochMillis > 0 && System.currentTimeMillis() >= expiresAtEpochMillis)

    val hasRefreshSession: Boolean
        get() = !refreshToken.isNullOrBlank() && !userId.isNullOrBlank()
}

/**
 * Android Keystore-backed AES-256-GCM encrypted token storage backed by Jetpack DataStore.
 * Never stores plain-text access or refresh tokens on disk, and never stores clinical health records locally.
 */
class SecureTokenStorage(private val context: Context? = null) {

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "MediCore_Phase2_MasterTokenKey"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH = 128

        private val KEY_ENCRYPTED_ACCESS_TOKEN = stringPreferencesKey("enc_access_token")
        private val KEY_ENCRYPTED_REFRESH_TOKEN = stringPreferencesKey("enc_refresh_token")
        private val KEY_EXPIRES_AT = longPreferencesKey("expires_at_epoch_ms")
        private val KEY_USER_ID = stringPreferencesKey("session_user_id")
        private val KEY_ACTIVE_HOSPITAL_ID = stringPreferencesKey("session_active_hospital_id")
        private val KEY_USER_EMAIL = stringPreferencesKey("session_user_email")
        private val KEY_EMAIL_VERIFIED = booleanPreferencesKey("session_email_verified")
        private val KEY_ONBOARDING_COMPLETED = booleanPreferencesKey("session_onboarding_completed")

        private val jvmFallbackSecretKey: SecretKey by lazy {
            val keyGen = KeyGenerator.getInstance("AES")
            keyGen.init(256)
            keyGen.generateKey()
        }

        @SuppressLint("StaticFieldLeak")
        @Volatile
        private var INSTANCE: SecureTokenStorage? = null

        fun getInstance(context: Context): SecureTokenStorage {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SecureTokenStorage(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    @Volatile
    private var memoryCache: StoredSessionTokens = StoredSessionTokens(
        accessToken = null,
        refreshToken = null,
        expiresAtEpochMillis = 0L,
        userId = null,
        activeHospitalId = null
    )

    private fun getOrCreateSecretKey(): SecretKey {
        return try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            val existingKey = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
            if (existingKey != null) {
                existingKey.secretKey
            } else {
                val keyGenerator = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES,
                    ANDROID_KEYSTORE
                )
                val spec = KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
                keyGenerator.init(spec)
                keyGenerator.generateKey()
            }
        } catch (_: Exception) {
            jvmFallbackSecretKey
        }
    }

    fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val iv = cipher.iv
        val cipherBytes = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        val combined = ByteArray(1 + iv.size + cipherBytes.size)
        combined[0] = iv.size.toByte()
        System.arraycopy(iv, 0, combined, 1, iv.size)
        System.arraycopy(cipherBytes, 0, combined, 1 + iv.size, cipherBytes.size)
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    fun decrypt(cipherTextBase64: String): String? {
        return try {
            val combined = Base64.decode(cipherTextBase64, Base64.NO_WRAP)
            val ivSize = combined[0].toInt()
            val iv = combined.copyOfRange(1, 1 + ivSize)
            val cipherBytes = combined.copyOfRange(1 + ivSize, combined.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateSecretKey(),
                GCMParameterSpec(GCM_TAG_LENGTH, iv)
            )
            String(cipher.doFinal(cipherBytes), Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }

    suspend fun saveTokens(
        accessToken: String,
        refreshToken: String,
        expiresInSeconds: Long,
        userId: String,
        activeHospitalId: String?,
        userEmail: String? = memoryCache.userEmail,
        isEmailVerified: Boolean = memoryCache.isEmailVerified,
        onboardingCompleted: Boolean = memoryCache.onboardingCompleted
    ) {
        val expiresAt = System.currentTimeMillis() + (expiresInSeconds * 1000L)
        memoryCache = StoredSessionTokens(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAtEpochMillis = expiresAt,
            userId = userId,
            activeHospitalId = activeHospitalId,
            userEmail = userEmail,
            isEmailVerified = isEmailVerified,
            onboardingCompleted = onboardingCompleted
        )

        val appContext = context?.applicationContext ?: return
        val encAccess = encrypt(accessToken)
        val encRefresh = encrypt(refreshToken)

        appContext.secureSessionDataStore.edit { prefs ->
            prefs[KEY_ENCRYPTED_ACCESS_TOKEN] = encAccess
            prefs[KEY_ENCRYPTED_REFRESH_TOKEN] = encRefresh
            prefs[KEY_EXPIRES_AT] = expiresAt
            prefs[KEY_USER_ID] = userId
            prefs[KEY_EMAIL_VERIFIED] = isEmailVerified
            prefs[KEY_ONBOARDING_COMPLETED] = onboardingCompleted
            if (activeHospitalId != null) {
                prefs[KEY_ACTIVE_HOSPITAL_ID] = activeHospitalId
            } else {
                prefs.remove(KEY_ACTIVE_HOSPITAL_ID)
            }
            if (userEmail != null) {
                prefs[KEY_USER_EMAIL] = userEmail
            } else {
                prefs.remove(KEY_USER_EMAIL)
            }
        }
    }

    suspend fun updateSessionMeta(
        isEmailVerified: Boolean? = null,
        onboardingCompleted: Boolean? = null,
        userEmail: String? = null
    ) {
        val next = memoryCache.copy(
            isEmailVerified = isEmailVerified ?: memoryCache.isEmailVerified,
            onboardingCompleted = onboardingCompleted ?: memoryCache.onboardingCompleted,
            userEmail = userEmail ?: memoryCache.userEmail
        )
        memoryCache = next

        val appContext = context?.applicationContext ?: return
        appContext.secureSessionDataStore.edit { prefs ->
            if (isEmailVerified != null) prefs[KEY_EMAIL_VERIFIED] = isEmailVerified
            if (onboardingCompleted != null) prefs[KEY_ONBOARDING_COMPLETED] = onboardingCompleted
            if (userEmail != null) prefs[KEY_USER_EMAIL] = userEmail
        }
    }

    suspend fun updateAccessToken(
        accessToken: String,
        expiresInSeconds: Long,
        activeHospitalId: String?
    ) {
        val expiresAt = System.currentTimeMillis() + (expiresInSeconds * 1000L)
        memoryCache = memoryCache.copy(
            accessToken = accessToken,
            expiresAtEpochMillis = expiresAt,
            activeHospitalId = activeHospitalId
        )

        val appContext = context?.applicationContext ?: return
        val encAccess = encrypt(accessToken)
        appContext.secureSessionDataStore.edit { prefs ->
            prefs[KEY_ENCRYPTED_ACCESS_TOKEN] = encAccess
            prefs[KEY_EXPIRES_AT] = expiresAt
            if (activeHospitalId != null) {
                prefs[KEY_ACTIVE_HOSPITAL_ID] = activeHospitalId
            } else {
                prefs.remove(KEY_ACTIVE_HOSPITAL_ID)
            }
        }
    }

    suspend fun loadTokens(): StoredSessionTokens {
        val appContext = context?.applicationContext ?: return memoryCache
        val prefs = appContext.secureSessionDataStore.data.first()
        val encAccess = prefs[KEY_ENCRYPTED_ACCESS_TOKEN]
        val encRefresh = prefs[KEY_ENCRYPTED_REFRESH_TOKEN]
        val expiresAt = prefs[KEY_EXPIRES_AT] ?: 0L
        val userId = prefs[KEY_USER_ID]
        val activeHospitalId = prefs[KEY_ACTIVE_HOSPITAL_ID]
        val userEmail = prefs[KEY_USER_EMAIL]
        val isEmailVerified = prefs[KEY_EMAIL_VERIFIED] ?: false
        val onboardingCompleted = prefs[KEY_ONBOARDING_COMPLETED] ?: false

        if (encAccess != null && encRefresh != null) {
            val decAccess = decrypt(encAccess)
            val decRefresh = decrypt(encRefresh)
            if (decAccess != null && decRefresh != null) {
                memoryCache = StoredSessionTokens(
                    accessToken = decAccess,
                    refreshToken = decRefresh,
                    expiresAtEpochMillis = expiresAt,
                    userId = userId,
                    activeHospitalId = activeHospitalId,
                    userEmail = userEmail,
                    isEmailVerified = isEmailVerified,
                    onboardingCompleted = onboardingCompleted
                )
            }
        }
        return memoryCache
    }

    fun getCurrentTokensSync(): StoredSessionTokens = memoryCache

    fun observeSession(): Flow<StoredSessionTokens>? {
        val appContext = context?.applicationContext ?: return null
        return appContext.secureSessionDataStore.data.map { prefs ->
            val encAccess = prefs[KEY_ENCRYPTED_ACCESS_TOKEN]
            val encRefresh = prefs[KEY_ENCRYPTED_REFRESH_TOKEN]
            StoredSessionTokens(
                accessToken = encAccess?.let { decrypt(it) },
                refreshToken = encRefresh?.let { decrypt(it) },
                expiresAtEpochMillis = prefs[KEY_EXPIRES_AT] ?: 0L,
                userId = prefs[KEY_USER_ID],
                activeHospitalId = prefs[KEY_ACTIVE_HOSPITAL_ID],
                userEmail = prefs[KEY_USER_EMAIL],
                isEmailVerified = prefs[KEY_EMAIL_VERIFIED] ?: false,
                onboardingCompleted = prefs[KEY_ONBOARDING_COMPLETED] ?: false
            )
        }
    }

    suspend fun clearTokens() {
        memoryCache = StoredSessionTokens(null, null, 0L, null, null, null, false, false)
        val appContext = context?.applicationContext ?: return
        appContext.secureSessionDataStore.edit { it.clear() }
    }
}
