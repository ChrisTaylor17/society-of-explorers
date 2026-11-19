package com.anonymous.soesyntheticdemo.member

import android.content.Context
import android.app.KeyguardManager
import android.os.Build
import android.os.UserManager
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.system.Os
import android.system.OsConstants
import android.util.AtomicFile
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Process-wide namespace singleton. Every record/epoch transition is serialized.
 * Android Keystore protection is not a hardware/StrongBox or biometric claim. */
internal class MemberSecureStore private constructor(private val context: Context, private val config: MemberConfig) {
  private data class Record(val generation: String, val slots: MutableMap<String, String>)
  private val directory = File(context.noBackupFilesDir, "soe-member-v2")
  private val data: AtomicFile
  private val marker: AtomicFile
  private val alias = "soe.member.v2." + config.namespace
  private var record: Record? = null
  private val retirements = mutableSetOf<() -> Unit>()

  init {
    unlocked()
    if (!directory.isDirectory) {
      require(directory.mkdirs() || directory.isDirectory)
      syncDirectory(context.noBackupFilesDir)
    }
    data = AtomicFile(File(directory, config.namespace + ".record"))
    marker = AtomicFile(File(directory, config.namespace + ".reset"))
    // A committed, secret-free marker takes precedence over ALL old ciphertext.
    if (marker.baseFile.exists() || File(marker.baseFile.path + ".bak").exists()) {
      val pending = JSONObject(String(readBounded(marker, 1024), Charsets.UTF_8))
      require(pending.keys().asSequence().toSet() == setOf("version", "previousGeneration", "generation"))
      require(pending.getInt("version") == 2)
      val previous = pending.getString("previousGeneration")
      val next = pending.getString("generation")
      MemberConfig.generation(previous); MemberConfig.generation(next); require(previous != next)
      val empty = Record(next, mutableMapOf())
      persist(empty)
      clearResetMarker()
      record = empty
    } else if (data.baseFile.exists() || File(data.baseFile.path + ".bak").exists()) {
      record = decode(readBounded(data, MAX_RECORD))
    } else {
      val empty = Record(UUID.randomUUID().toString(), mutableMapOf())
      persist(empty); record = empty
    }
  }

  private fun unlocked() {
    // Direct-Boot unlock alone remains true after a later ordinary screen lock.
    // Gate cached plaintext and transport epochs on BOTH independent states.
    require(context.getSystemService(UserManager::class.java)?.isUserUnlocked == true)
    require(context.getSystemService(KeyguardManager::class.java)?.isDeviceLocked == false)
  }
  private fun ready(): Record { unlocked(); return record ?: throw IllegalStateException("Unavailable") }
  @Synchronized fun generation(): String = ready().generation
  @Synchronized fun <T> withGeneration(expected: String, work: () -> T): T {
    MemberConfig.generation(expected); require(ready().generation == expected); return work()
  }
  @Synchronized fun read(slot: String, expected: String): String? = withGeneration(expected) {
    MemberConfig.slot(slot); ready().slots[slot]
  }
  @Synchronized fun write(slot: String, value: String, expected: String) = withGeneration(expected) {
    MemberConfig.slot(slot); MemberConfig.value(value)
    val current = ready(); val next = Record(current.generation, current.slots.toMutableMap())
    next.slots[slot] = value; persist(next); record = next
  }
  @Synchronized fun remove(slot: String, expected: String) = withGeneration(expected) {
    MemberConfig.slot(slot)
    val current = ready(); val next = Record(current.generation, current.slots.toMutableMap())
    next.slots.remove(slot); persist(next); record = next
  }
  @Synchronized fun onRetirement(listener: () -> Unit): () -> Unit {
    retirements.add(listener)
    return { synchronized(this) { retirements.remove(listener); Unit } }
  }
  // Reserved typed email-flow storage is deliberately outside the generic JS
  // session/pkce/user slot API. Reset still clears it in the same durable epoch.
  @Synchronized internal fun emailRead(expected: String): String? = withGeneration(expected) { ready().slots[EMAIL_SLOT] }
  @Synchronized internal fun emailWrite(expected: String, value: String?) = withGeneration(expected) {
    require(value == null || value.toByteArray(Charsets.UTF_8).size <= 8192)
    val current = ready(); val next = Record(current.generation, current.slots.toMutableMap())
    if (value == null) next.slots.remove(EMAIL_SLOT) else next.slots[EMAIL_SLOT] = value
    persist(next); record = next
  }
  @Synchronized fun reset(expected: String): Pair<String, String> = withGeneration(expected) {
    val previous = ready().generation
    val next = UUID.randomUUID().toString()
    val pending = JSONObject().put("version", 2).put("previousGeneration", previous).put("generation", next)
    // Poison memory and stop all namespace requests BEFORE any fallible disk work.
    retireRecord()
    // Once this sync'd atomic marker commits, recovery may only expose EMPTY next.
    atomicWrite(marker, pending.toString().toByteArray(Charsets.UTF_8))
    val empty = Record(next, mutableMapOf())
    persist(empty)
    clearResetMarker()
    record = empty
    previous to next
  }

