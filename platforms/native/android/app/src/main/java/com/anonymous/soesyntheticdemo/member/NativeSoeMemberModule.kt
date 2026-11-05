package com.anonymous.soesyntheticdemo.member

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.UUID

/** Actual app-local TurboModule; generated supertype is a later Codegen gate. */
@ReactModule(name = NativeSoeMemberModule.NAME)
class NativeSoeMemberModule(private val context: ReactApplicationContext) : NativeSoeMemberSpec(context) {
  private val closed = AtomicBoolean(false)
  private val worker = ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, ArrayBlockingQueue<Runnable>(64))
  private val pending = mutableSetOf<Reply>()
  private val config by lazy { MemberConfig.configured() ?: throw IllegalStateException() }
  private val store by lazy { MemberSecureStore.open(context, config) }
  private var transportValue: MemberTransport? = null
  private var emailValue: EmailLinkSession? = null
  private val connectivity = MemberConnectivity(context) { state ->
    if (state != "online") EmailLinkLifecycle.retireConnectivity()
    if (!closed.get()) { try { emitOnConnectivityChange(Arguments.createMap().apply { putString("state", state) }) } catch (_: Exception) { /* No JS listener/context. */ } }
  }
  private fun transport(): MemberTransport = synchronized(this) {
    check(!closed.get()); transportValue ?: MemberTransport(config, store).also { transportValue = it }
  }
  private fun emailSession(): EmailLinkSession = synchronized(this) {
    check(!closed.get()); emailValue ?: EmailLinkSession.open(context, config).also { emailValue = it }
  }
  private inner class Reply(private val promise: Promise) {
    private val settled = AtomicBoolean(false)
    init { synchronized(pending) { pending.add(this) } }
    fun resolve(value: Any?) { if (settled.compareAndSet(false, true)) { synchronized(pending) { pending.remove(this) }; promise.resolve(value) } }
    fun fail() { if (settled.compareAndSet(false, true)) { synchronized(pending) { pending.remove(this) }; promise.reject("SOE_MEMBER_UNAVAILABLE", "Native member service unavailable") } }
  }
  private fun work(promise: Promise, block: (Reply) -> Unit) {
    val reply = Reply(promise)
    try { worker.execute { try { check(!closed.get()); block(reply) } catch (_: Exception) { reply.fail() } } }
    catch (_: Exception) { reply.fail() }
  }
  private fun emailWork(promise: Promise, block: (Reply, Long) -> Unit) {
    // Capture BEFORE FIFO queueing: a paused/resumed Activity cannot authorize
    // old queued preparations or claims with its new foreground epoch.
    val epoch = try { check(connectivity.snapshot() == "online"); EmailLinkLifecycle.stamp() } catch (_: Exception) {
      promise.reject("SOE_MEMBER_UNAVAILABLE", "Native member service unavailable"); return
    }
    work(promise) { reply -> connectivity.withOnline { EmailLinkLifecycle.withCurrent(epoch) { block(reply, epoch) } } }
  }
  override fun getName() = NAME
  override fun capabilities(promise: Promise) = work(promise) { reply ->
    val generation = store.generation()
    reply.resolve(Arguments.createMap().apply {
      putDouble("version", 2.0); putString("origin", config.origin); putString("storageKey", config.storageKey)
      putString("redirectPolicy", "reject-before-send"); putString("storagePolicy", "os-protected"); putString("storageGeneration", generation)
      putString("requestIdPolicy", "os-random-uuid")
      putString("publicPolicy", "circle-discovery-v1")
      putString("readingPolicy", "pinned-passage-v1")
      putString("profilePolicy", "owner-profile-v1")
      putString("publicProfilePolicy", "published-profile-v1")
      putString("savedReadingPolicy", "owner-reading-v1")
      putString("attendancePolicy", "circle-rsvp-v1")
      putString("hostingPolicy", "circle-host-v1")
      putString("messageAiConsentPolicy", "author-message-ai-consent-v1")
      putString("messageReviewPolicy", "assigned-message-review-v1")
      putString("circleReviewPolicy", "assigned-circle-review-v1")
      if (config.providerOrigin.isNotEmpty()) {
        putString("authPolicy", "supabase-password-v1"); putString("providerOrigin", config.providerOrigin); putString("publishableKey", config.publishableKey)
        putString("emailAuthPolicy", "supabase-email-pkce-v1"); putString("emailCallbackUrl", config.emailCallbackUrl)
      }
    })
  }
  override fun begin(generation: String, promise: Promise) = work(promise) { it.resolve(transport().begin(generation)) }
  override fun newRequestId(generation: String, promise: Promise) = work(promise) { reply ->
    store.withGeneration(generation) { reply.resolve(UUID.randomUUID().toString()) }
  }
  override fun send(id: String, request: ReadableMap, promise: Promise) = work(promise) { reply ->
    transport().send(id, MemberTransport.input(request), { result ->
      reply.resolve(Arguments.createMap().apply {
        putDouble("status", result.status.toDouble()); putString("url", result.url); putString("body", result.body); putBoolean("redirected", false)
      })
    }, { reply.fail() })
  }
  override fun sendReview(id: String, request: ReadableMap, promise: Promise) = work(promise) { reply ->
    transport().sendReview(id, MemberTransport.input(request), { result ->
      reply.resolve(Arguments.createMap().apply {
        putDouble("status", result.status.toDouble()); putString("url", result.url); putString("body", result.body); putBoolean("redirected", false)
      })
    }, { reply.fail() })
  }
  override fun sendCircleReview(id: String, request: ReadableMap, promise: Promise) = work(promise) { reply ->
    transport().sendCircleReview(id, MemberTransport.input(request), { result ->
      reply.resolve(Arguments.createMap().apply {
        putDouble("status", result.status.toDouble()); putString("url", result.url); putString("body", result.body); putBoolean("redirected", false)
      })
    }, { reply.fail() })
  }
  override fun sendAuth(id: String, request: ReadableMap, promise: Promise) = work(promise) { reply ->
    transport().sendAuth(id, MemberTransport.authInput(request), { result ->
      reply.resolve(Arguments.createMap().apply {
        putDouble("status", result.status.toDouble()); putString("url", result.url); putString("body", result.body); putBoolean("redirected", false)
      })
    }, { reply.fail() })
  }
  override fun sendPublic(id: String, request: ReadableMap, promise: Promise) = work(promise) { reply ->
    transport().sendPublic(id, MemberTransport.publicInput(request), { result ->
      reply.resolve(Arguments.createMap().apply {
        putDouble("status", result.status.toDouble()); putString("url", result.url); putString("body", result.body); putBoolean("redirected", false)
      })
    }, { reply.fail() })
  }
  override fun prepareEmailLink(generation: String, purpose: String, email: String, promise: Promise) = emailWork(promise) { reply, epoch ->
    reply.resolve(Arguments.makeNativeMap(emailSession().prepare(generation, epoch, purpose, email)))
  }
  override fun pendingEmailLink(generation: String, promise: Promise) = emailWork(promise) { reply, epoch ->
    reply.resolve(emailSession().pending(generation, epoch)?.let { Arguments.makeNativeMap(it) })
  }
  override fun claimEmailLink(generation: String, flowId: String, promise: Promise) = emailWork(promise) { reply, epoch ->
    reply.resolve(Arguments.makeNativeMap(emailSession().claim(generation, epoch, flowId)))
  }
  override fun discardEmailLink(generation: String, flowId: String, promise: Promise) = work(promise) { reply ->
    // Local-only erasure is safe while inactive; exact flow protects a newer link.
    emailSession().discard(generation, flowId); reply.resolve(null)
  }
  override fun sendEmailAuth(id: String, request: ReadableMap, promise: Promise) = emailWork(promise) { reply, epoch ->
    transport().sendEmailAuth(id, MemberTransport.emailInput(request), emailSession(), epoch, { result ->
      reply.resolve(Arguments.createMap().apply {
        putDouble("status", result.status.toDouble()); putString("url", result.url); putString("body", result.body); putBoolean("redirected", false)
      })
    }, { reply.fail() })
  }
  override fun cancel(id: String, promise: Promise) {
    // Cancellation never waits behind storage/decryption/reset work.
    try { synchronized(this) { transportValue }?.cancel(id); promise.resolve(null) }
    catch (_: Exception) { promise.reject("SOE_MEMBER_UNAVAILABLE", "Native member service unavailable") }
  }
  override fun read(slot: String, generation: String, promise: Promise) = work(promise) { it.resolve(store.read(slot, generation)) }
  override fun write(slot: String, value: String, generation: String, promise: Promise) = work(promise) { store.write(slot, value, generation); it.resolve(null) }
  override fun remove(slot: String, generation: String, promise: Promise) = work(promise) { store.remove(slot, generation); it.resolve(null) }
  override fun resetAccountStorage(expectedGeneration: String, promise: Promise) = work(promise) { reply ->
    val result = store.reset(expectedGeneration)
    reply.resolve(Arguments.createMap().apply {
      putString("previousGeneration", result.first); putString("generation", result.second); putBoolean("cleared", true)
    })
  }
  override fun getConnectivitySnapshot(): String = if (closed.get()) "unknown" else connectivity.snapshot()
  override fun invalidate() {
    if (closed.compareAndSet(false, true)) {
      connectivity.close()
      synchronized(this) { emailValue?.retire(); emailValue = null; transportValue?.close(); transportValue = null }
      synchronized(pending) { pending.toList() }.forEach { it.fail() }
      worker.shutdownNow()
    }
    super.invalidate()
  }
  companion object { const val NAME = "NativeSoeMember" }
}
