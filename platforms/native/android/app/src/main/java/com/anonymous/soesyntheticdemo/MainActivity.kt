package com.anonymous.soesyntheticdemo

import android.os.Build
import android.os.Bundle
import android.content.Intent
import com.anonymous.soesyntheticdemo.member.EmailLinkLifecycle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    // Capture before React/Linking exists. The Activity retains no raw callback.
    val callback = intent?.dataString
    intent?.data = null
    intent?.clipData = null
    EmailLinkLifecycle.capture(applicationContext, callback)
    super.onCreate(null)
    ReportPrivacyGuard.install(window.decorView)
  }

  override fun onPause() {
    EmailLinkLifecycle.background()
    // Fabric can defer native commits while paused. Clear the owned editable
    // surface and keep it hidden until the JS lifecycle clear unmounts it.
    ReportPrivacyGuard.clearAndHide(window.decorView)
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    EmailLinkLifecycle.foreground()
  }

  override fun onNewIntent(incoming: Intent) {
    val callback = incoming.dataString
    val sanitized = Intent(incoming).apply { data = null; clipData = null }
    EmailLinkLifecycle.capture(applicationContext, callback)
    setIntent(sanitized)
    super.onNewIntent(sanitized)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){
            override fun getLaunchOptions(): Bundle = Bundle().apply {
              putBoolean("embeddedSynthetic", BuildConfig.SOE_EMBEDDED_SYNTHETIC)
              putBoolean("syntheticAutorun", BuildConfig.SOE_EMBEDDED_SYNTHETIC && intent.getBooleanExtra("soe.synthetic.autorun", false))
            }
          })
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
