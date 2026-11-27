# MediCore Patient App Release R8 / ProGuard Configuration

# Keep Retrofit & service annotations
-keepattributes Signature,InnerClasses,EnclosingMethod
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn org.codehaus.mojo.animal_snuff.IgnoreJRERequirement
-dontwarn javax.annotation.**

# Keep Moshi DTO models & KotlinJsonAdapterFactory reflection metadata
-keep class com.example.core.network.** { *; }
-keepclassmembers class com.example.core.network.** { *; }
-keepclassmembers class * {
    @com.squareup.moshi.Json <fields>;
}

# OkHttp / Okio
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.net.ssl.**

# Kotlin Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-dontwarn kotlinx.coroutines.flow.**

# Strip verbose debug/verbose logs in release builds
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
}
