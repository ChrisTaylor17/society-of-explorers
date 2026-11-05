package com.anonymous.soesyntheticdemo.reader

import android.content.Context
import com.anonymous.soesyntheticdemo.BuildConfig
import org.json.JSONObject
import java.net.URI
import java.security.MessageDigest

internal data class ReaderResource(val path: String, val sha: String, val bytes: Int, val mime: String)
internal data class ReaderEdition(val book: String, val edition: String, val blocks: Int, val anchors: Map<Int, String>, val resources: Map<String, ReaderResource>) {
  val documentPath get() = "/api/great-books/edition/$book/reader?edition=$edition"
  fun anchor(block: Int): String { require(block in 0 until blocks); return anchors[block] ?: "soe-reading-position-$block" }
}

/** Only packaged, public catalog data; no member store or provider dependency. */
internal object SourceReaderCatalog {
  private val books = setOf("apology", "divine-comedy", "genealogy-of-morals", "hamlet", "meditations", "odyssey", "relativity", "republic")
  private val hash = Regex("[a-f0-9]{64}")
  fun origin(): String {
    val value = BuildConfig.SOE_MEMBER_ORIGIN
    require(value.length in 1..300 && Regex("https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?").matches(value))
    val uri = URI(value)
    require(uri.scheme == "https" && uri.host != null && uri.rawPath.isEmpty() && uri.rawQuery == null && uri.rawFragment == null && uri.userInfo == null)
    require(uri.port == -1 || uri.port in 1..65535 && uri.port != 443)
    require(uri.host.split('.').all { it.isNotEmpty() && it.length <= 63 && !it.startsWith('-') && !it.endsWith('-') })
    return value
  }
  fun edition(context: Context, book: String, pin: String): ReaderEdition {
    require(book in books && Regex("pg-[1-9][0-9]{0,9}-[a-f0-9]{64}").matches(pin))
    val bytes = context.assets.open("source-reader-catalog.json").use { it.readBytesBounded(262144) }
    val catalog = JSONObject(bytes.toString(Charsets.UTF_8))
    require(catalog.keys().asSequence().toSet() == setOf("schemaVersion", "derivativeVersion", "editions"))
    require(catalog.getInt("schemaVersion") == 1 && catalog.getString("derivativeVersion") == "source-reader-v1")
    val entries = catalog.getJSONArray("editions"); require(entries.length() == 8)
    val candidates = (0 until entries.length()).map { entries.getJSONObject(it) }.filter { it.getString("bookId") == book }
    require(candidates.size == 1); val value = candidates.single()
    require(value.keys().asSequence().toSet() == setOf("bookId", "editionId", "sourceDocumentSha256", "documentSha256", "documentBytes", "blockCount", "anchorOverrides", "assets"))
    require(value.getString("editionId") == pin && hash.matches(value.getString("sourceDocumentSha256")))
    val blocks = value.getInt("blockCount"); require(blocks in 1..100000)
    val size = value.getInt("documentBytes"); require(size in 1..2097152)
    val documentHash = value.getString("documentSha256"); require(hash.matches(documentHash))
    val document = "/api/great-books/edition/$book/reader?edition=$pin"
    val resources = mutableMapOf(document to ReaderResource(document, documentHash, size, "text/html"))
    val overrides = value.getJSONObject("anchorOverrides"); val anchors = mutableMapOf<Int, String>()
    for (key in overrides.keys()) {
      require(Regex("0|[1-9][0-9]{0,5}").matches(key)); val index = key.toInt(); val anchor = overrides.getString(key)
      require(index in 0 until blocks && anchor.length in 1..200 && Regex("[A-Za-z0-9][A-Za-z0-9_.:-]*").matches(anchor)
        && !Regex("soe-reading-position-[0-9]+").matches(anchor) && anchor !in anchors.values)
      anchors[index] = anchor
    }
    val assets = value.getJSONArray("assets"); require(assets.length() <= 256); var total = size
    for (index in 0 until assets.length()) {
      val asset = assets.getJSONObject(index)
      require(asset.keys().asSequence().toSet() == setOf("path", "sha256", "bytes", "mime"))
      val path = asset.getString("path"); val sha = asset.getString("sha256"); val count = asset.getInt("bytes"); val mime = asset.getString("mime")
      require(Regex("[A-Za-z0-9_./-]+").matches(path) && path.split('/').none { it.isEmpty() || it == "." || it == ".." } && path.length <= 300)
      require(hash.matches(sha) && count in 1..524288 && mime in setOf("image/png", "image/jpeg", "image/gif", "image/webp"))
      val endpoint = "/api/great-books/edition/$book/assets/$path?sha=$sha"
      require(resources.put(endpoint, ReaderResource(endpoint, sha, count, mime)) == null)
      total += count; require(total <= 33554432)
    }
    return ReaderEdition(book, pin, blocks, anchors, resources.toMap())
  }
  fun sha(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}

internal fun java.io.InputStream.readBytesBounded(maximum: Int): ByteArray {
  val output = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
  while (true) { val count = read(buffer); if (count < 0) break; require(output.size() + count <= maximum); output.write(buffer, 0, count) }
  return output.toByteArray()
}
