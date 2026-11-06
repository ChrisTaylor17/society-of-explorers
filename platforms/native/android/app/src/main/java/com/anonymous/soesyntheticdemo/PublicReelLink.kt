package com.anonymous.soesyntheticdemo

/** Accepts a reviewed Reel or salon invitation and returns its canonical HTTPS form. */
internal fun publicAppLink(value: String?, origin: String): String? {
  if (value == null || value.length > 420 || !origin.startsWith("https://")) return null
  val secure = if (value.startsWith("http://")) "https://" + value.removePrefix("http://") else value
  val invite = "${origin}/circles/invite/"
  if (secure.startsWith(invite)) {
    val id = secure.removePrefix(invite)
    return secure.takeIf { Regex("[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}").matches(id) }
  }
  val prefix = "${origin}/clips/watch/"
  if (!secure.startsWith(prefix)) return null
  val slug = secure.removePrefix(prefix)
  return if (slug == "night-sky-traffic" || slug == "telescope-first-tilt" || slug == "which-height") secure else null
}
