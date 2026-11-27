package com.example.core.network

import android.content.Context
import coil.ImageLoader
import com.example.BuildConfig
import com.example.core.security.SecureTokenStorage
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Centralized Network Client Provider for MediCore Android (Patient Client).
 * - Attaches Keystore-backed Bearer tokens via AuthInterceptor
 * - Rotates tokens transparently on 401 via TokenAuthenticator
 * - Configures Moshi with KotlinJsonAdapterFactory for null-safe data class deserialization
 * - Shares authenticated OkHttpClient with Coil ImageLoader for private patient photo fetches
 */
object NetworkClientProvider {

    private const val DEFAULT_BASE_URL = "https://ais-dev-iuh5a2zu5cs44hdzux6xzj-853319477717.asia-southeast1.run.app/"

    @Volatile
    private var apiService: MediCoreApiService? = null

    @Volatile
    private var sharedOkHttpClient: OkHttpClient? = null

    @Volatile
    private var authenticatedImageLoader: ImageLoader? = null

    val moshi: Moshi by lazy {
        Moshi.Builder()
            .addLast(KotlinJsonAdapterFactory())
            .build()
    }

    fun getBaseUrl(): String = DEFAULT_BASE_URL

    fun resolveApiUrl(relativeOrAbsolute: String?): String? {
        if (relativeOrAbsolute.isNullOrBlank()) return null
        if (relativeOrAbsolute.startsWith("http://") || relativeOrAbsolute.startsWith("https://")) {
            return relativeOrAbsolute
        }
        return DEFAULT_BASE_URL.trimEnd('/') + "/" + relativeOrAbsolute.trimStart('/')
    }

    fun getApiService(context: Context? = null): MediCoreApiService {
        return apiService ?: synchronized(this) {
            apiService ?: buildRetrofit(context).create(MediCoreApiService::class.java).also {
                apiService = it
            }
        }
    }

    fun getImageLoader(context: Context): ImageLoader {
        val appContext = context.applicationContext
        return authenticatedImageLoader ?: synchronized(this) {
            authenticatedImageLoader ?: ImageLoader.Builder(appContext)
                .okHttpClient(getOrCreateOkHttpClient(appContext))
                .build()
                .also { authenticatedImageLoader = it }
        }
    }

    fun getOrCreateOkHttpClient(context: Context?): OkHttpClient {
        return sharedOkHttpClient ?: synchronized(this) {
            sharedOkHttpClient ?: buildOkHttpClient(context).also {
                sharedOkHttpClient = it
            }
        }
    }

    private fun buildOkHttpClient(context: Context?): OkHttpClient {
        val tokenProvider: () -> SecureTokenStorage = {
            context?.let { SecureTokenStorage.getInstance(it) } ?: SecureTokenStorage()
        }

        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
            redactHeader("Authorization")
            redactHeader("Cookie")
            redactHeader("X-Razorpay-Signature")
        }

        return OkHttpClient.Builder()
            .cache(null)
            .addInterceptor(AuthInterceptor(tokenProvider))
            .authenticator(TokenAuthenticator(DEFAULT_BASE_URL, tokenProvider, moshi))
            .addInterceptor(loggingInterceptor)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()
    }

    private fun buildRetrofit(context: Context?): Retrofit {
        return Retrofit.Builder()
            .baseUrl(DEFAULT_BASE_URL)
            .client(getOrCreateOkHttpClient(context))
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
    }
}
