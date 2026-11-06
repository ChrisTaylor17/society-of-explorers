package com.anonymous.soesyntheticdemo.member

import android.content.Context
import android.util.Base64
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONObject
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** Shared native member lifecycle, independent of delayed JS AppState delivery. */
object EmailLinkLifecycle {
  private val epoch = AtomicLong(0)
  private val retirements = mutableSetOf<(Long) -> Unit>()
  @Volatile private var active = false
  @Synchronized fun foreground() { if (!active) { epoch.incrementAndGet(); active = true } }
  fun background() = retire(loseForeground = true)
  fun retireConnectivity() = retire(loseForeground = false)

  @Synchronized internal fun onRetirement(listener: (Long) -> Unit): () -> Unit {
    retirements.add(listener)
    return { synchronized(this) { retirements.remove(listener); Unit } }
  }
  private fun retire(loseForeground: Boolean) {
    // Close admission first. Cancelling retired work leaves the pending link on disk.
    val (cutoff, listeners) = synchronized(this) {
      if (loseForeground) active = false
      epoch.incrementAndGet() to retirements.toList()
    }
    listeners.forEach { listener -> try { listener(cutoff) } catch (_: Exception) { /* Epoch already fenced. */ } }
    EmailLinkSession.retireAll()
  }
  @Synchronized internal fun stamp(): Long { check(active); return epoch.get() }
  internal fun requireCurrent(value: Long) { check(active && epoch.get() == value) }
  internal fun <T> withCurrent(value: Long, work: () -> T): T = synchronized(this) {
    requireCurrent(value); work()
  }
  /** Called before React/Linking sees an Intent. No network or account selection. */
  fun capture(context: Context, raw: String?) {
    if (raw == null) return
    try {
      val config = MemberConfig.configured() ?: return
      if (config.providerOrigin.isEmpty()) return
      EmailLinkSession.open(context, config).capture(raw)
    } catch (_: Exception) { /* Never log callback URLs, codes or provider errors. */ }
  }
}

/** One encrypted unclaimed binding and one memory-only claimed scope. No ordinary
 * member/session storage is read or written. Custom-scheme ownership still needs
 * device acceptance; S256 prevents a code interceptor redeeming without verifier. */
internal class EmailLinkSession private constructor(private val config: MemberConfig, private val store: MemberSecureStore) {
  data class Input(val flowId: String, val url: String, val method: String, val bearer: String?, val body: String?)
  private data class Pending(val flowId: String, val purpose: String, val email: String, val verifier: String,
    val challenge: String, val redirectTo: String, val createdAt: Long, val expiresAt: Long,
    var phase: String = "waiting", var started: Boolean = false, var code: String? = null, var receivedAt: Long? = null) {
    fun metadata(): Map<String, Any> = mapOf("flowId" to flowId, "purpose" to purpose, "email" to email,
      "challenge" to challenge, "redirectTo" to redirectTo, "createdAt" to createdAt.toDouble(), "expiresAt" to expiresAt.toDouble(), "phase" to phase)
    fun encode(): String = JSONObject(metadata()).put("version", 1).put("verifier", verifier).put("started", started)
      .put("createdAt", createdAt).put("expiresAt", expiresAt).put("code", code ?: JSONObject.NULL).put("receivedAt", receivedAt ?: JSONObject.NULL).toString()
  }
  private class Claim(val generation: String, val epoch: Long, val pending: Pending) {
    val used = mutableSetOf<String>()
    var bearer: String? = null
    var subject: String? = null
    var expiresAt: Long = 0
    var verified = false
  }
  internal class Permit internal constructor(val generation: String, val epoch: Long, val flowId: String, val family: String, internal val scope: Any?)
  private val lock = Any()
  private var claim: Claim? = null
  private var claimExpiry: ScheduledFuture<*>? = null
  private val requests = mutableMapOf<String, () -> Unit>()
  init { store.onRetirement { retire() } }

