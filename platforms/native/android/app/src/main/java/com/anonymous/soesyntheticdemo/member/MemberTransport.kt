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
import org.json.JSONArray
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
  fun sendReview(id: String, input: Input, success: (Result) -> Unit, failure: () -> Unit) {
    try { validateReview(input); transmit(id, input.url, input.method, input.body, mapOf("Authorization" to "Bearer " + input.bearer), success, failure) }
    catch (_: Exception) { cancel(id); failure() }
  }
  fun sendCircleReview(id: String, input: Input, success: (Result) -> Unit, failure: () -> Unit) {
    try { validateCircleReview(input); transmit(id, input.url, input.method, input.body, mapOf("Authorization" to "Bearer " + input.bearer), success, failure) }
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
  fun sendEmailAuth(id: String, input: EmailLinkSession.Input, session: EmailLinkSession, epoch: Long, success: (Result) -> Unit, failure: () -> Unit) {
    var permit: EmailLinkSession.Permit? = null
    val failed = { session.failed(id, permit); failure() }
    try {
      val generation = synchronized(lock) { require(!closed); handles[id]?.generation ?: throw IllegalStateException() }
      session.dispatch(id, generation, epoch, input, { cancel(id) }) { authorized ->
        permit = authorized
        transmit(id, input.url, input.method, input.body, mapOf("apikey" to config.publishableKey,
          "Authorization" to "Bearer " + (input.bearer ?: config.publishableKey), "X-Supabase-Api-Version" to "2024-01-01"), { result ->
          try { session.receive(id, authorized, result); success(result) } catch (_: Exception) { failed() }
        }, failed)
      }
    } catch (_: Exception) { cancel(id); failed() }
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
          else if (method == "PUT") builder.put((body ?: "").toRequestBody("application/json".toMediaType()))
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
  /** Reviewer endpoints have a separate native entry. Ordinary member requests
   * cannot acquire this lane; server assignment/conflict checks remain authoritative. */
  private fun validateReview(input: Input) {
    require(Regex("[A-Za-z0-9._~+/-]+=*").matches(input.bearer) && input.bearer.length <= 16384)
    require(input.method in setOf("GET", "POST"))
    val url = input.url.toHttpUrl()
    val origin = "https://" + url.host + if (url.port == 443) "" else ":" + url.port
    require(url.scheme == "https" && origin == config.origin && url.username.isEmpty() && url.password.isEmpty() && url.fragment == null && url.toString() == input.url)
    if (url.encodedPath == "/api/admin/circles/messages") {
      require(input.method == "GET")
      url.encodedQuery?.let { require(it.startsWith("after=") && reviewUuid(it.removePrefix("after="))) }
    } else {
      val target = Regex("/api/admin/circles/([0-9a-f-]{36})/messages/([0-9a-f-]{36})(/coverage/decision|/coverage|/advice)?").matchEntire(url.encodedPath)
        ?: throw IllegalArgumentException()
      require(reviewUuid(target.groupValues[1]) && reviewUuid(target.groupValues[2]))
      val suffix = target.groupValues[3]
      if (suffix == "/coverage" && input.method == "GET") {
        val query = Regex("sessionId=([0-9a-f-]{36})(?:&page=([1-9][0-9]{0,7}))?").matchEntire(url.encodedQuery ?: "")
          ?: throw IllegalArgumentException()
        require(reviewUuid(query.groupValues[1]))
        if (query.groupValues[2].isNotEmpty()) require((query.groupValues[2].toIntOrNull() ?: 0) in 1..42949673)
      } else {
        require(url.encodedQuery == null)
        if (suffix.isNotEmpty()) require(input.method == "POST")
        if (input.method == "POST") validateReviewBody(input.body ?: throw IllegalArgumentException(), suffix)
      }
    }
    if (input.method == "GET") require(input.body == null)
    else require(input.body != null && input.body.toByteArray(Charsets.UTF_8).size <= 12000)
  }
  /** Listing review has its own entry and allowlist; message review never accepts it. */
  private fun validateCircleReview(input: Input) {
    require(Regex("[A-Za-z0-9._~+/-]+=*").matches(input.bearer) && input.bearer.length <= 16384)
    require(input.method in setOf("GET", "POST"))
    val url = input.url.toHttpUrl()
    val origin = "https://" + url.host + if (url.port == 443) "" else ":" + url.port
    require(url.scheme == "https" && origin == config.origin && url.username.isEmpty() && url.password.isEmpty() && url.fragment == null && url.toString() == input.url)
    if (url.encodedPath == "/api/admin/circles/reports") {
      require(input.method == "GET")
      url.encodedQuery?.let { require(it.startsWith("after=") && reviewUuid(it.removePrefix("after="))) }
    } else {
      val target = Regex("/api/admin/circles/reports/([0-9a-f-]{36})(/coverage/decision|/coverage)?").matchEntire(url.encodedPath)
        ?: throw IllegalArgumentException()
      require(reviewUuid(target.groupValues[1]))
      val suffix = target.groupValues[2]
      if (suffix == "/coverage" && input.method == "GET") {
        val query = Regex("sessionId=([0-9a-f-]{36})(?:&page=([1-9][0-9]{0,7}))?").matchEntire(url.encodedQuery ?: "")
          ?: throw IllegalArgumentException()
        require(reviewUuid(query.groupValues[1]))
        if (query.groupValues[2].isNotEmpty()) require((query.groupValues[2].toIntOrNull() ?: 0) in 1..42949673)
      } else {
        require(url.encodedQuery == null)
        if (suffix.isNotEmpty()) require(input.method == "POST")
        if (input.method == "POST") validateCircleReviewBody(input.body ?: throw IllegalArgumentException(), suffix)
      }
    }
    if (input.method == "GET") require(input.body == null)
    else require(input.body != null && input.body.toByteArray(Charsets.UTF_8).size <= 12000)
  }
  private fun reviewUuid(value: String) = uuid(value) && value == value.lowercase()
  private fun reviewRevision(value: Any): Long {
    require(value is Int || value is Long)
    return (value as Number).toLong().also { require(it in 0..9007199254740991L) }
  }
  private fun reviewText(value: String, minimum: Int, maximum: Int) {
    require(value.length in minimum..maximum)
    require(value == value.trim { it in '\u0009'..'\u000d' || it == '\u0020' || it == '\u00a0' || it == '\u1680' || it in '\u2000'..'\u200a' || it == '\u2028' || it == '\u2029' || it == '\u202f' || it == '\u205f' || it == '\u3000' || it == '\ufeff' })
    for (index in value.indices) {
      val c = value[index]
      require(c.code != 127 && (c.code >= 32 || c in listOf('\t', '\n', '\r')))
      if (c in '\ud800'..'\udbff') require(index + 1 < value.length && value[index + 1] in '\udc00'..'\udfff')
      if (c in '\udc00'..'\udfff') require(index > 0 && value[index - 1] in '\ud800'..'\udbff')
    }
  }
  private fun validateReviewBody(body: String, suffix: String) {
    require(body.toByteArray(Charsets.UTF_8).size <= 12000)
    val value = JSONObject(body)
    val keys = value.keys().asSequence().toSet()
    if (suffix == "/coverage" && value.opt("action") == "ack") {
      require(keys == setOf("action", "sessionId", "pageToken"))
      val session = value.get("sessionId"); val page = value.get("pageToken")
      require(session is String && reviewUuid(session) && page is String && reviewUuid(page))
      require(body == "{\"action\":\"ack\",\"sessionId\":\"$session\",\"pageToken\":\"$page\"}")
      return
    }
    val revision = reviewRevision(value.get("expectedRevision")); val hash = value.get("contentHash")
    require(hash is String && Regex("[a-f0-9]{64}").matches(hash))
    if (suffix == "/advice") {
      require(keys == setOf("expectedRevision", "contentHash"))
      require(body == "{\"expectedRevision\":$revision,\"contentHash\":\"$hash\"}")
      return
    }
    if (suffix == "/coverage") {
      require(keys == setOf("action", "expectedRevision", "contentHash") && value.get("action") == "start")
      require(body == "{\"action\":\"start\",\"expectedRevision\":$revision,\"contentHash\":\"$hash\"}")
      return
    }
    require(suffix == "" || suffix == "/coverage/decision")
    val expected = setOf("expectedRevision", "contentHash", "requestId", "action", "reason", "summary", "evidenceReportId", "evidenceExcerpt")
    require(keys == if (suffix.isEmpty()) expected else expected + "sessionId")
    val requestId = value.get("requestId"); val action = value.get("action"); val reason = value.get("reason"); val summary = value.get("summary")
    require(requestId is String && reviewUuid(requestId) && summary is String && action is String && reason is String)
    reviewText(summary, 20, 1000)
    val evidenceId = value.get("evidenceReportId"); val excerpt = value.get("evidenceExcerpt")
    require(evidenceId === JSONObject.NULL || evidenceId is String && reviewUuid(evidenceId))
    if (action == "hide") {
      require(reason in setOf("safety", "harassment", "spam", "misleading", "inappropriate") && excerpt is String)
      reviewText(excerpt, 5, 500)
    } else require(action == "restore" && reason in setOf("no_violation", "insufficient_evidence", "resolved") && evidenceId === JSONObject.NULL && excerpt === JSONObject.NULL)
    val evidenceWire = if (evidenceId === JSONObject.NULL) "null" else profileQuote(evidenceId as String)
    val excerptWire = if (excerpt === JSONObject.NULL) "null" else profileQuote(excerpt as String)
    val prefix = "{\"expectedRevision\":$revision,\"contentHash\":\"$hash\",\"requestId\":\"$requestId\",\"action\":\"$action\",\"reason\":\"$reason\",\"summary\":" + profileQuote(summary) + ",\"evidenceReportId\":" + evidenceWire + ",\"evidenceExcerpt\":" + excerptWire
    val canonical = if (suffix.isEmpty()) prefix + "}" else {
      val session = value.get("sessionId"); require(session is String && reviewUuid(session))
      prefix + ",\"sessionId\":\"$session\"}"
    }
    require(body == canonical)
  }
  private fun validateCircleReviewBody(body: String, suffix: String) {
    require(body.toByteArray(Charsets.UTF_8).size <= 12000)
    val value = JSONObject(body)
    val keys = value.keys().asSequence().toSet()
    if (suffix == "/coverage" && value.opt("action") == "ack") {
      require(keys == setOf("action", "sessionId", "pageToken"))
      val session = value.get("sessionId"); val page = value.get("pageToken")
      require(session is String && reviewUuid(session) && page is String && reviewUuid(page))
      require(body == "{\"action\":\"ack\",\"sessionId\":\"$session\",\"pageToken\":\"$page\"}")
      return
    }
    val revision = reviewRevision(value.get("expectedRevision"))
    if (suffix == "/coverage") {
      require(keys == setOf("action", "expectedRevision", "contentHash") && value.get("action") == "start" && value.get("contentHash") === JSONObject.NULL)
      require(body == "{\"action\":\"start\",\"expectedRevision\":$revision,\"contentHash\":null}")
      return
    }
    require(suffix == "" || suffix == "/coverage/decision")
    val expected = setOf("expectedRevision", "requestId", "action", "reason", "summary", "evidenceReportId", "evidenceExcerpt")
    require(keys == if (suffix.isEmpty()) expected else expected + "sessionId")
    val requestId = value.get("requestId"); val action = value.get("action"); val reason = value.get("reason"); val summary = value.get("summary")
    require(requestId is String && reviewUuid(requestId) && summary is String && action is String && reason is String)
    reviewText(summary, 20, 1000)
    val evidenceId = value.get("evidenceReportId"); val excerpt = value.get("evidenceExcerpt")
    require(evidenceId === JSONObject.NULL || evidenceId is String && reviewUuid(evidenceId))
    if (action == "hide") {
      require(reason in setOf("safety", "harassment", "spam", "misleading") && excerpt is String)
      reviewText(excerpt, 5, 500)
    } else require(action == "restore" && reason in setOf("no_violation", "insufficient_evidence", "resolved") && evidenceId === JSONObject.NULL && excerpt === JSONObject.NULL)
    val evidenceWire = if (evidenceId === JSONObject.NULL) "null" else profileQuote(evidenceId as String)
    val excerptWire = if (excerpt === JSONObject.NULL) "null" else profileQuote(excerpt as String)
    val prefix = "{\"expectedRevision\":$revision,\"requestId\":\"$requestId\",\"action\":\"$action\",\"reason\":\"$reason\",\"summary\":" + profileQuote(summary) + ",\"evidenceReportId\":" + evidenceWire + ",\"evidenceExcerpt\":" + excerptWire
    val canonical = if (suffix.isEmpty()) prefix + "}" else {
      val session = value.get("sessionId"); require(session is String && reviewUuid(session))
      prefix + ",\"sessionId\":\"$session\"}"
    }
    require(body == canonical)
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
      && url.fragment == null && url.toString() == input.url)
    if (url.encodedPath == "/api/great-books/passage") { validatePassageQuery(url.encodedQuery); return }
    val edition = Regex("/api/great-books/text/([a-z-]+)").matchEntire(url.encodedPath)
    if (edition != null) { require(url.encodedQuery == null && savedReadingBook(edition.groupValues[1])); return }
    if (Regex("/api/explorer/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").matches(url.encodedPath)) {
      require(url.encodedQuery == null); return
    }
    require(url.encodedPath == "/api/circles")
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
  /** Anonymous block locator only. Pinned edition equality and actual block
   * bounds are checked independently by the JavaScript and canonical server. */
  private fun validatePassageQuery(encoded: String?) {
    require(encoded != null && encoded.length <= 400)
    val order = listOf("book", "edition", "block")
    val parts = encoded.split('&'); require(parts.size == order.size)
    val query = mutableMapOf<String, String>()
    for ((index, part) in parts.withIndex()) {
      val pair = part.split('='); require(pair.size == 2 && pair[0] == order[index])
      val value = URLDecoder.decode(pair[1], "UTF-8"); MemberConfig.value(value)
      require(URLEncoder.encode(value, "UTF-8") == pair[1]); query[pair[0]] = value
    }
    require(Regex("[a-z0-9][a-z0-9-]{0,159}").matches(query["book"]!!))
    require(Regex("pg-[1-9][0-9]{0,9}-[a-f0-9]{64}").matches(query["edition"]!!))
    require(Regex("0|[1-9][0-9]{0,5}").matches(query["block"]!!))
    require(query["block"]!!.toInt() in 0..100000)
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
    val messageAiConsent = Regex("/api/circles/([0-9a-f-]{36})/messages/([0-9a-f-]{36})/ai-consent").matchEntire(url.encodedPath)
    val detail = Regex("/api/circles/([0-9a-fA-F-]{36})(?:/membership)?").matchEntire(url.encodedPath)
    val participation = Regex("/api/circles/([0-9a-fA-F-]{36})/(join|leave)").matchEntire(url.encodedPath)
    val attendance = Regex("/api/circles/([0-9a-f-]{36})/rsvp").matchEntire(url.encodedPath)
    val completion = Regex("/api/circles/([0-9a-f-]{36})/complete").matchEntire(url.encodedPath)
    if (url.encodedPath == "/api/auth/member") { require(input.method == "GET" && url.encodedQuery == null) }
    else if (url.encodedPath == "/api/auth/ensure-member") { require(input.method == "POST" && url.encodedQuery == null) }
    else if (url.encodedPath == "/api/circles/start") { require(input.method == "GET" && url.encodedQuery == null) }
    else if (url.encodedPath == "/api/circles") { require(input.method == "POST" && url.encodedQuery == null); validateCreationBody(input.body ?: throw IllegalArgumentException()) }
    else if (completion != null) { require(uuid(completion.groupValues[1]) && input.method == "POST" && url.encodedQuery == null); validateCompletionBody(input.body ?: throw IllegalArgumentException()) }
    else if (url.encodedPath == "/api/members/profile") {
      require(url.encodedQuery == null)
      if (input.method == "POST") validateProfileBody(input.body ?: throw IllegalArgumentException())
    }
    else if (url.encodedPath == "/api/great-books/progress") {
      if (input.method == "GET") {
        val query = url.encodedQuery
        if (query != null) require(query.startsWith("bookId=") && savedReadingBook(query.removePrefix("bookId=")))
      } else {
        require(url.encodedQuery == null)
        validateSavedReadingBody(input.body ?: throw IllegalArgumentException())
      }
    }
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
    else if (attendance != null) {
      require(uuid(attendance.groupValues[1]) && input.method == "POST" && url.encodedQuery == null)
      validateAttendanceBody(input.body ?: throw IllegalArgumentException())
    }
    else if (legacy != null) { require(uuid(legacy.groupValues[1]) && url.encodedQuery == null) }
    else if (preview != null) { require(uuid(preview.groupValues[1]) && input.method == "POST" && url.encodedQuery == null) }
    else if (discussion != null && input.method == "POST") { require(uuid(discussion.groupValues[1]) && url.encodedQuery == null) }
    else if (messageAction != null) { require(uuid(messageAction.groupValues[1]) && uuid(messageAction.groupValues[2]) && url.encodedQuery == null) }
    else if (messageAiConsent != null) {
      require(uuid(messageAiConsent.groupValues[1]) && uuid(messageAiConsent.groupValues[2]) && url.encodedQuery == null)
      if (input.method == "POST") validateMessageAiConsentBody(input.body ?: throw IllegalArgumentException())
    }
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
    else if (url.encodedPath == "/api/great-books/progress") require(input.body != null && input.body.toByteArray(Charsets.UTF_8).size <= 4096)
    else require(input.body != null && input.body.toByteArray(Charsets.UTF_8).size <= if (url.encodedPath == "/api/members/profile") 65536 else 16384)
  }
  /** Author consent is a narrow CAS choice. No message text, author profile,
   * reporter notes or provider operation is admitted by this native lane. */
  private fun validateMessageAiConsentBody(body: String) {
    require(body.toByteArray(Charsets.UTF_8).size <= 512)
    val value = JSONObject(body)
    require(value.keys().asSequence().toSet() == setOf("expectedConsentRevision", "contentHash", "policy", "allowed"))
    val revision = value.get("expectedConsentRevision"); val hash = value.get("contentHash")
    val policy = value.get("policy"); val allowed = value.get("allowed")
    require(revision is Int || revision is Long)
    val version = (revision as Number).toLong(); require(version in 0..9007199254740991L)
    require(hash is String && Regex("[a-f0-9]{64}").matches(hash))
    require(policy == "anthropic-message-review-v1" && allowed is Boolean)
    require(body == "{\"expectedConsentRevision\":$version,\"contentHash\":\"$hash\",\"policy\":\"$policy\",\"allowed\":$allowed}")
  }
  /** The independent native policy accepts only the complete reviewed RSVP
   * wire. The server verifies this actor, current membership and meeting date. */
  private fun validateAttendanceBody(body: String) {
    require(body.toByteArray(Charsets.UTF_8).size <= 256)
    val value = JSONObject(body)
    require(value.keys().asSequence().toSet() == setOf("expectedMemberId", "requestId", "expectedRevision", "date", "status"))
    val member = value.get("expectedMemberId"); val requestId = value.get("requestId")
    val revision = value.get("expectedRevision"); val date = value.get("date"); val status = value.get("status")
    require(member is String && uuid(member) && member == member.lowercase())
    require(requestId is String && uuid(requestId) && requestId == requestId.lowercase())
    require(revision is Int || revision is Long)
    val version = (revision as Number).toLong(); require(version in 0..9007199254740991L)
    require(date is String && attendanceDay(date))
    require(status is String && status in setOf("going", "not_going"))
    require(body == "{\"expectedMemberId\":\"$member\",\"requestId\":\"$requestId\",\"expectedRevision\":$version,\"date\":\"$date\",\"status\":\"$status\"}")
  }
  private fun attendanceDay(value: String): Boolean {
    val match = Regex("([0-9]{4})-([0-9]{2})-([0-9]{2})").matchEntire(value) ?: return false
    val year = match.groupValues[1].toInt(); val month = match.groupValues[2].toInt(); val day = match.groupValues[3].toInt()
    if (month !in 1..12) return false
    val leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
    val days = when (month) { 2 -> if (leap) 29 else 28; 4, 6, 9, 11 -> 30; else -> 31 }
    return day in 1..days
  }
  private fun validateCompletionBody(body: String) {
    require(body.toByteArray(Charsets.UTF_8).size <= 160)
    val value = JSONObject(body)
    require(value.keys().asSequence().toSet() == setOf("expectedMemberId", "requestId", "expectedRevision"))
    val member = value.get("expectedMemberId"); val key = value.get("requestId"); val revision = value.get("expectedRevision")
    require(member is String && uuid(member) && member == member.lowercase() && key is String && uuid(key) && key == key.lowercase())
    require(revision is Int || revision is Long)
    val version = (revision as Number).toLong(); require(version in 0..9007199254740991L)
    require(body == "{\"expectedMemberId\":" + profileQuote(member) + ",\"requestId\":" + profileQuote(key) + ",\"expectedRevision\":" + version + "}")
  }
  /** Native structural/size/encoding boundary. The shared canonical parser and
   * server independently validate current source pins and calendar eligibility. */
  private fun validateCreationBody(body: String) {
    require(body.toByteArray(Charsets.UTF_8).size <= 12000)
    val value = JSONObject(body)
    val fields = listOf("expectedMemberId", "requestId", "title", "description", "format", "city", "region", "venueName", "venueType", "weekday", "time", "timezone", "startDate", "maxMembers", "onlineUrl")
    require(value.keys().asSequence().toSet() == (fields + if (value.has("readingProgram")) listOf("readingProgram") else emptyList()).toSet())
    val member = value.get("expectedMemberId"); val key = value.get("requestId")
    require(member is String && uuid(member) && member == member.lowercase() && key is String && uuid(key) && key == key.lowercase())
    fun text(name: String, maximum: Int, nullable: Boolean = false): String? {
      val raw = value.get(name); if (raw == JSONObject.NULL && nullable) return null
      require(raw is String); profileText(raw, maximum, true, true)
      require(raw == raw.replace(Regex("[\\u0020\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+"), " ").trim())
      return raw
    }
    fun number(name: String, minimum: Long, maximum: Long): Long {
      val raw = value.get(name); require(raw is Int || raw is Long)
      val parsed = (raw as Number).toLong(); require(parsed in minimum..maximum); return parsed
    }
    val title = text("title", 120)!!; require(title.length >= 4)
    val description = text("description", 600, true); val format = text("format", 20)!!
    require(format in setOf("in_person", "online", "hybrid"))
    val city = text("city", 80, true); val region = text("region", 40, true); val venueName = text("venueName", 120, true); val venueType = text("venueType", 30)!!
    require(venueType in setOf("library", "cafe", "community_center", "campus", "place_of_worship", "other_public", "online"))
    require(if (format == "online") venueType == "online" && venueName == null else venueType != "online" && city != null && venueName != null)
    val weekday = number("weekday", 0, 6); val time = text("time", 5)!!; require(Regex("([01][0-9]|2[0-3]):[0-5][0-9]").matches(time))
    val timezone = text("timezone", 40)!!; require(timezone in setOf("America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "UTC"))
    val startDate = text("startDate", 10)!!; require(attendanceDay(startDate)); val maximum = number("maxMembers", 3, 12)
    val onlineUrl = text("onlineUrl", 300, true)
    if (format == "in_person") require(onlineUrl == null) else {
      require(onlineUrl != null); val link = onlineUrl.toHttpUrl()
      require(link.scheme == "https" && link.host.contains('.') && link.username.isEmpty() && link.password.isEmpty() && link.toString() == onlineUrl)
    }
    fun quote(raw: String?) = raw?.let { profileQuote(it) } ?: "null"
    var canonical = "{\"expectedMemberId\":" + profileQuote(member) + ",\"requestId\":" + profileQuote(key) + ",\"title\":" + quote(title) + ",\"description\":" + quote(description) + ",\"format\":" + quote(format) + ",\"city\":" + quote(city) + ",\"region\":" + quote(region) + ",\"venueName\":" + quote(venueName) + ",\"venueType\":" + quote(venueType) + ",\"weekday\":" + weekday + ",\"time\":" + quote(time) + ",\"timezone\":" + quote(timezone) + ",\"startDate\":" + quote(startDate) + ",\"maxMembers\":" + maximum + ",\"onlineUrl\":" + quote(onlineUrl)
    if (value.has("readingProgram")) {
      val program = value.get("readingProgram"); require(program is JSONObject)
      require(program.keys().asSequence().toSet() == setOf("version", "bookId", "editionId", "sessions"))
      val version = program.get("version"); require(version is Int && version == 1)
      val book = program.get("bookId"); val edition = program.get("editionId"); val sessions = program.get("sessions")
      require(book is String && savedReadingBook(book) && edition is String && Regex("pg-[1-9][0-9]{0,9}-[a-f0-9]{64}").matches(edition))
      require(sessions is JSONArray && sessions.length() in 1..12)
      val rows = (0 until sessions.length()).joinToString(",", "[", "]") { index ->
        val row = sessions.get(index); require(row is JSONObject && row.keys().asSequence().toSet() == setOf("from", "to"))
        val from = row.get("from"); val to = row.get("to"); require((from is Int || from is Long) && (to is Int || to is Long))
        val beginning = (from as Number).toLong(); val end = (to as Number).toLong(); require(beginning in 0..99999L && end in beginning..99999L)
        "{\"from\":" + beginning + ",\"to\":" + end + "}"
      }
      canonical += ",\"readingProgram\":{\"version\":1,\"bookId\":" + quote(book) + ",\"editionId\":" + quote(edition) + ",\"sessions\":" + rows + "}"
    }
    require(body == canonical + "}")
  }
  private fun savedReadingBook(value: String) = value in setOf("apology", "divine-comedy", "genealogy-of-morals", "hamlet", "meditations", "odyssey", "relativity", "republic")
  /** Private saved-place CAS wire policy. Shared JS and server contracts also
   * require the exact current edition pin and its actual block count. */
  private fun validateSavedReadingBody(body: String) {
    require(body.toByteArray(Charsets.UTF_8).size <= 4096)
    val value = JSONObject(body)
    val member = value.get("expectedMemberId"); val revision = value.get("expectedRevision")
    val book = value.get("bookId"); val action = value.get("action")
    require(member is String && uuid(member) && member == member.lowercase())
    require(revision is Int || revision is Long)
    val version = (revision as Number).toLong(); require(version in 0..9007199254740991L)
    require(book is String && savedReadingBook(book) && (action == "save" || action == "remove"))
    val prefix = "{\"expectedMemberId\":" + profileQuote(member) + ",\"expectedRevision\":" + version + ",\"bookId\":" + profileQuote(book) + ",\"action\":" + profileQuote(action as String)
    val canonical = if (action == "save") {
      require(value.length() == 7)
      val edition = value.get("editionId"); val block = value.get("blockIndex"); val completed = value.get("completed")
      require(edition is String && Regex("pg-[1-9][0-9]{0,9}-[a-f0-9]{64}").matches(edition))
      require(block is Int || block is Long)
      val position = (block as Number).toLong(); require(position in 0..99999L)
      require(completed is Boolean)
      prefix + ",\"editionId\":" + profileQuote(edition) + ",\"blockIndex\":" + position + ",\"completed\":" + completed + "}"
    } else { require(value.length() == 4); prefix + "}" }
    require(body == canonical)
  }
  /** Exact full profile CAS envelope. Rebuilding the canonical bytes rejects
   * duplicate keys, parser coercions, extra fields and alternate encodings. */
  private fun validateProfileBody(body: String) {
    require(body.toByteArray(Charsets.UTF_8).size <= 65536)
    val value = JSONObject(body)
    require(value.length() == 3 && value.has("expectedMemberId") && value.has("expectedRevision") && value.has("patch"))
    val member = value.get("expectedMemberId"); val revision = value.get("expectedRevision")
    require(member is String && uuid(member) && member == member.lowercase())
    require(revision is Int || revision is Long)
    val version = (revision as Number).toLong(); require(version in 0..9007199254740991L)
    val patch = value.get("patch"); require(patch is JSONObject && patch.length() == 8)
    val fields = listOf("displayName", "bio", "discipline", "skills", "projectDescription", "seeking", "philosophy", "visibility")
    require(fields.all { patch.has(it) })
    val serialized = fields.map { key ->
      val entry = patch.get(key)
      val encoded = if (key == "skills") {
        require(entry is org.json.JSONArray && entry.length() <= 40)
        (0 until entry.length()).map { index ->
          val skill = entry.get(index); require(skill is String)
          profileText(skill, 100, true, true); profileQuote(skill)
        }.joinToString(",", "[", "]")
      } else {
        require(entry is String)
        if (key == "visibility") require(entry == "private" || entry == "public")
        else profileText(entry, when (key) { "displayName" -> 200; "discipline" -> 100; "seeking" -> 1000; else -> 2000 }, key == "displayName" || key == "discipline", key == "displayName")
        profileQuote(entry)
      }
      profileQuote(key) + ":" + encoded
    }.joinToString(",", "{", "}")
    require(body == "{\"expectedMemberId\":" + profileQuote(member) + ",\"expectedRevision\":" + version + ",\"patch\":" + serialized + "}")
  }
  private fun profileText(value: String, maximum: Int, singleLine: Boolean, nonempty: Boolean) {
    require(value.length <= maximum && (!nonempty || value.isNotEmpty()))
    // ECMAScript trim characters, matching parseProfileMutation exactly.
    require(value == value.trim { it in '\u0009'..'\u000d' || it == '\u0020' || it == '\u00a0' || it == '\u1680' || it in '\u2000'..'\u200a' || it == '\u2028' || it == '\u2029' || it == '\u202f' || it == '\u205f' || it == '\u3000' || it == '\ufeff' })
    for (index in value.indices) {
      val c = value[index]
      require(c.code != 127 && (c.code >= 32 || !singleLine && c in listOf('\t', '\n', '\r')))
      if (c in '\ud800'..'\udbff') require(index + 1 < value.length && value[index + 1] in '\udc00'..'\udfff')
      if (c in '\udc00'..'\udfff') require(index > 0 && value[index - 1] in '\ud800'..'\udbff')
    }
  }
  private fun profileQuote(value: String): String = buildString {
    append('"')
    for (c in value) when (c) {
      '"' -> append("\\\""); '\\' -> append("\\\\"); '\t' -> append("\\t"); '\n' -> append("\\n"); '\r' -> append("\\r")
      else -> append(c)
    }
    append('"')
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
    fun emailInput(value: ReadableMap): EmailLinkSession.Input {
      val keys = value.keySetIterator(); val names = mutableSetOf<String>()
      while (keys.hasNextKey()) names.add(keys.nextKey())
      require(names.containsAll(setOf("flowId", "url", "method")) && names.all { it in setOf("flowId", "url", "method", "bearer", "body") })
      for (key in names) require(value.getType(key) == ReadableType.String)
      return EmailLinkSession.Input(value.getString("flowId")!!, value.getString("url")!!, value.getString("method")!!,
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
