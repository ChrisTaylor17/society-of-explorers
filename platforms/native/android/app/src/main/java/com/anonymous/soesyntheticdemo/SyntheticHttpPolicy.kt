package com.anonymous.soesyntheticdemo

import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Installed only by the separate synthetic build; no production transport change. */
object SyntheticHttpPolicy {
  fun install() {
    check(BuildConfig.SOE_EMBEDDED_SYNTHETIC)
    OkHttpClientProvider.setOkHttpClientFactory(OkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder()
        .followRedirects(false)
        .followSslRedirects(false)
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .addInterceptor { chain ->
          val url = chain.request().url
          if (url.scheme != "http" || url.host != "127.0.0.1" || url.port != 8787 || url.username.isNotEmpty() || url.password.isNotEmpty()) {
            throw IOException("Synthetic demo refuses unapproved origin before transmission")
          }
          val response = chain.proceed(chain.request())
          if (response.code in 300..399) {
            response.close()
            throw IOException("Synthetic demo refuses redirects")
          }
          response
        }
        .build()
    })
  }
}
