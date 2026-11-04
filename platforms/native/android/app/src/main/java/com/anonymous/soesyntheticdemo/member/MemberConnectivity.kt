package com.anonymous.soesyntheticdemo.member

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities

/** OS default-network observation; it does not probe a provider or promise that
 * the application server is reachable. Unknown/failed registration stays closed. */
internal class MemberConnectivity(context: Context, private val emit: (String) -> Unit) {
  private val manager = context.getSystemService(ConnectivityManager::class.java)
  private val lock = Any()
  private var retired = false
  private var registered = false
  private var sequence = 0L
  private var current: Network? = null
  private var state = "unknown"
  private val callback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) = update(network, "unknown")
    override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
      synchronized(lock) { if (retired || current != network) return; publish(network, classify(capabilities)) }
    }
    override fun onLost(network: Network) {
      synchronized(lock) { if (retired || current != network) return; publish(null, "offline") }
    }
    override fun onUnavailable() = update(null, "offline")
  }
  init {
    try {
      require(manager != null)
      // Register before sampling. A callback wins over a stale sample.
      val before = synchronized(lock) { sequence }
      synchronized(lock) { registered = true }
      manager.registerDefaultNetworkCallback(callback)
      val network = manager.activeNetwork
      val sample = if (network == null) "offline" else classify(manager.getNetworkCapabilities(network))
      synchronized(lock) {
        if (!retired && sequence == before) { current = network; state = sample }
      }
    } catch (_: Exception) { close(); synchronized(lock) { state = "unknown" } }
  }
  private fun classify(capabilities: NetworkCapabilities?): String = when {
    capabilities == null -> "unknown"
    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
      capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) -> "online"
    else -> "offline"
  }
  private fun update(network: Network?, next: String) {
    synchronized(lock) {
      if (retired) return
      publish(network, next)
    }
  }
  // Caller holds lock. Keep retirement/default-network/event order serialized.
  private fun publish(network: Network?, next: String) { sequence++; current = network; state = next; emit(next) }
  fun snapshot(): String = synchronized(lock) { if (retired) "unknown" else state }
  fun close() {
    val unregister = synchronized(lock) { if (retired) return; retired = true; state = "unknown"; registered }
    if (unregister) { try { manager?.unregisterNetworkCallback(callback) } catch (_: Exception) { /* Retired first. */ } }
  }
}