  private fun retireRecord() {
    record = null
    for (retire in retirements.toList()) { try { retire() } catch (_: Exception) { /* Already fenced. */ } }
  }

  private fun clearResetMarker() {
    marker.delete()
    check(!marker.baseFile.exists() && !hasPendingWrite(marker))
    syncDirectory(directory)
  }

  private fun key(): SecretKey {
    val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val existing = keys.getKey(alias, null)
    if (existing != null) return existing as SecretKey
    val builder = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setRandomizedEncryptionRequired(true).setUserAuthenticationRequired(false)
    if (Build.VERSION.SDK_INT >= 28) builder.setUnlockedDeviceRequired(true)
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
      init(builder.build()); generateKey()
    }
  }
  private fun persist(value: Record) {
    unlocked()
    val slots = JSONObject(); value.slots.forEach { (slot, text) -> slots.put(slot, text) }
    val plaintext = JSONObject().put("version", 2).put("generation", value.generation).put("slots", slots)
      .toString().toByteArray(Charsets.UTF_8)
    require(plaintext.size <= MAX_RECORD - 100)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key()); cipher.updateAAD(config.namespace.toByteArray(Charsets.UTF_8))
    require(cipher.iv.size == 12)
    atomicWrite(data, byteArrayOf(2) + cipher.iv + cipher.doFinal(plaintext))
  }
  private fun decode(bytes: ByteArray): Record {
    require(bytes.size >= 30 && bytes[0] == 2.toByte())
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
    cipher.updateAAD(config.namespace.toByteArray(Charsets.UTF_8))
    val decoded = JSONObject(String(cipher.doFinal(bytes.copyOfRange(13, bytes.size)), Charsets.UTF_8))
    require(decoded.keys().asSequence().toSet() == setOf("version", "generation", "slots") && decoded.getInt("version") == 2)
    val generation = decoded.getString("generation"); MemberConfig.generation(generation)
    val slots = decoded.getJSONObject("slots"); val values = mutableMapOf<String, String>()
    for (slot in slots.keys()) {
      if (slot != EMAIL_SLOT) MemberConfig.slot(slot)
      val value = slots.getString(slot); MemberConfig.value(value)
      if (slot == EMAIL_SLOT) require(value.toByteArray(Charsets.UTF_8).size <= 8192)
      values[slot] = value
    }
    return Record(generation, values)
  }
  private fun atomicWrite(file: AtomicFile, bytes: ByteArray) {
    try {
      val stream = file.startWrite()
      try {
        stream.write(bytes)
        stream.fd.sync()
      } catch (error: Exception) {
        file.failWrite(stream)
        throw error
      }
      // AtomicFile can log a failed rename or cleanup and still return normally.
      file.finishWrite(stream)
      check(!hasPendingWrite(file))
      check(readBounded(file, bytes.size).contentEquals(bytes))
      syncDirectory(directory)
    } catch (error: Exception) {
      if (record != null) retireRecord()
      throw error
    }
  }
  private fun hasPendingWrite(file: AtomicFile): Boolean =
    File(file.baseFile.path + ".bak").exists() || File(file.baseFile.path + ".new").exists()

  private fun syncDirectory(path: File) {
    // O_DIRECTORY is not part of the public Android SDK. Check the opened
    // descriptor instead of a path precheck, which could race replacement.
    // Refuse a final symlink; a substituted FIFO must not block this operation.
    val descriptor = Os.open(path.absolutePath,
      OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW or OsConstants.O_NONBLOCK, 0)
    try {
      check(OsConstants.S_ISDIR(Os.fstat(descriptor).st_mode))
      Os.fsync(descriptor)
    } finally { Os.close(descriptor) }
  }
  private fun readBounded(file: AtomicFile, max: Int): ByteArray = file.openRead().use { input ->
    val output = ByteArrayOutputStream(); val buffer = ByteArray(4096)
    while (true) { val count = input.read(buffer); if (count < 0) break; require(output.size() + count <= max); output.write(buffer, 0, count) }
    output.toByteArray()
  }
  companion object {
    private const val EMAIL_SLOT = "email-link-v1"
    private const val MAX_RECORD = 1300000
    private val stores = mutableMapOf<String, MemberSecureStore>()
    @Synchronized fun open(context: Context, config: MemberConfig): MemberSecureStore =
      stores.getOrPut(config.namespace) { MemberSecureStore(context.applicationContext, config) }
  }
}
