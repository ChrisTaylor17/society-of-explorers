package com.anonymous.soesyntheticdemo.member

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import okhttp3.Authenticator
import okhttp3.Call
import okhttp3.Callback
import okhttp3.CookieJar
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.UUID
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Dedicated client, never the RN global client or the synthetic HTTP policy. */
internal class MemberTransport(private val config: MemberConfig, private val store: MemberSecureStore) {
  data class Input(val url: String, val method: String, val bearer: String, val body: String?)
  data class Result(val status: Int, val url: String, val body: String)
  private class Handle(val generation: String, val deadline: Long) {
    var consumed = false
    var call: Call? = null
    var expiry: ScheduledFuture<*>? = null
    var cancelled: (() -> Unit)? = null
  }
  private class Transmission { val sent = AtomicBoolean(false) }
  private val lock = Any()
  private val handles = mutableMapOf<String, Handle>()
  private var closed = false
  private val timer = ScheduledThreadPoolExecutor(1).apply { removeOnCancelPolicy = true }
  private val client = OkHttpClient.Builder()
    .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
    .authenticator(Authenticator.NONE).proxyAuthenticator(Authenticator.NONE)
    .cookieJar(CookieJar.NO_COOKIES).cache(null)
    // Also block HTTP follow-ups (e.g. a 503 Retry-After:0), independent of the
    // client's connection-retry flag. Never authorize a second HTTP exchange.
    .addNetworkInterceptor { chain ->
      val transmission = chain.request().tag(Transmission::class.java)
      if (transmission == null || !transmission.sent.compareAndSet(false, true)) throw IOException("Native member service unavailable")
      chain.proceed(chain.request())
    }
    .connectTimeout(5, TimeUnit.SECONDS).readTimeout(10, TimeUnit.SECONDS).writeTimeout(10, TimeUnit.SECONDS)
    .callTimeout(15, TimeUnit.SECONDS).build()
  private val offReset = store.onRetirement { cancelAll() }

