package com.example.core.firebase

import android.content.Context
import android.util.Log
import com.example.R
import com.example.core.model.DirectoryVerificationStatus
import com.example.core.model.Hospital
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

private const val TAG = "MediCoreFirestoreService"
private val VALID_ID_REGEX = Regex("^[a-zA-Z0-9_\\-]+$")

enum class FirestoreOperationType(val value: String) {
    CREATE("create"),
    UPDATE("update"),
    DELETE("delete"),
    LIST("list"),
    GET("get"),
    WRITE("write")
}

/**
 * Shared MediCore Firestore Client configured with the exact same named database ID
 * (`ai-studio-medicare-8567e0e2-d4bb-4849-9f8b-f0a01b6a07e0`) as the Web Staff Console
 * (`firebase-applet-config.json`). Never uses the default database instance.
 */
class MediCoreFirestoreService(private val context: Context) {

    val databaseId: String by lazy {
        context.getString(R.string.firestore_database_id)
    }

    val firestore: FirebaseFirestore by lazy {
        FirebaseFirestore.getInstance(databaseId)
    }

    val auth get() = Firebase.auth

    private fun sanitize(value: String?, maxLength: Int): String {
        if (value.isNullOrBlank()) return ""
        return value.trim().take(maxLength)
    }

    private fun logStructuredFirestoreError(
        error: Throwable,
        operationType: FirestoreOperationType,
        path: String
    ) {
        val currentUser = try {
            auth.currentUser
        } catch (_: Exception) {
            null
        }
        val payload = JSONObject().apply {
            put("error", error.message ?: error.toString())
            put("operationType", operationType.value)
            put("path", path)
            put("databaseId", databaseId)
            put("authInfo", JSONObject().apply {
                put("userId", currentUser?.uid ?: JSONObject.NULL)
                put("email", currentUser?.email ?: JSONObject.NULL)
                put("emailVerified", currentUser?.isEmailVerified ?: false)
                put("isAnonymous", currentUser?.isAnonymous ?: false)
            })
        }
        Log.e(TAG, "Firestore Error: $payload")
    }

    suspend fun verifyConnection(): Boolean {
        val path = "test/connection"
        return try {
            firestore.collection("test").document("connection").get(Source.SERVER).await()
            true
        } catch (e: Exception) {
            if (e.message?.contains("client is offline", ignoreCase = true) == true) {
                Log.e(TAG, "Please check your Firebase configuration for database $databaseId.")
                false
            } else {
                // Permission denied on /test/connection still proves live connectivity to the server
                true
            }
        }
    }

