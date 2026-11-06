package com.anonymous.soesyntheticdemo.reader

import android.graphics.Color
import android.net.Uri
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.VideoView
import com.anonymous.soesyntheticdemo.R
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event
import com.facebook.react.viewmanagers.SoeClipPlayerManagerDelegate
import com.facebook.react.viewmanagers.SoeClipPlayerManagerInterface

internal class ClipPlayerManager : SimpleViewManager<ClipPlayerView>(), SoeClipPlayerManagerInterface<ClipPlayerView> {
  private val delegate = SoeClipPlayerManagerDelegate(this)
  override fun getDelegate(): ViewManagerDelegate<ClipPlayerView> = delegate
  override fun getName() = "SoeClipPlayer"
  override fun createViewInstance(context: ThemedReactContext) = ClipPlayerView(context)
  @ReactProp(name = "clipId") override fun setClipId(view: ClipPlayerView, value: String?) { view.clipId = value ?: "" }
  @ReactProp(name = "requestKey") override fun setRequestKey(view: ClipPlayerView, value: String?) { view.requestKey = value ?: "" }
  @ReactProp(name = "playing") override fun setPlaying(view: ClipPlayerView, value: Boolean) { view.playing = value }
  override fun onAfterUpdateTransaction(view: ClipPlayerView) { super.onAfterUpdateTransaction(view); view.update() }
  override fun onDropViewInstance(view: ClipPlayerView) { view.dispose(); super.onDropViewInstance(view) }
  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = mapOf("topClipState" to mapOf("registrationName" to "onClipState"))
}

/** The only media sources are two application resources. */
internal class ClipPlayerView(private val react: ThemedReactContext) : FrameLayout(react), LifecycleEventListener {
  var clipId = ""
  var requestKey = ""
  var playing = false
  private var attemptedKey: String? = null
  private var loadedId: String? = null
  private var video: VideoView? = null
  private var phase: String? = null
  private var prepared = false
  private var suspended = false
  private var disposed = false
  init { setBackgroundColor(Color.BLACK); react.addLifecycleEventListener(this) }

  private fun active() = !disposed && !suspended && isAttachedToWindow && hasWindowFocus() && windowVisibility == View.VISIBLE

  fun update() {
    if (!active()) return
    if (video != null && (attemptedKey != requestKey || loadedId != clipId)) clear()
    if (video != null) { applyPlayback(); return }
    if (!playing || attemptedKey == requestKey || !Regex("[A-Za-z0-9_-]{1,128}").matches(requestKey)) return
    val resource = when (clipId) {
      "how-a-circle-works" -> R.raw.soe_circle_intro
      "night-sky-traffic" -> R.raw.soe_night_sky
      "telescope-first-tilt" -> R.raw.soe_elt_tilt
      else -> null
    }
    attemptedKey = requestKey
    if (resource == null) { emit("unavailable"); return }
    val key = requestKey
    val player = VideoView(context)
    loadedId = clipId
    video = player
    fun current() = active() && video === player && requestKey == key && loadedId == clipId
    player.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    player.setOnPreparedListener { media ->
      if (current()) {
        media.setVolume(0f, 0f)
        prepared = true
        applyPlayback()
      }
    }
    player.setOnCompletionListener { if (current()) emit("ended") }
    player.setOnErrorListener { _, _, _ ->
      if (current()) { clear(); emit("unavailable") }
      true
    }
    addView(player, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT, Gravity.CENTER))
    emit("loading")
    try { player.setVideoURI(Uri.parse("android.resource://" + context.packageName + "/" + resource)) }
    catch (_: RuntimeException) { clear(); emit("unavailable") }
  }

  private fun applyPlayback() {
    val player = video ?: return
    if (!prepared || phase == "ended") return
    try {
      if (playing) player.start() else player.pause()
      emit(if (playing) "playing" else "paused")
    } catch (_: RuntimeException) { clear(); emit("unavailable") }
  }
  private fun emit(value: String) {
    if (phase == value || id == View.NO_ID) return
    phase = value
    val payload = Arguments.createMap().apply { putString("requestKey", requestKey); putString("phase", value) }
    val surface = UIManagerHelper.getSurfaceId(react)
    UIManagerHelper.getEventDispatcherForReactTag(react, id)?.dispatchEvent(ClipEvent(surface, id, payload))
  }
  private fun clear() {
    val previous = video
    video = null; loadedId = null; prepared = false; phase = null
    if (previous != null) {
      previous.setOnPreparedListener(null); previous.setOnCompletionListener(null); previous.setOnErrorListener(null)
      try { previous.stopPlayback() } catch (_: RuntimeException) { /* Remove an already-failed player too. */ }
      removeView(previous)
    }
  }
  private fun retire(notify: Boolean) {
    val hadPlayer = video != null
    if (requestKey.isNotEmpty()) attemptedKey = requestKey
    clear()
    if (notify && hadPlayer) emit("unavailable")
  }
  override fun onHostPause() { suspended = true; retire(true) }
  override fun onHostResume() { suspended = false }
  override fun onHostDestroy() { dispose() }
  override fun onAttachedToWindow() { super.onAttachedToWindow(); update() }
  override fun onDetachedFromWindow() { retire(true); super.onDetachedFromWindow() }
  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (hasWindowFocus) update() else retire(true)
  }
  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    if (visibility != View.VISIBLE) retire(true)
  }
  fun dispose() { if (!disposed) { disposed = true; retire(false); react.removeLifecycleEventListener(this) } }
}

private class ClipEvent(surface: Int, tag: Int, private val payload: com.facebook.react.bridge.WritableMap) : Event<ClipEvent>(surface, tag) {
  override fun getEventName() = "topClipState"
  override fun getEventData() = payload
  override fun canCoalesce() = false
}