  fun begin(generation: String): String = store.withGeneration(generation) {
    synchronized(lock) {
      require(!closed && handles.size < 32)
      val id = UUID.randomUUID().toString()
      val handle = Handle(generation, System.nanoTime() + TimeUnit.SECONDS.toNanos(15))
      handles[id] = handle
      handle.expiry = timer.schedule({ cancel(id) }, 15, TimeUnit.SECONDS)
      id
    }
  }
  fun send(id: String, input: Input, success: (Result) -> Unit, failure: () -> Unit) {
    try {
      validate(input)
      val generation = synchronized(lock) { require(!closed); handles[id]?.generation ?: throw IllegalStateException() }
      store.withGeneration(generation) {
        synchronized(lock) {
          val handle = handles[id] ?: throw IllegalStateException()
          require(!closed && !handle.consumed && handle.generation == generation && System.nanoTime() < handle.deadline)
          // A handle is consumed once even if construction, transmission or receipt fails.
          handle.consumed = true; handle.cancelled = failure
          val builder = Request.Builder().url(input.url).header("Authorization", "Bearer " + input.bearer)
            .header("Cache-Control", "no-store").header("Pragma", "no-cache")
            .tag(Transmission::class.java, Transmission())
          if (input.method == "GET") builder.get()
          else builder.post(input.body!!.toRequestBody("application/json".toMediaType()))
          val call = client.newCall(builder.build()); handle.call = call
          call.timeout().deadlineNanoTime(handle.deadline)
          require(System.nanoTime() < handle.deadline)
          // Still inside the generation lock: reset cannot commit between this check and enqueue.
          call.enqueue(object : Callback {
            override fun onFailure(call: Call, error: IOException) { finish(id); failure() }
            override fun onResponse(call: Call, response: Response) {
              try {
                val result = response.use {
                  require(it.code in 100..599 && it.code !in 300..399 && it.request.url.toString() == input.url)
                  val body = it.body ?: throw IllegalStateException()
                  require(body.contentLength() <= MAX_RESPONSE)
                  val bytes = body.byteStream().use { stream ->
                    val output = ByteArrayOutputStream(); val buffer = ByteArray(8192)
                    while (true) { val count = stream.read(buffer); if (count < 0) break; require(output.size() + count <= MAX_RESPONSE); output.write(buffer, 0, count) }
                    output.toByteArray()
                  }
                  val text = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
                  Result(it.code, input.url, text)
                }
                store.withGeneration(generation) {
                  synchronized(lock) {
                    require(!closed && handles[id] === handle && System.nanoTime() < handle.deadline)
                    finish(id); success(result)
                  }
                }
              } catch (_: Exception) { finish(id); failure() }
            }
          })
        }
      }
    } catch (_: Exception) { cancel(id); failure() }
  }
  fun cancel(id: String) {
    val handle = synchronized(lock) { handles.remove(id) } ?: return
    handle.expiry?.cancel(false); handle.call?.cancel(); handle.cancelled?.invoke()
  }
  private fun finish(id: String) { synchronized(lock) { handles.remove(id)?.expiry?.cancel(false) } }
  private fun cancelAll() { val ids = synchronized(lock) { handles.keys.toList() }; ids.forEach { cancel(it) } }
  fun close() {
    synchronized(lock) { closed = true }
    cancelAll(); offReset(); timer.shutdownNow()
    client.dispatcher.executorService.shutdown(); client.connectionPool.evictAll()
  }
  private fun validate(input: Input) {
    require(Regex("[A-Za-z0-9._~+/-]+=*").matches(input.bearer) && input.bearer.length <= 16384)
    require(input.method in setOf("GET", "POST"))
    val url = input.url.toHttpUrl()
    val origin = "https://" + url.host + if (url.port == 443) "" else ":" + url.port
    require(url.scheme == "https" && origin == config.origin && url.username.isEmpty() && url.password.isEmpty() && url.fragment == null && url.toString() == input.url)
    val legacy = Regex("/api/book-salons/([0-9a-fA-F-]{36})").matchEntire(url.encodedPath)
    val discussion = Regex("/api/circles/([0-9a-fA-F-]{36})/discussion").matchEntire(url.encodedPath)
    val preview = Regex("/api/circles/([0-9a-fA-F-]{36})/discussion/preview").matchEntire(url.encodedPath)
    val messageAction = Regex("/api/circles/([0-9a-fA-F-]{36})/messages/([0-9a-fA-F-]{36})").matchEntire(url.encodedPath)
    if (url.encodedPath == "/api/auth/member") { require(input.method == "GET" && url.encodedQuery == null) }
    else if (url.encodedPath == "/api/auth/ensure-member") { require(input.method == "POST" && url.encodedQuery == null) }
    else if (url.encodedPath == "/api/circles/contributions") {
      require(input.method == "GET")
      val query = mutableMapOf<String, String>()
      if (url.encodedQuery != null) for (part in url.encodedQuery!!.split('&')) {
        val pieces = part.split('='); require(pieces.size == 2 && pieces[0] !in query); query[pieces[0]] = pieces[1]
      }
      require(query.keys.all { it == "after" })
      query["after"]?.let { require(uuid(it)) }
    }
    else if (legacy != null) { require(uuid(legacy.groupValues[1]) && url.encodedQuery == null) }
    else if (preview != null) { require(uuid(preview.groupValues[1]) && input.method == "POST" && url.encodedQuery == null) }
    else if (discussion != null && input.method == "POST") { require(uuid(discussion.groupValues[1]) && url.encodedQuery == null) }
    else if (messageAction != null) { require(uuid(messageAction.groupValues[1]) && uuid(messageAction.groupValues[2]) && url.encodedQuery == null) }
    else {
      require(discussion != null && uuid(discussion.groupValues[1]) && input.method == "GET")
      val query = mutableMapOf<String, String>()
      if (url.encodedQuery != null) for (part in url.encodedQuery!!.split('&')) {
        val pieces = part.split('='); require(pieces.size == 2 && pieces[0] !in query); query[pieces[0]] = pieces[1]
      }
      val keys = if ("requestId" in query) { require(query.size == 1); setOf("requestId") }
        else if ("message" in query) setOf("message", "after", "limit") else setOf("before", "limit")
      require(query.keys.all { it in keys })
      require(query.filterKeys { it != "limit" }.values.all { uuid(it) })
      query["limit"]?.let { require(Regex("[1-9][0-9]*").matches(it) && (it.toIntOrNull() ?: 0) in 1..25) }
    }
    if (input.method == "GET") require(input.body == null)
    else require(input.body != null && input.body.toByteArray(Charsets.UTF_8).size <= 16384)
  }
  companion object {
    private const val MAX_RESPONSE = 1048576
    private fun uuid(value: String) = MemberConfig.UUID_PATTERN.matches(value.lowercase())
    fun input(value: ReadableMap): Input {
      val keys = value.keySetIterator(); val names = mutableSetOf<String>()
      while (keys.hasNextKey()) names.add(keys.nextKey())
      require(names == setOf("url", "method", "bearer") || names == setOf("url", "method", "bearer", "body"))
      for (key in names) require(value.getType(key) == ReadableType.String)
      return Input(value.getString("url")!!, value.getString("method")!!, value.getString("bearer")!!,
        if (value.hasKey("body")) value.getString("body") else null)
    }
  }
}
