package com.anonymous.soesyntheticdemo

/** Accepts an exact reviewed public path and returns its canonical HTTPS form. */
internal fun publicReelLink(value: String?, origin: String): String? {
  if (value == null || value.length > 420 || !origin.startsWith("https://")) return null
  val secure = if (value.startsWith("http://")) "https://" + value.removePrefix("http://") else value
  val prefix = "${origin}/clips/watch/"
  if (!secure.startsWith(prefix)) return null
  val slug = secure.removePrefix(prefix)
  return if (slug == "night-sky-traffic" || slug == "telescope-first-tilt" || slug == "which-height") secure else null
}
