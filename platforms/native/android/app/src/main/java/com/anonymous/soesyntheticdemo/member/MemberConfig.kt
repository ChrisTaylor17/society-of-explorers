package com.anonymous.soesyntheticdemo.member

import com.anonymous.soesyntheticdemo.BuildConfig
import java.net.URI
import java.security.MessageDigest

internal class MemberConfig private constructor(val origin: String, val storageKey: String, val providerOrigin: String, val publishableKey: String) {
  // Neither namespace nor filenames contain credentials or caller-controlled paths.
  val namespace: String = MessageDigest.getInstance("SHA-256")
    .digest((BuildConfig.APPLICATION_ID + "|" + origin + "|" + storageKey + if (providerOrigin.isEmpty()) "" else "|" + providerOrigin + "|" + publishableKey).toByteArray(Charsets.UTF_8))
    .joinToString("") { "%02x".format(it) }
  companion object {
    fun configured(): MemberConfig? {
      val origin = BuildConfig.SOE_MEMBER_ORIGIN
      val key = BuildConfig.SOE_MEMBER_STORAGE_KEY
      if (origin.isEmpty() && key.isEmpty()) return null
      require(origin.length <= 300 && Regex("https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?").matches(origin))
      require(Regex("[A-Za-z0-9._-]{1,160}").matches(key))
      val uri = URI(origin)
      require(uri.scheme == "https" && uri.host != null && uri.userInfo == null && uri.rawPath.isEmpty() && uri.rawQuery == null && uri.rawFragment == null)
      require(uri.port == -1 || uri.port in 1..65535 && uri.port != 443)
      require(uri.host.split('.').all { it.isNotEmpty() && it.length <= 63 && !it.startsWith('-') && !it.endsWith('-') })
      val providerOrigin = BuildConfig.SOE_PROVIDER_ORIGIN
      val publishableKey = BuildConfig.SOE_PUBLISHABLE_KEY
      require((providerOrigin.isEmpty() && publishableKey.isEmpty()) || (
        canonicalProvider(providerOrigin) && Regex("sb_publishable_[A-Za-z0-9_-]{20,200}").matches(publishableKey)))
      return MemberConfig(origin, key, providerOrigin, publishableKey)
    }
    private fun canonicalProvider(origin: String): Boolean {
      if (origin.length > 300 || !Regex("https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?").matches(origin)) return false
      val uri = URI(origin)
      return uri.scheme == "https" && uri.host != null && uri.userInfo == null && uri.rawPath.isEmpty() && uri.rawQuery == null && uri.rawFragment == null &&
        (uri.port == -1 || uri.port in 1..65535 && uri.port != 443) && uri.host.split('.').all { it.isNotEmpty() && it.length <= 63 && !it.startsWith('-') && !it.endsWith('-') }
    }
    val UUID_PATTERN = Regex("[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
    fun generation(value: String) { require(UUID_PATTERN.matches(value)) }
    fun slot(value: String) { require(value in setOf("session", "pkce", "user")) }
    fun value(value: String) {
      require(value.toByteArray(Charsets.UTF_8).size <= 65536)
      var index = 0
      while (index < value.length) {
        val character = value[index++]
        if (Character.isHighSurrogate(character)) require(index < value.length && Character.isLowSurrogate(value[index++]))
        else require(!Character.isLowSurrogate(character))
      }
    }
  }
}
