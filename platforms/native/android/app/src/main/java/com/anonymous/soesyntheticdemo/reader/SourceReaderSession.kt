package com.anonymous.soesyntheticdemo.reader

import android.webkit.WebResourceResponse
import okhttp3.Authenticator
import okhttp3.Call
import okhttp3.CookieJar
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayInputStream
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.concurrent.FutureTask
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicBoolean

/** A single view's anonymous binary resource session. WebView request headers
 * never enter this client; its responses never forward cookies or redirects. */
internal class SourceReaderSession(val edition: ReaderEdition, private val origin: String, private val failed: () -> Unit) {
  private class Once { val sent = AtomicBoolean(false) }
  private val lock = Any()
  private var closed = false
  private val calls = mutableSetOf<Call>()
  private val resources = mutableMapOf<String, FutureTask<ByteArray>>()
  private val workers = Executors.newFixedThreadPool(4)
  private val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(120)
  private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
    .cookieJar(CookieJar.NO_COOKIES).cache(null).authenticator(Authenticator.NONE).proxyAuthenticator(Authenticator.NONE)
    .addNetworkInterceptor { chain ->
      if (chain.request().tag(Once::class.java)?.sent?.compareAndSet(false, true) != true) throw IOException("Reader unavailable")
      chain.proceed(chain.request())
    }.connectTimeout(5, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).callTimeout(30, TimeUnit.SECONDS).build()

  fun prepare(ready: () -> Unit) {
    val remaining = AtomicInteger(edition.resources.size)
    for (resource in edition.resources.values) {
      val task = FutureTask { fetch(resource) }
      synchronized(lock) { check(!closed); resources[resource.path] = task }
      workers.execute {
        try {
          task.run(); task.get()
          if (remaining.decrementAndGet() == 0) synchronized(lock) { check(!closed); ready() }
        } catch (_: Exception) { close(); failed() }
      }
    }
  }
  fun response(path: String): WebResourceResponse {
    try {
      val resource = edition.resources[path] ?: return denied()
      val task = synchronized(lock) { check(!closed); resources[path] ?: throw IOException() }
      check(task.isDone)
      val bytes = task.get()
      synchronized(lock) { check(!closed) }
      return WebResourceResponse(resource.mime, if (resource.mime == "text/html") "UTF-8" else null, 200, "OK", mapOf(
        "Cache-Control" to "no-store", "Referrer-Policy" to "no-referrer", "X-Content-Type-Options" to "nosniff",
        "Content-Security-Policy" to "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
      ), ByteArrayInputStream(bytes))
    } catch (_: Exception) { close(); failed(); return denied() }
  }
  private fun fetch(resource: ReaderResource): ByteArray {
    // Concurrent and repeated image references share one FutureTask, including
    // failure; they never grant a second HTTP exchange in this view lifetime.
    val call = synchronized(lock) {
      check(!closed && calls.size < 4 && System.nanoTime() < deadline)
      client.newCall(Request.Builder().url(origin + resource.path).get().header("Cache-Control", "no-store")
        .header("Pragma", "no-cache").header("Accept-Encoding", "identity").tag(Once::class.java, Once()).build()).also { it.timeout().deadlineNanoTime(deadline); calls.add(it) }
    }
    try {
      val bytes = call.execute().use { response ->
        require(response.code == 200 && response.request.url.toString() == origin + resource.path && response.priorResponse == null)
        require(response.header("Content-Encoding") == null || response.header("Content-Encoding") == "identity")
        val body = response.body ?: throw IOException()
        require(body.contentType()?.toString()?.substringBefore(';')?.trim() == resource.mime)
        require(body.contentLength() == -1L || body.contentLength() == resource.bytes.toLong())
        val data = body.byteStream().use { it.readBytesBounded(resource.bytes) }
        require(data.size == resource.bytes && SourceReaderCatalog.sha(data) == resource.sha)
        data
      }
      synchronized(lock) { check(!closed) }
      return bytes
    } finally { synchronized(lock) { calls.remove(call) } }
  }
  fun close() {
    val pending = synchronized(lock) { if (closed) return; closed = true; resources.values.forEach { it.cancel(true) }; resources.clear(); calls.toList().also { calls.clear() } }
    pending.forEach { it.cancel() }; workers.shutdownNow(); client.dispatcher.executorService.shutdown(); client.connectionPool.evictAll()
  }
  companion object {
    fun denied() = WebResourceResponse("text/plain", "UTF-8", 403, "Unavailable", mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(ByteArray(0)))
  }
}
