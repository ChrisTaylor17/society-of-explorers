package com.anonymous.soesyntheticdemo

import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.lifecycle.Lifecycle
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.net.HttpURLConnection
import java.net.URL
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import okhttp3.OkHttpClient
import okhttp3.Request

/** Owned synthetic app only. No input-event injection or device settings changes. */
@RunWith(AndroidJUnit4::class)
class SyntheticRuntimeTest {
    private var screenshotsAllowed = true
    private fun request(path: String, post: Boolean = false): JSONObject {
        val connection = URL("http://127.0.0.1:8787$path").openConnection() as HttpURLConnection
        connection.connectTimeout = 5000
        connection.readTimeout = 5000
        if (post) { connection.requestMethod = "POST"; connection.doOutput = true; connection.setRequestProperty("content-type", "application/json"); connection.outputStream.use { it.write("{}".toByteArray()) } }
        return connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }.also { connection.disconnect() }
    }
    private fun awaitEvent(tag: String, state: String? = null): JSONObject {
        val deadline = System.currentTimeMillis() + 90000
        while (System.currentTimeMillis() < deadline) {
            val events = request("/__runtime/audit").getJSONArray("audit")
            for (index in events.length() - 1 downTo 0) {
                val event = events.getJSONObject(index)
                if (event.optString("tag") == tag && (state == null || event.optString("state") == state)) return event
            }
            Thread.sleep(250)
        }
        throw AssertionError("Missing native lifecycle event: $tag/$state")
    }
    private fun captureOwnWindow(scenario: ActivityScenario<MainActivity>, name: String) {
        if (!BuildConfig.SOE_EMBEDDED_SYNTHETIC || !screenshotsAllowed) return
        try {
            val frame = CountDownLatch(1)
            scenario.onActivity { activity -> activity.window.decorView.postOnAnimation { activity.window.decorView.postOnAnimation { frame.countDown() } } }
            assertTrue("Own app frame drawn", frame.await(5, TimeUnit.SECONDS))
            val copied = CountDownLatch(1)
            val result = AtomicInteger(-1)
            var bitmap: Bitmap? = null
            scenario.onActivity { activity ->
                val view = activity.window.decorView
                bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
                PixelCopy.request(activity.window, bitmap!!, { status -> result.set(status); copied.countDown() }, Handler(Looper.getMainLooper()))
            }
            assertTrue("Own app PixelCopy completed", copied.await(10, TimeUnit.SECONDS))
            assertEquals("Own app PixelCopy status", PixelCopy.SUCCESS, result.get())
            val context = ApplicationProvider.getApplicationContext<Context>()
            val file = File(context.getExternalFilesDir("screenshots"), "$name.png")
            file.parentFile!!.mkdirs()
            file.outputStream().use { bitmap!!.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap!!.recycle()
            println("SOE_SCREENSHOT_PATH=${file.absolutePath}")
        } catch (denied: SecurityException) {
            screenshotsAllowed = false
            println("SOE_SCREENSHOT_DENIED=${denied.message}")
        }
    }
    private fun awaitOwnRenderedText(scenario: ActivityScenario<MainActivity>, expected: String, forbidden: String? = null) {
        if (!BuildConfig.SOE_EMBEDDED_SYNTHETIC) return
        fun text(view: View): String = when (view) {
            is TextView -> view.text.toString()
            is ViewGroup -> (0 until view.childCount).joinToString("\n") { text(view.getChildAt(it)) }
            else -> ""
        }
        val deadline = System.currentTimeMillis() + 10000
        while (System.currentTimeMillis() < deadline) {
            var ready = false
            scenario.onActivity { activity ->
                val rendered = text(activity.window.decorView)
                ready = rendered.contains(expected) && (forbidden == null || !rendered.contains(forbidden))
            }
            if (ready) return
            Thread.sleep(50)
        }
        throw AssertionError("Owned app view did not render expected state: $expected")
    }
    @Test fun syntheticJourneyActualLifecycleAndControllerRegressions() {
        request("/__runtime/start-run", true)
        if (BuildConfig.SOE_EMBEDDED_SYNTHETIC) {
            // Positive control: the native default HTTP client follows the fixture,
            // with NO authorization, cookie or session material on the control request.
            request("/__runtime/redirect-reset", true)
            val control = OkHttpClient.Builder().callTimeout(5, TimeUnit.SECONDS).build()
            assertTrue(control.followRedirects)
            control.newCall(Request.Builder().url("http://127.0.0.1:8787/__runtime/redirect/302/cross").build()).execute().use { response -> assertEquals(200, response.code) }
            val hits = request("/__runtime/redirect-stats").getJSONArray("redirectHits")
            assertEquals(1, hits.length())
            assertFalse(hits.getJSONObject(0).getBoolean("authorization"))
            assertFalse(hits.getJSONObject(0).getBoolean("cookie"))
            println("SOE_REDIRECT_POSITIVE_CONTROL=default_native_client_followed_without_session_material")
            request("/__runtime/redirect-reset", true)
        }
        val launch = Intent(ApplicationProvider.getApplicationContext<Context>(), MainActivity::class.java)
        if (BuildConfig.SOE_EMBEDDED_SYNTHETIC) launch.putExtra("soe.synthetic.autorun", true)
        ActivityScenario.launch<MainActivity>(launch).use { scenario ->
            assertTrue("Native journey reaches reciprocal consent", awaitEvent("mutual-visible").getBoolean("heldRelay"))
            assertTrue(awaitEvent("journey-ready").getBoolean("heldRelay"))
            awaitOwnRenderedText(scenario, "relay:ada.linden")
            captureOwnWindow(scenario, "synthetic-mutual")
            scenario.moveToState(Lifecycle.State.CREATED)
            assertFalse("Actual Android background clears contact", awaitEvent("activity", "background").getBoolean("heldRelay"))
            assertEquals("committed", request("/__runtime/host-revoke", true).getString("status"))
            scenario.moveToState(Lifecycle.State.RESUMED)
            assertFalse("Foreground read observes remote revoke", awaitEvent("foreground-returned").getBoolean("heldRelay"))
            awaitOwnRenderedText(scenario, "Acceptance in progress", "relay:ada.linden")
            captureOwnWindow(scenario, "synthetic-revoked")
            val deadline = System.currentTimeMillis() + 90000
            var report: JSONObject? = null
            while (System.currentTimeMillis() < deadline) {
                val value = request("/__runtime/report").optJSONObject("report")
                if (value != null) { report = value; break }
                Thread.sleep(250)
            }
            assertNotNull("Android runtime regression report received", report)
            assertEquals("Hermes", report!!.getString("engine"))
            assertEquals(0, report!!.getInt("failed"))
            assertEquals(if (BuildConfig.SOE_EMBEDDED_SYNTHETIC) 18 else 11, report!!.getInt("passed"))
            if (BuildConfig.SOE_EMBEDDED_SYNTHETIC) {
                assertTrue(report!!.getBoolean("embedded_synthetic"))
                assertFalse(report!!.getBoolean("metro_required"))
                assertTrue(report!!.getBoolean("backend_required"))
                assertTrue(report!!.getString("script_url").startsWith("assets://"))
            }
        }
    }
}