    /**
     * Syncs a verified hospital directory record using the exact shared `HospitalDirectory` schema
     * defined in `firebase-blueprint.json` and enforced by `firestore.rules`.
     */
    suspend fun syncHospitalDirectoryRecord(hospital: Hospital) {
        val docId = sanitize(hospital.directoryCode.ifBlank { hospital.id }, 128)
        if (!VALID_ID_REGEX.matches(docId)) return
        val path = "hospitals/$docId"
        try {
            val docRef = firestore.collection("hospitals").document(docId)
            val existing = docRef.get().await()
            val mappedStatus = when (hospital.verificationStatus) {
                DirectoryVerificationStatus.VERIFIED -> "VERIFIED"
                DirectoryVerificationStatus.SUSPENDED -> "SUSPENDED"
                else -> "PENDING_VERIFICATION"
            }

            if (!existing.exists()) {
                val createPayload = mapOf(
                    "id" to docId,
                    "directoryCode" to sanitize(hospital.directoryCode, 32).ifBlank { docId.take(32) },
                    "name" to sanitize(hospital.name, 180).ifBlank { "Hospital" },
                    "city" to sanitize(hospital.city, 100).ifBlank { "Ranchi" },
                    "address" to sanitize(hospital.address, 300).ifBlank { "Ranchi" },
                    "verificationStatus" to mappedStatus,
                    "isActiveTenant" to hospital.isActiveTenant,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                docRef.set(createPayload).await()
            } else {
                val updatePayload = mapOf(
                    "directoryCode" to sanitize(hospital.directoryCode, 32).ifBlank { docId.take(32) },
                    "name" to sanitize(hospital.name, 180).ifBlank { "Hospital" },
                    "city" to sanitize(hospital.city, 100).ifBlank { "Ranchi" },
                    "address" to sanitize(hospital.address, 300).ifBlank { "Ranchi" },
                    "verificationStatus" to mappedStatus,
                    "isActiveTenant" to hospital.isActiveTenant,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                docRef.update(updatePayload).await()
            }
            Log.d(TAG, "Synced hospital $docId to shared Firestore database $databaseId.")
        } catch (e: Exception) {
            logStructuredFirestoreError(e, FirestoreOperationType.WRITE, path)
        }
    }

    /**
     * Fetches active tenant hospitals from the shared Firestore `hospitals` collection
     * using the rule-enforced `isActiveTenant == true` query.
     */
    suspend fun fetchActiveHospitals(): List<Hospital> {
        val path = "hospitals"
        return try {
            val snap = firestore.collection("hospitals")
                .whereEqualTo("isActiveTenant", true)
                .get()
                .await()

            snap.documents.mapNotNull { doc ->
                val id = doc.getString("id") ?: doc.id
                val directoryCode = doc.getString("directoryCode") ?: id
                val name = doc.getString("name") ?: return@mapNotNull null
                val city = doc.getString("city") ?: "Ranchi"
                val address = doc.getString("address") ?: ""
                val verificationRaw = doc.getString("verificationStatus") ?: "PENDING_VERIFICATION"
                val verificationStatus = when (verificationRaw) {
                    "VERIFIED" -> DirectoryVerificationStatus.VERIFIED
                    "SUSPENDED" -> DirectoryVerificationStatus.SUSPENDED
                    else -> DirectoryVerificationStatus.PENDING_VERIFICATION
                }
                Hospital(
                    id = id,
                    directoryCode = directoryCode,
                    name = name,
                    city = city,
                    address = address,
                    verificationStatus = verificationStatus,
                    isActiveTenant = doc.getBoolean("isActiveTenant") ?: true
                )
            }
        } catch (e: Exception) {
            logStructuredFirestoreError(e, FirestoreOperationType.LIST, path)
            emptyList()
        }
    }

    /**
     * Syncs the authenticated Android patient's split public/private profile to the exact same
     * `/users/{uid}` and `/users/{uid}/private/info` collections used by the Web Console.
     */
    suspend fun syncPatientProfile(
        uid: String,
        displayName: String,
        email: String,
        phone: String? = null,
        authProvider: String = "email"
    ) {
        val safeUid = sanitize(uid, 128)
        if (!VALID_ID_REGEX.matches(safeUid)) return
        val userPath = "users/$safeUid"
        val privatePath = "users/$safeUid/private/info"

        val userRef = firestore.collection("users").document(safeUid)
        val privateRef = userRef.collection("private").document("info")
        val safeName = sanitize(displayName, 120).ifBlank { "MediCore Patient" }
        val safeEmail = sanitize(email, 254)
        val safePhone = sanitize(phone, 24)
        val safeProvider = if (authProvider in listOf("google.com", "phone", "email")) authProvider else "email"

        try {
            val existingUser = userRef.get().await()
            if (!existingUser.exists()) {
                val batch = firestore.batch()
                val publicPayload = mapOf(
                    "uid" to safeUid,
                    "displayName" to safeName,
                    "role" to "PATIENT",
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                val privatePayload = mutableMapOf<String, Any>(
                    "uid" to safeUid,
                    "email" to safeEmail,
                    "authProvider" to safeProvider,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                if (safePhone.isNotEmpty()) {
                    privatePayload["phone"] = safePhone
                }
                batch.set(userRef, publicPayload)
                batch.set(privateRef, privatePayload)
                batch.commit().await()
            } else {
                userRef.update(
                    mapOf(
                        "displayName" to safeName,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).await()
                val privateUpdate = mutableMapOf<String, Any>(
                    "email" to safeEmail,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                if (safePhone.isNotEmpty()) {
                    privateUpdate["phone"] = safePhone
                }
                privateRef.update(privateUpdate).await()
            }
        } catch (e: Exception) {
            logStructuredFirestoreError(e, FirestoreOperationType.WRITE, "$userPath | $privatePath")
        }
    }

    /**
     * Syncs a patient appointment to the shared `/appointments/{appointmentId}` collection
     * using the exact `AppointmentRecord` schema in `firebase-blueprint.json`.
     */
    suspend fun syncAppointmentRecord(
        appointmentId: String,
        ownerId: String,
        hospitalId: String,
        bookingNumber: String,
        doctorName: String,
        department: String,
        appointmentDate: String,
        slotTime: String,
        status: String = "SCHEDULED"
    ) {
        val safeId = sanitize(appointmentId, 128)
        val safeOwner = sanitize(ownerId, 128)
        val safeHospital = sanitize(hospitalId, 128)
        if (!VALID_ID_REGEX.matches(safeId) || !VALID_ID_REGEX.matches(safeOwner) || !VALID_ID_REGEX.matches(safeHospital)) {
            return
        }
        val path = "appointments/$safeId"
        val allowedStatuses = setOf("SCHEDULED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED")
        val normalizedStatus = status.uppercase().let { if (it in allowedStatuses) it else "SCHEDULED" }

        try {
            val docRef = firestore.collection("appointments").document(safeId)
            val existing = docRef.get().await()
            if (!existing.exists()) {
                val payload = mapOf(
                    "id" to safeId,
                    "ownerId" to safeOwner,
                    "hospitalId" to safeHospital,
                    "bookingNumber" to sanitize(bookingNumber, 40).ifBlank { "OPD-$safeId".take(40) },
                    "doctorName" to sanitize(doctorName, 120).ifBlank { "Attending Physician" },
                    "department" to sanitize(department, 100).ifBlank { "General Medicine" },
                    "appointmentDate" to sanitize(appointmentDate, 20),
                    "slotTime" to sanitize(slotTime, 20),
                    "status" to "SCHEDULED",
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                docRef.set(payload).await()
            } else {
                docRef.update(
                    mapOf(
                        "appointmentDate" to sanitize(appointmentDate, 20),
                        "slotTime" to sanitize(slotTime, 20),
                        "status" to normalizedStatus,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).await()
            }
        } catch (e: Exception) {
            logStructuredFirestoreError(e, FirestoreOperationType.WRITE, path)
        }
    }
}
