package com.anonymous.soesyntheticdemo.member

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.anonymous.soesyntheticdemo.BuildConfig
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class MemberSecureStoreRuntimeTest {
    @Test
    fun clearPersistsAnEmptySuccessorAcrossVaultReopen() = withFixture { fixture ->
        val vault = fixture.open()
        val original = vault.generation()
        vault.write("session", "SYNTHETIC_SESSION", original)
        vault.write("pkce", "SYNTHETIC_PKCE", original)
        vault.write("user", "SYNTHETIC_USER", original)
        vault.emailWrite(original, "SYNTHETIC_EMAIL_LINK")

        val (previous, next) = vault.reset(original)
        assertEquals(original, previous)
        assertNotEquals(original, next)
        fixture.assertMarkerRemoved()
        val reopened = fixture.open()
        assertEquals(next, reopened.generation())
        assertEmpty(reopened, next)
        assertTrue("The previous generation must be refused", runCatching { reopened.read("session", original) }.isFailure)
    }

    @Test
    fun blockedReplacementRejectsResetAndPreservesTheMarkerForRecovery() = withFixture { fixture ->
        val vault = fixture.open()
        val original = vault.generation()
        vault.write("session", "SYNTHETIC_PRIOR_SESSION", original)
        vault.emailWrite(original, "SYNTHETIC_PRIOR_EMAIL_LINK")
        val previousCiphertext = fixture.blockRecordReplacement()
        var retirements = 0
        vault.onRetirement { retirements++ }

        assertTrue("An uncommitted encrypted replacement must not acknowledge clear", runCatching { vault.reset(original) }.isFailure)
        assertEquals(1, retirements)
        assertTrue("The failed reset must retire the old vault", runCatching { vault.generation() }.isFailure)
        val pending = JSONObject(fixture.marker.readText())
        assertEquals(original, pending.getString("previousGeneration"))
        val next = pending.getString("generation")
        assertNotEquals(original, next)

        // Replay the old ciphertext alongside the committed marker in this
        // isolated fixture. A new vault must select the marker and erase it.
        fixture.restoreRecord(previousCiphertext)
        val reopened = fixture.open()
        assertEquals(next, reopened.generation())
        assertEmpty(reopened, next)
        fixture.assertMarkerRemoved()
    }

    @Test
    fun blockedOrdinaryWriteRetiresTheCachedVault() = withFixture { fixture ->
        val vault = fixture.open()
        val generation = vault.generation()
        vault.write("session", "SYNTHETIC_PRIOR_SESSION", generation)
        val previousCiphertext = fixture.blockRecordReplacement()
        var retirements = 0
        vault.onRetirement { retirements++ }

        assertTrue(runCatching { vault.remove("session", generation) }.isFailure)
        assertEquals(1, retirements)
        assertTrue("The old cached value is unavailable after the failed write", runCatching { vault.read("session", generation) }.isFailure)
        fixture.assertMarkerRemoved()
        fixture.restoreRecord(previousCiphertext)
        val reopened = fixture.open()
        assertEquals(generation, reopened.generation())
        assertEquals("SYNTHETIC_PRIOR_SESSION", reopened.read("session", generation))
    }

    private fun assertEmpty(vault: MemberSecureStore, generation: String) {
        for (slot in listOf("session", "pkce", "user")) assertNull(vault.read(slot, generation))
        assertNull(vault.emailRead(generation))
    }

    private fun withFixture(test: (Fixture) -> Unit) {
        assumeTrue("Requires the embedded synthetic APK", BuildConfig.SOE_EMBEDDED_SYNTHETIC)
        val app = ApplicationProvider.getApplicationContext<Context>()
        assertEquals("com.anonymous.soesyntheticdemo.embedded", app.packageName)
        assertNull("Run without an installed member configuration", MemberConfig.configured())
        assertTrue(BuildConfig.SOE_PROVIDER_ORIGIN.isEmpty() && BuildConfig.SOE_PUBLISHABLE_KEY.isEmpty())

        val fixture = Fixture(app)
        try { test(fixture) } finally { fixture.clean() }
    }

    private class Fixture(private val context: Context) {
        // Reflect only our own private constructors, in the test APK. Use a
        // fresh namespace and bypass the singleton to exercise disk recovery.
        private val config = MemberConfig::class.java.getDeclaredConstructor(
            String::class.java, String::class.java, String::class.java, String::class.java
        ).apply { isAccessible = true }.newInstance("https://storage-fixture.invalid", "fixture-${UUID.randomUUID()}", "", "")
        private val directory = File(context.noBackupFilesDir, "soe-member-v2")
        private val record = File(directory, config.namespace + ".record")
        val marker = File(directory, config.namespace + ".reset")

        fun open(): MemberSecureStore = MemberSecureStore::class.java.getDeclaredConstructor(
            Context::class.java, MemberConfig::class.java
        ).apply { isAccessible = true }.newInstance(context, config)

        fun blockRecordReplacement(): ByteArray {
            val before = record.readBytes()
            assertTrue(record.delete())
            assertTrue(record.mkdir())
            // Modern AtomicFile cannot rename over this directory. The legacy
            // implementation cannot delete it after moving it to .bak.
            File(record, "fixture-obstruction").writeText("synthetic")
            return before
        }

        fun restoreRecord(bytes: ByteArray) {
            removeFiles(record)
            record.writeBytes(bytes)
        }

        fun assertMarkerRemoved() {
            for (file in relatedFiles(marker)) assertFalse(file.exists())
        }

        fun clean() {
            try {
                removeFiles(record)
                removeFiles(marker)
            } finally {
                KeyStore.getInstance("AndroidKeyStore").apply {
                    load(null)
                    deleteEntry("soe.member.v2." + config.namespace)
                }
            }
        }

        private fun relatedFiles(base: File): List<File> = listOf(base, File(base.path + ".bak"), File(base.path + ".new"))

        private fun removeFiles(base: File) {
            for (file in relatedFiles(base)) {
                if (file.exists()) assertTrue("Remove isolated fixture state", file.deleteRecursively())
            }
        }
    }
}
