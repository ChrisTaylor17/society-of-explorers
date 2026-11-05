package com.anonymous.soesyntheticdemo

import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.TextView
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.anonymous.soesyntheticdemo.member.NativeSoeMemberModule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Runs only in the embedded synthetic app with member and provider policy unset. */
@RunWith(AndroidJUnit4::class)
class MemberEntryRuntimeTest {
    private val heading = "Your account, on this device"
    private val connect = "Connect my account"
    private val initial = "Connect to sign in or manage your account."
    private val unavailable = "Sign-in is unavailable in this build. Your account has not been connected."

    @Test
    fun embeddedMemberEntryClosesWithoutInstalledAccountPolicy() {
        assumeTrue("Requires the synthetic build variant", BuildConfig.SOE_EMBEDDED_SYNTHETIC)
        val app = ApplicationProvider.getApplicationContext<MainApplication>()
        assertEquals("com.anonymous.soesyntheticdemo.embedded", app.packageName)
        assertTrue("Requires a build without member or provider configuration",
            BuildConfig.SOE_MEMBER_ORIGIN.isEmpty() &&
                BuildConfig.SOE_MEMBER_STORAGE_KEY.isEmpty() &&
                BuildConfig.SOE_PROVIDER_ORIGIN.isEmpty() &&
                BuildConfig.SOE_PUBLISHABLE_KEY.isEmpty())

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            awaitEntry(scenario, initial)
            scenario.onActivity {
                val context = app.reactHost.currentReactContext
                    ?: throw AssertionError("The rendered entry has no React context")
                assertEquals("The member entry loads from the packaged bundle",
                    "assets://index.android.bundle", context.sourceURL)
            }

            press(scenario, "Read Philemon")
            awaitStudyText(scenario, "Paul’s Letter to Philemon")
            awaitStudyText(scenario, "Grace to you and peace from God our Father and the Lord Jesus Christ.")
            press(scenario, "Compare readings")
            awaitStudyText(scenario, "Two readings of the greeting")
            press(scenario, "Host guide")
            awaitStudyText(scenario, "Host a Philemon salon online")
            press(scenario, "Back to account")
            awaitEntry(scenario, initial)

            press(scenario, connect)
            awaitEntry(scenario, unavailable)
            scenario.onActivity {
                assertTrue("The installed package registers the actual member module",
                    app.reactHost.currentReactContext?.getNativeModule("NativeSoeMember") is NativeSoeMemberModule)
            }

            scenario.moveToState(Lifecycle.State.CREATED)
            scenario.moveToState(Lifecycle.State.RESUMED)
            awaitEntry(scenario, unavailable)

            scenario.recreate()
            awaitEntry(scenario, initial)
        }
    }

    private fun press(scenario: ActivityScenario<MainActivity>, label: String) {
        scenario.onActivity { activity ->
            val button = descendants(activity.window.decorView).single {
                it.isShown && it.isEnabled && it.isClickable && it.contentDescription?.toString() == label
            }
            assertTrue("Dispatch the app action: $label", button.performClick())
        }
    }

    private fun awaitStudyText(scenario: ActivityScenario<MainActivity>, marker: String) {
        val deadline = SystemClock.elapsedRealtime() + 20_000L
        while (SystemClock.elapsedRealtime() < deadline) {
            var ready = false
            scenario.onActivity { activity ->
                val views = descendants(activity.window.decorView).toList()
                ready = views.filterIsInstance<TextView>().any { it.isShown && marker in it.text.toString() }
                if (ready) assertFalse("The public study must not show credential inputs", views.any { it is EditText })
            }
            if (ready) return
            SystemClock.sleep(50L)
        }
        throw AssertionError("The bundled study did not show: $marker")
    }

    private fun awaitEntry(scenario: ActivityScenario<MainActivity>, notice: String) {
        val deadline = SystemClock.elapsedRealtime() + 20_000L
        while (SystemClock.elapsedRealtime() < deadline) {
            var ready = false
            scenario.onActivity { activity ->
                val views = descendants(activity.window.decorView).toList()
                val text = views.filterIsInstance<TextView>().filter { it.isShown }.map { it.text.toString() }
                if (heading in text) {
                    assertFalse("No credential inputs may mount in the unconfigured app", views.any { it is EditText })
                    assertFalse("No connected member action may mount in the unconfigured app",
                        views.any { it.contentDescription?.toString() == "Continue to my member account" })
                    ready = notice in text && views.any {
                        it.isShown && it.isEnabled && it.isClickable && it.contentDescription?.toString() == connect
                    }
                }
            }
            if (ready) return
            SystemClock.sleep(50L)
        }
        throw AssertionError("The embedded member entry did not show its expected state: $notice")
    }

    private fun descendants(view: View): Sequence<View> = sequence {
        yield(view)
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) yieldAll(descendants(view.getChildAt(index)))
        }
    }
}
