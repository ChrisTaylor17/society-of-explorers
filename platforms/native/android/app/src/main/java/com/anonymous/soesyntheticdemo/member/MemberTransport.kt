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
import java.net.URLDecoder
import java.net.URLEncoder
import java.util.UUID
import org.json.JSONObject
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Dedicated client, never the RN global client or the synthetic HTTP policy. */
internal class MemberTransport(private val config: MemberConfig, private val store: MemberSecureStore) {
  data class Input(val url: String, val method: String, val bearer: String, val body: String?)
  data class AuthInput(val url: String, val method: String, val bearer: String?, val body: String?)
  data class PublicInput(val url: String, val method: String)
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
    try { validate(input); transmit(id, input.url, input.method, input.body, mapOf("Authorization" to "Bearer " + input.bearer), success, failure) }
    catch (_: Exception) { cancel(id); failure() }
  }
  fun sendAuth(id: String, input: AuthInput, success: (Result) -> Unit, failure: () -> Unit) {
    try {
      validateAuth(input)
      transmit(id, input.url, input.method, input.body, mapOf("apikey" to config.publishableKey,
        "Authorization" to "Bearer " + (input.bearer ?: config.publishableKey), "X-Supabase-Api-Version" to "2024-01-01"), success, failure)
    } catch (_: Exception) { cancel(id); failure() }
  }
  fun sendPublic(id: String, input: PublicInput, success: (Result) -> Unit, failure: () -> Unit) {
    try { validatePublic(input); transmit(id, input.url, "GET", null, emptyMap(), success, failure) }
    catch (_: Exception) { cancel(id); failure() }
  }
  private fun transmit(id: String, url: String, method: String, body: String?, headers: Map<String, String>, success: (Result) -> Unit, failure: () -> Unit) {
    try {
      val generation = synchronized(lock) { require(!closed); handles[id]?.generation ?: throw IllegalStateException() }
      store.withGeneration(generation) {
        synchronized(lock) {
          val handle = handles[id] ?: throw IllegalStateException()
          require(!closed && !handle.consumed && handle.generation == generation && System.nanoTime() < handle.deadline)
          // A handle is consumed once even if construction, transmission or receipt fails.
          handle.consumed = true; handle.cancelled = failure
          val builder = Request.Builder().url(url).apply { headers.forEach { (name, value) -> header(name, value) } }
            .header("Cache-Control", "no-store").header("Pragma", "no-cache")
            .tag(Transmission::class.java, Transmission())
          if (method == "GET") builder.get()
          else builder.post((body ?: "").toRequestBody("application/json".toMediaType()))
          val call = client.newCall(builder.build()); handle.call = call
          call.timeout().deadlineNanoTime(handle.deadline)
          require(System.nanoTime() < handle.deadline)
          // Still inside the generation lock: reset cannot commit between this check and enqueue.
          call.enqueue(object : Callback {
            override fun onFailure(call: Call, error: IOException) { finish(id); failure() }
            override fun onResponse(call: Call, response: Response) {
              try {
                val result = response.use {
                  require(it.code in 100..599 && it.code !in 300..399 && it.request.url.toString() == url)
                  val body = it.body ?: throw IllegalStateException()
                  require(body.contentLength() <= MAX_RESPONSE)
                  val bytes = body.byteStream().use { stream ->
                    val output = ByteArrayOutputStream(); val buffer = ByteArray(8192)
                    while (true) { val count = stream.read(buffer); if (count < 0) break; require(output.size() + count <= MAX_RESPONSE); output.write(buffer, 0, count) }
                    output.toByteArray()
                  }
                  val text = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
                  Result(it.code, url, text)
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
  /** Independent provider allowlist; no public/member path reaches this channel. */
  private fun validateAuth(input: AuthInput) {
    require(config.providerOrigin.isNotEmpty() && Regex("sb_publishable_[A-Za-z0-9_-]{20,200}").matches(config.publishableKey))
    val url = input.url.toHttpUrl()
    val origin = "https://" + url.host + if (url.port == 443) "" else ":" + url.port
    require(url.scheme == "https" && origin == config.providerOrigin && url.username.isEmpty() && url.password.isEmpty() && url.fragment == null && url.toString() == input.url)
    val endpoint = input.url.removePrefix(config.providerOrigin)
    val operation = when {
      input.method == "POST" && endpoint == "/auth/v1/token?grant_type=password" -> "password"
      input.method == "POST" && endpoint == "/auth/v1/token?grant_type=refresh_token" -> "refresh"
      input.method == "GET" && endpoint == "/auth/v1/user" -> "user"
      input.method == "POST" && endpoint == "/auth/v1/logout?scope=local" -> "logout"
      else -> throw IllegalArgumentException()
    }
    if (operation == "user" || operation == "logout") require(input.bearer != null && input.bearer != config.publishableKey && input.bearer.length <= 16384 && Regex("[A-Za-z0-9._~+/-]+=*").matches(input.bearer))
    else require(input.bearer == null)
    if (operation == "user" || operation == "logout") require(input.body == null)
    else {
      val body = input.body ?: throw IllegalArgumentException()
      require(body.toByteArray(Charsets.UTF_8).size <= 16384); MemberConfig.value(body)
      val parsed = JSONObject(body); val keys = parsed.keys().asSequence().toSet()
      if (operation == "password") {
        require(keys == setOf("email", "password") || keys == setOf("email", "password", "gotrue_meta_security"))
        require(parsed.get("email") is String && parsed.get("password") is String)
        val email = parsed.getString("email"); val password = parsed.getString("password")
        require(authText(email, 320) && Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+").matches(email) && authText(password, 4096))
        if (parsed.has("gotrue_meta_security")) require(parsed.get("gotrue_meta_security") is JSONObject && parsed.getJSONObject("gotrue_meta_security").length() == 0)
      } else {
        require(keys == setOf("refresh_token") && parsed.get("refresh_token") is String)
        val token = parsed.getString("refresh_token")
        require(token.length in 1..16384 && Regex("[A-Za-z0-9._~+/-]+=*").matches(token))
      }
    }
  }
  private fun authText(value: String, maximum: Int): Boolean {
    MemberConfig.value(value)
    return value.isNotEmpty() && value.toByteArray(Charsets.UTF_8).size <= maximum && value.none { it.code < 32 || it.code == 127 }
  }
  /** Public wire policy. The JS/server parsers additionally verify the pinned
   * book/edition registry and actual range; a public cursor grants no access. */
  private fun validatePublic(input: PublicInput) {
    require(input.method == "GET")
    val url = input.url.toHttpUrl()
    val origin = "https://" + url.host + if (url.port == 443) "" else ":" + url.port
    require(url.scheme == "https" && origin == config.origin && url.username.isEmpty() && url.password.isEmpty()
      && url.fragment == null && url.toString() == input.url && url.encodedPath == "/api/circles")
    val order = listOf("book", "edition", "from", "to", "q", "city", "format", "open", "sort", "limit", "cursor")
    val query = linkedMapOf<String, String>()
    if (url.encodedQuery != null) for (part in url.encodedQuery!!.split('&')) {
      val pair = part.split('='); require(pair.size == 2 && pair[0] in order && pair[0] !in query)
      val value = URLDecoder.decode(pair[1], "UTF-8")
      MemberConfig.value(value)
      require(URLEncoder.encode(value, "UTF-8") == pair[1])
      query[pair[0]] = value
    }
    require(query.keys.toList() == order.filter { it in query })
    for (key in listOf("q", "city")) query[key]?.let {
      require(it.isNotEmpty() && it.length <= if (key == "q") 160 else 80)
      require(it.none { c -> c.code < 32 || c.code == 127 })
      require(it == it.replace(Regex("[\\u0020\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+"), " ").trim())
    }
    query["format"]?.let { require(it in setOf("in_person", "online")) }
    query["open"]?.let { require(it == "1") }
    query["sort"]?.let { require(it == "title") }
    query["limit"]?.let { require(Regex("[1-9][0-9]*").matches(it) && (it.toIntOrNull() ?: 0) in 1..24) }
    query["cursor"]?.let { require(Regex("[A-Za-z0-9_-]{1,4096}").matches(it)) }
    if (listOf("book", "edition", "from", "to").any { it in query }) {
      require(query["book"]?.let { Regex("[a-z0-9][a-z0-9-]{0,159}").matches(it) } == true)
      require(query["edition"]?.let { Regex("pg-[1-9][0-9]{0,9}-[a-f0-9]{64}").matches(it) } == true)
      if ("from" in query || "to" in query) {
        for (key in listOf("from", "to")) require(query[key]?.let { Regex("0|[1-9][0-9]{0,5}").matches(it) } == true)
        require(query["from"]!!.toInt() <= query["to"]!!.toInt())
      }
    }
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
    val detail = Regex("/api/circles/([0-9a-fA-F-]{36})(?:/membership)?").matchEntire(url.encodedPath)
    val participation = Regex("/api/circles/([0-9a-fA-F-]{36})/(join|leave)").matchEntire(url.encodedPath)
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
    else if (url.encodedPath == "/api/circles/mine") {
      require(input.method == "GET")
      val query = url.encodedQuery
      if (query != null) require(query.startsWith("after=") && uuid(query.removePrefix("after=")))
    }
    else if (detail != null) { require(uuid(detail.groupValues[1]) && input.method == "GET" && url.encodedQuery == null) }
    else if (participation != null) {
      require(uuid(participation.groupValues[1]) && input.method == "POST" && url.encodedQuery == null)
      val body = input.body ?: throw IllegalArgumentException()
      require(body.toByteArray(Charsets.UTF_8).size <= 256)
      val parsed = JSONObject(body)
      require(parsed.length() == 2 && parsed.has("requestId") && parsed.has("expectedRevision"))
      val requestId = parsed.get("requestId"); val revision = parsed.get("expectedRevision")
      require(requestId is String && uuid(requestId) && (revision is Int || revision is Long))
      val version = (revision as Number).toLong(); require(version in 0..9007199254740991L)
      require(body == "{\"requestId\":\"$requestId\",\"expectedRevision\":$version}"
        || body == "{\"expectedRevision\":$version,\"requestId\":\"$requestId\"}")
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
    fun publicInput(value: ReadableMap): PublicInput {
      val keys = value.keySetIterator(); val names = mutableSetOf<String>()
      while (keys.hasNextKey()) names.add(keys.nextKey())
      require(names == setOf("url", "method"))
      for (key in names) require(value.getType(key) == ReadableType.String)
      return PublicInput(value.getString("url")!!, value.getString("method")!!)
    }
    fun authInput(value: ReadableMap): AuthInput {
      val keys = value.keySetIterator(); val names = mutableSetOf<String>()
      while (keys.hasNextKey()) names.add(keys.nextKey())
      require(names.containsAll(setOf("url", "method")) && names.all { it in setOf("url", "method", "bearer", "body") })
      for (key in names) require(value.getType(key) == ReadableType.String)
      return AuthInput(value.getString("url")!!, value.getString("method")!!,
        if (value.hasKey("bearer")) value.getString("bearer") else null,
        if (value.hasKey("body")) value.getString("body") else null)
    }
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
