package com.anonymous.soesyntheticdemo.reader

import android.graphics.Color
import android.net.Uri
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event

/** No JavaScript interface, evaluator, arbitrary URL prop, cookie bridge or
 * external intent. Each selection owns a new WebView and binary resource session. */
internal class SourceReaderView(private val react: ThemedReactContext) : FrameLayout(react), LifecycleEventListener {
  var bookId = ""; var editionId = ""; var blockIndex = -1; var requestKey = ""
  var active = false
    set(value) { field = value; if (!value) retire(false) }
  private var disposed = false
  private var suspended = false
  @Volatile private var epoch = 0L
  private var attemptedKey: String? = null
  private var web: WebView? = null
  private var session: SourceReaderSession? = null
  private var identity: List<Any>? = null
  private var resourceReady = false
  private var targetUrl: String? = null
  private var targetIndex = -1
  private var readyKey: String? = null
  init { setBackgroundColor(Color.WHITE); react.addLifecycleEventListener(this) }

  fun update() {
    if (disposed || !active || suspended || !isAttachedToWindow || windowVisibility != View.VISIBLE) return
    val next = listOf(bookId, editionId)
    if (identity == next && web != null) {
      if (attemptedKey != requestKey) navigateSelection()
      else if (targetIndex != blockIndex) { retire(false); emit(requestKey, blockIndex, "unavailable") }
      return
    }
    retire(false)
    if (attemptedKey == requestKey) return
    attemptedKey = requestKey
    val captured = ++epoch; val key = requestKey; val index = blockIndex
    try {
      require(Regex("[A-Za-z0-9_-]{1,128}").matches(key))
      val edition = SourceReaderCatalog.edition(context, bookId, editionId)
      require(index in 0 until edition.blocks)
      val origin = SourceReaderCatalog.origin()
      val base = "https://reader.soe.invalid"; val page = base + edition.documentPath
      val current = { !disposed && active && !suspended && epoch == captured && identity == next }
      val fail = { post { if (current()) { retire(false); emit(requestKey, blockIndex, "unavailable") } }; Unit }
      val resourceSession = SourceReaderSession(edition, origin, fail)
      session = resourceSession; identity = next
      val view = WebView(context)
      web = view
      view.settings.apply {
        javaScriptEnabled = false; javaScriptCanOpenWindowsAutomatically = false
        allowFileAccess = false; allowContentAccess = false
        @Suppress("DEPRECATION") allowFileAccessFromFileURLs = false
        @Suppress("DEPRECATION") allowUniversalAccessFromFileURLs = false
        domStorageEnabled = false; databaseEnabled = false; setGeolocationEnabled(false)
        blockNetworkLoads = true; cacheMode = WebSettings.LOAD_NO_CACHE
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        setSupportMultipleWindows(false); useWideViewPort = true; loadWithOverviewMode = false
        setSupportZoom(true); builtInZoomControls = true; displayZoomControls = false
        mediaPlaybackRequiresUserGesture = true
      }
      CookieManager.getInstance().setAcceptThirdPartyCookies(view, false)
      view.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
      view.setDownloadListener { _, _, _, _, _ -> fail() }
      view.webChromeClient = WebChromeClient() // No permission, dialog, file chooser or popup grants.
      view.webViewClient = object : WebViewClient() {
        override fun shouldInterceptRequest(source: WebView, request: WebResourceRequest): WebResourceResponse {
          if (!current() || source !== view || request.method != "GET") return SourceReaderSession.denied()
          val url = request.url
          if (url.scheme != "https" || url.encodedAuthority != "reader.soe.invalid" || url.userInfo != null) return SourceReaderSession.denied()
          val path = (url.encodedPath ?: "") + (url.encodedQuery?.let { "?$it" } ?: "")
          if (path !in edition.resources || url.fragment != null && path != edition.documentPath) return SourceReaderSession.denied()
          return resourceSession.response(path)
        }
        override fun shouldOverrideUrlLoading(source: WebView, request: WebResourceRequest): Boolean {
          val raw = request.url.toString()
          return !current() || source !== view || request.method != "GET" || !request.isForMainFrame
            || raw.substringBefore('#') != page || request.url.fragment.isNullOrEmpty()
        }
        override fun onPageFinished(source: WebView, url: String) {
          if (current()) selectedReady(source, url)
        }
        override fun doUpdateVisitedHistory(source: WebView, url: String, isReload: Boolean) { if (current()) post { if (current()) selectedReady(source, url) } }
        override fun onReceivedError(source: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) { if (source === view) fail() }
        override fun onReceivedHttpError(source: WebView, request: WebResourceRequest, error: WebResourceResponse) { if (source === view) fail() }
        override fun onReceivedSslError(source: WebView, handler: android.webkit.SslErrorHandler, error: android.net.http.SslError) { handler.cancel(); fail() }
        override fun onRenderProcessGone(source: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean { fail(); return true }
      }
      addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
      targetUrl = page + "#" + Uri.encode(edition.anchor(index)); targetIndex = index; readyKey = null
      emit(key, index, "loading")
      // All packaged resources must verify before WebView can request any bytes.
      resourceSession.prepare { post { if (current() && web === view) { resourceReady = true; targetUrl?.let { view.loadUrl(it) } } } }
    } catch (_: Exception) { if (epoch == captured) { retire(false); emit(key, index, "unavailable") } }
  }
  private fun navigateSelection() {
    attemptedKey = requestKey
    try {
      require(Regex("[A-Za-z0-9_-]{1,128}").matches(requestKey))
      val edition = session?.edition ?: throw IllegalStateException()
      targetUrl = "https://reader.soe.invalid" + edition.documentPath + "#" + Uri.encode(edition.anchor(blockIndex))
      targetIndex = blockIndex
      readyKey = null; emit(requestKey, blockIndex, "loading")
      if (resourceReady) web?.loadUrl(targetUrl!!)
    } catch (_: Exception) { retire(false); emit(requestKey, blockIndex, "unavailable") }
  }
  private fun selectedReady(source: WebView, url: String) {
    if (source === web && active && !suspended && resourceReady && blockIndex == targetIndex && url == targetUrl && source.url == targetUrl && source.progress == 100 && readyKey != requestKey) {
      readyKey = requestKey; emit(requestKey, blockIndex, "ready")
    }
  }
  private fun emit(key: String, index: Int, phase: String) {
    if (disposed) return
    val payload = Arguments.createMap().apply { putString("requestKey", key); putString("phase", phase); putInt("blockIndex", index) }
    val surface = UIManagerHelper.getSurfaceId(this)
    UIManagerHelper.getEventDispatcherForReactTag(react, id)?.dispatchEvent(ReaderEvent(surface, id, payload))
  }
  private fun retire(notify: Boolean) {
    val hadView = web != null
    epoch++; session?.close(); session = null; identity = null; resourceReady = false; targetUrl = null; targetIndex = -1; readyKey = null
    val previous = web; web = null
    if (previous != null) {
      previous.stopLoading(); removeView(previous); previous.clearHistory(); previous.removeAllViews(); previous.destroy()
    }
    if (notify && hadView) emit(requestKey, blockIndex, "unavailable")
  }
  override fun onHostPause() { suspended = true; retire(true) }
  override fun onHostResume() { suspended = false } // Explicit new requestKey is required.
  override fun onHostDestroy() { dispose() }
  override fun onWindowVisibilityChanged(visibility: Int) { super.onWindowVisibilityChanged(visibility); if (visibility != View.VISIBLE) retire(true) }
  override fun onAttachedToWindow() { super.onAttachedToWindow(); update() }
  override fun onDetachedFromWindow() { retire(true); super.onDetachedFromWindow() }
  fun dispose() { if (disposed) return; retire(false); disposed = true; react.removeLifecycleEventListener(this) }
}

private class ReaderEvent(surface: Int, tag: Int, private val payload: com.facebook.react.bridge.WritableMap) : Event<ReaderEvent>(surface, tag) {
  override fun getEventName() = "topReaderState"
  override fun getEventData() = payload
  override fun canCoalesce() = false
}