  private fun clearLocked(): List<() -> Unit> {
    claim = null; claimExpiry?.cancel(false); claimExpiry = null
    return requests.values.toList().also { requests.clear() }
  }
  fun retire() { val stops = synchronized(lock) { clearLocked() }; stops.forEach { try { it() } catch (_: Exception) {} } }
  private fun read(generation: String): Pending? {
    val raw = store.emailRead(generation) ?: return null
    val v = JSONObject(raw)
    require(v.keys().asSequence().toSet() == setOf("version", "flowId", "purpose", "email", "verifier", "challenge", "redirectTo", "createdAt", "expiresAt", "phase", "started", "code", "receivedAt"))
    require(v.get("version") == 1)
    val flow = v.getString("flowId"); MemberConfig.generation(flow)
    val purpose = v.getString("purpose"); require(purpose in setOf("signup", "recovery"))
    val email = v.getString("email"); validateEmail(email)
    val verifier = v.getString("verifier"); val challenge = v.getString("challenge")
    require(SECRET.matches(verifier) && challenge == pkceChallenge(verifier))
    val redirect = v.getString("redirectTo"); require(redirect == config.emailCallbackUrl + "?flow=" + flow)
    val created = integer(v, "createdAt"); val expires = integer(v, "expiresAt"); val now = System.currentTimeMillis()
    require(expires == created + TTL)
    if (created > now || expires <= now) { store.emailWrite(generation, null); return null }
    val phase = v.getString("phase"); require(phase in setOf("waiting", "callback_ready", "callback_error") && v.get("started") is Boolean)
    val code = if (v.isNull("code")) null else v.getString("code")
    val received = if (v.isNull("receivedAt")) null else integer(v, "receivedAt")
    require(if (phase == "callback_ready") code != null && CODE.matches(code) && received != null && received >= created && received <= now else code == null && received == null)
    if (received != null && received + CODE_TTL <= now) { store.emailWrite(generation, null); return null }
    return Pending(flow, purpose, email, verifier, challenge, redirect, created, expires, phase, v.getBoolean("started"), code, received)
  }
  fun prepare(generation: String, epoch: Long, purpose: String, email: String): Map<String, Any> {
    val (metadata, stops) = store.withGeneration(generation) { synchronized(lock) {
      EmailLinkLifecycle.requireCurrent(epoch); require(config.providerOrigin.isNotEmpty() && purpose in setOf("signup", "recovery")); validateEmail(email)
      val now = System.currentTimeMillis(); val verifier = encoded(ByteArray(32).also { SecureRandom().nextBytes(it) }); val flow = UUID.randomUUID().toString()
      val value = Pending(flow, purpose, email, verifier, pkceChallenge(verifier), config.emailCallbackUrl + "?flow=" + flow, now, now + TTL)
      store.emailWrite(generation, value.encode()); val stops = clearLocked(); value.metadata() to stops
    } }
    stops.forEach { try { it() } catch (_: Exception) {} }; return metadata
  }
  fun pending(generation: String, epoch: Long): Map<String, Any>? = store.withGeneration(generation) { synchronized(lock) {
    EmailLinkLifecycle.requireCurrent(epoch); read(generation)?.metadata()
  } }
  fun claim(generation: String, epoch: Long, flowId: String): Map<String, Any> {
    val (result, stops) = store.withGeneration(generation) { synchronized(lock) {
      EmailLinkLifecycle.requireCurrent(epoch); MemberConfig.generation(flowId)
      val value = read(generation) ?: throw IllegalStateException()
      require(value.flowId == flowId && value.phase == "callback_ready" && value.started && value.code != null)
      // Durable erasure commits BEFORE credentials can be returned to JS.
      store.emailWrite(generation, null)
      val stops = clearLocked(); val scope = Claim(generation, epoch, value); claim = scope
      expire(scope, minOf(value.expiresAt, value.receivedAt!! + CODE_TTL))
      mapOf<String, Any>("flowId" to flowId, "purpose" to value.purpose, "email" to value.email, "code" to value.code!!,
        "verifier" to value.verifier, "expiresAt" to minOf(value.expiresAt, value.receivedAt!! + CODE_TTL).toDouble()) to stops
    } }
    stops.forEach { try { it() } catch (_: Exception) {} }; return result
  }
  fun discard(generation: String, flowId: String) {
    val stops = store.withGeneration(generation) { synchronized(lock) {
      MemberConfig.generation(flowId)
      val matchesPending = read(generation)?.flowId == flowId
      if (matchesPending) store.emailWrite(generation, null)
      if (matchesPending || claim?.pending?.flowId == flowId) clearLocked() else emptyList()
    } }
    stops.forEach { try { it() } catch (_: Exception) {} }
  }
  fun capture(raw: String) {
    require(raw.length <= 4096)
    val uri = URI(raw); val base = URI(config.emailCallbackUrl)
    require(uri.scheme == base.scheme && uri.rawAuthority == "auth" && uri.rawPath == "/callback" && uri.rawFragment == null && uri.rawUserInfo == null && uri.port == -1)
    val fields = linkedMapOf<String, String>()
    for (part in (uri.rawQuery ?: throw IllegalArgumentException()).split('&')) {
      val pair = part.split('=', limit = 2); require(pair.size == 2 && pair[0] in setOf("flow", "code", "error", "error_code", "error_description") && !fields.containsKey(pair[0]))
      val value = URLDecoder.decode(pair[1], "UTF-8"); MemberConfig.value(value); require(value.length <= 2048 && value.none { it.code < 32 || it.code == 127 })
      fields[pair[0]] = value
    }
    val flow = fields["flow"] ?: throw IllegalArgumentException(); MemberConfig.generation(flow)
    val validCode = fields.keys == setOf("flow", "code") && CODE.matches(fields["code"] ?: "")
    val providerError = fields["error"]?.let { Regex("[A-Za-z0-9_-]{1,100}").matches(it) } == true && "code" !in fields
    require(validCode || providerError)
    val generation = store.generation()
    store.withGeneration(generation) { synchronized(lock) {
      val value = read(generation) ?: return@withGeneration
      if (value.flowId != flow || !value.started || value.phase != "waiting") return@withGeneration
      if (validCode) { value.phase = "callback_ready"; value.code = fields["code"]; value.receivedAt = System.currentTimeMillis() }
      else value.phase = "callback_error"
      store.emailWrite(generation, value.encode())
    } }
  }
  /** Validation, one-use family reservation and physical enqueue share the store
   * lock. Replacement/reset cannot slip between authorization and enqueue. */
  fun dispatch(id: String, generation: String, epoch: Long, input: Input, cancel: () -> Unit, send: (Permit) -> Unit) = store.withGeneration(generation) { synchronized(lock) {
    EmailLinkLifecycle.requireCurrent(epoch); MemberConfig.generation(input.flowId)
    require(config.providerOrigin.isNotEmpty() && input.url.length <= 2048)
    val url = input.url.toHttpUrl(); val origin = "https://" + url.host + if (url.port == 443) "" else ":" + url.port
    require(url.scheme == "https" && origin == config.providerOrigin && url.username.isEmpty() && url.password.isEmpty() && url.fragment == null && url.toString() == input.url)
    val family = when {
      input.method == "POST" && url.encodedPath in setOf("/auth/v1/signup", "/auth/v1/resend", "/auth/v1/recover") -> url.encodedPath.substringAfterLast('/')
      input.method == "POST" && input.url == config.providerOrigin + "/auth/v1/token?grant_type=pkce" -> "exchange"
      input.method == "GET" && input.url == config.providerOrigin + "/auth/v1/user" -> "user"
      input.method == "PUT" && input.url == config.providerOrigin + "/auth/v1/user" -> "update"
      else -> throw IllegalArgumentException()
    }
    val body = input.body?.let { require(it.toByteArray(Charsets.UTF_8).size <= 16384); MemberConfig.value(it); JSONObject(it) }
    var scope: Claim? = null
    if (family in setOf("signup", "resend", "recover")) {
      require(input.bearer == null)
      val value = read(generation) ?: throw IllegalStateException()
      require(value.flowId == input.flowId && value.phase == "waiting" && !value.started && body != null)
      require((value.purpose == "signup" && family in setOf("signup", "resend")) || (value.purpose == "recovery" && family == "recover"))
      require(url.encodedQuery == "redirect_to=" + URLEncoder.encode(value.redirectTo, "UTF-8"))
      val keys = setOf("email", "code_challenge", "code_challenge_method", "gotrue_meta_security") + when (family) { "signup" -> setOf("password", "data"); "resend" -> setOf("type"); else -> emptySet() }
      require(body.keys().asSequence().toSet() == keys && body.get("email") == value.email && body.get("code_challenge") == value.challenge && body.get("code_challenge_method") == "s256")
      require(body.get("gotrue_meta_security") is JSONObject && body.getJSONObject("gotrue_meta_security").length() == 0)
      if (family == "signup") { require(body.get("data") is JSONObject && body.getJSONObject("data").length() == 0); require(body.get("password") is String); validatePassword(body.getString("password")) }
      if (family == "resend") require(body.get("type") == "signup")
      val order = listOf("email") + when (family) { "signup" -> listOf("password", "data"); "resend" -> listOf("type"); else -> emptyList() } + listOf("code_challenge", "code_challenge_method", "gotrue_meta_security")
      require(input.body == canonicalBody(body, order))
      value.started = true; store.emailWrite(generation, value.encode())
    } else {
      scope = claim ?: throw IllegalStateException()
      require(scope.generation == generation && scope.epoch == epoch && scope.pending.flowId == input.flowId && family !in scope.used)
      if (family == "exchange") {
        require(input.bearer == null && body != null && scope.pending.receivedAt!! + CODE_TTL > System.currentTimeMillis())
        require(body.keys().asSequence().toSet() == setOf("auth_code", "code_verifier") && body.get("auth_code") == scope.pending.code && body.get("code_verifier") == scope.pending.verifier)
        require(input.body == canonicalBody(body, listOf("auth_code", "code_verifier")))
      } else {
        require(scope.bearer != null && input.bearer == scope.bearer && scope.expiresAt > System.currentTimeMillis() + 120000)
        if (family == "user") require(input.body == null)
        else {
          require(scope.pending.purpose == "recovery" && scope.verified && body != null)
          require(body.keys().asSequence().toSet() == setOf("password", "code_challenge", "code_challenge_method") && body.isNull("code_challenge") && body.isNull("code_challenge_method"))
          require(body.get("password") is String); validatePassword(body.getString("password"))
          require(input.body == canonicalBody(body, listOf("password", "code_challenge", "code_challenge_method")))
        }
      }
      scope.used.add(family)
    }
    val permit = Permit(generation, epoch, input.flowId, family, scope)
    requests[id] = cancel; send(permit)
  } }
  fun receive(id: String, permit: Permit, result: MemberTransport.Result) = store.withGeneration(permit.generation) { synchronized(lock) {
    EmailLinkLifecycle.requireCurrent(permit.epoch); require(requests.remove(id) != null)
    val scope = permit.scope as Claim?
    if (scope == null) require(read(permit.generation)?.flowId == permit.flowId)
    else {
      require(claim === scope)
      if (result.status != 200) { claim = null; claimExpiry?.cancel(false); claimExpiry = null; return@withGeneration }
      if (permit.family == "exchange") {
        val value = JSONObject(result.body); val access = value.getString("access_token"); val refresh = value.getString("refresh_token")
        require(token(access) && token(refresh) && value.get("token_type") == "bearer")
        val subject = value.getJSONObject("user").getString("id"); MemberConfig.generation(subject)
        val parts = access.split('.'); require(parts.size == 3 && parts.all { Regex("[A-Za-z0-9_-]+").matches(it) })
        val claims = JSONObject(String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING), Charsets.UTF_8))
        require(claims.get("sub") == subject)
        val now = System.currentTimeMillis(); val seconds = integer(claims, "exp")
        require(seconds > now / 1000 + 120 && seconds <= now / 1000 + 31536000)
        val expiry = seconds * 1000
        val amr = claims.getJSONArray("amr"); require(amr.length() in 1..8)
        for (index in 0 until amr.length()) {
          val entry = amr.getJSONObject(index)
          require(entry.get("method") == if (scope.pending.purpose == "recovery") "recovery" else "email/signup")
          val timestamp = integer(entry, "timestamp"); require(timestamp > 0 && timestamp <= now / 1000 + 30)
        }
        scope.bearer = access; scope.subject = subject; scope.expiresAt = expiry
        expire(scope, minOf(scope.pending.expiresAt, scope.pending.receivedAt!! + CODE_TTL, expiry - 120000))
      } else if (permit.family == "user") {
        val value = JSONObject(result.body); val user = if (value.opt("user") is JSONObject) value.getJSONObject("user") else value
        require(user.get("id") == scope.subject); scope.verified = true
      } else { claim = null; claimExpiry?.cancel(false); claimExpiry = null }
    }
  } }
  fun failed(id: String, permit: Permit?) { synchronized(lock) {
    requests.remove(id)
    if (permit?.scope != null && claim === permit.scope) { claim = null; claimExpiry?.cancel(false); claimExpiry = null }
  } }
  private fun expire(scope: Claim, deadline: Long) {
    claimExpiry?.cancel(false)
    claimExpiry = timer.schedule({
      val stops = synchronized(lock) { if (claim === scope) clearLocked() else emptyList() }
      stops.forEach { try { it() } catch (_: Exception) {} }
    }, maxOf(0, deadline - System.currentTimeMillis()), TimeUnit.MILLISECONDS)
  }
  companion object {
    private const val TTL = 3600000L
    private const val CODE_TTL = 300000L
    private val timer = ScheduledThreadPoolExecutor(1).apply { removeOnCancelPolicy = true }
    private val SECRET = Regex("[A-Za-z0-9_-]{43}")
    private val CODE = Regex("[A-Za-z0-9._~-]{1,2048}")
    private val sessions = mutableMapOf<String, EmailLinkSession>()
    @Synchronized fun open(context: Context, config: MemberConfig): EmailLinkSession = sessions.getOrPut(config.namespace) { EmailLinkSession(config, MemberSecureStore.open(context, config)) }
    fun retireAll() { val values = synchronized(this) { sessions.values.toList() }; values.forEach { it.retire() } }
    private fun encoded(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    private fun pkceChallenge(verifier: String): String = encoded(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))
    private fun token(value: String): Boolean = value.length in 1..16384 && Regex("[A-Za-z0-9._~+/-]+=*").matches(value)
    private fun validateEmail(value: String) { require(value.length in 3..254 && value == value.trim() && Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+").matches(value)); MemberConfig.value(value); require(value.none { it.code < 32 || it.code == 127 }) }
    private fun validatePassword(value: String) { require(value.length in 8..1024 && value.none { it.code < 32 || it.code == 127 }); MemberConfig.value(value) }
    private fun integer(value: JSONObject, key: String): Long { val n = value.get(key); require(n is Int || n is Long); return (n as Number).toLong().also { require(it in 0..9007199254740991L) } }
    /** Exact JSON.stringify-compatible narrow body. JSONObject parsing alone is
     * permissive on Android; byte comparison also rejects duplicates, escaped
     * keys, trailing input, unexpected whitespace and alternate field order. */
    private fun canonicalBody(body: JSONObject, order: List<String>): String = order.joinToString(",", "{", "}") { key ->
      val value = body.get(key)
      val encoded = when (value) {
        JSONObject.NULL -> "null"
        is String -> "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
        is JSONObject -> { require(value.length() == 0); "{}" }
        else -> throw IllegalArgumentException()
      }
      "\"" + key + "\":" + encoded
    }
  }
}
