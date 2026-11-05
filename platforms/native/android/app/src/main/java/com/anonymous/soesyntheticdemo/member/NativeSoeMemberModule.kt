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
class NativeSoeMemberModule(context: ReactApplicationContext) : NativeSoeMemberSpec(context) {
  private val closed = AtomicBoolean(false)
  private val worker = ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, ArrayBlockingQueue<Runnable>(64))
  private val pending = mutableSetOf<Reply>()
  private val config by lazy { MemberConfig.configured() ?: throw IllegalStateException() }
  private val store by lazy { MemberSecureStore.open(context, config) }
  private var transportValue: MemberTransport? = null
  private val connectivity = MemberConnectivity(context) { state ->
    if (!closed.get()) { try { emitOnConnectivityChange(Arguments.createMap().apply { putString("state", state) }) } catch (_: Exception) { /* No JS listener/context. */ } }
  }
  private fun transport(): MemberTransport = synchronized(this) {
    check(!closed.get()); transportValue ?: MemberTransport(config, store).also { transportValue = it }
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
      if (config.providerOrigin.isNotEmpty()) {
        putString("authPolicy", "supabase-password-v1"); putString("providerOrigin", config.providerOrigin); putString("publishableKey", config.publishableKey)
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
      synchronized(this) { transportValue?.close(); transportValue = null }
      synchronized(pending) { pending.toList() }.forEach { it.fail() }
      worker.shutdownNow()
    }
    super.invalidate()
  }
  companion object { const val NAME = "NativeSoeMember" }
}
