import Foundation

enum SoePublicReelLink {
    static func installedOrigin(_ info: [String: Any]) -> String? {
        guard info["SoeReelLinksEnabled"] as? Bool == true,
              let origin = info["SoeMemberOrigin"] as? String, origin.hasPrefix("https://") else { return nil }
        return origin
    }

    static func allows(_ url: URL, info: [String: Any]) -> Bool {
        guard let origin = installedOrigin(info),
              url.absoluteString.utf8.count <= 420 else { return false }
        let prefix = origin + "/clips/watch/"
        let value = url.absoluteString
        guard value.hasPrefix(prefix) else { return false }
        let slug = value.dropFirst(prefix.count)
        return slug == "night-sky-traffic" || slug == "telescope-first-tilt" || slug == "which-height"
    }
}
