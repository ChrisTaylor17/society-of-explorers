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
        let value = url.absoluteString
        let invite = origin + "/circles/invite/"
        if value.hasPrefix(invite) {
            let id = String(value.dropFirst(invite.count))
            return id.utf8.count == 36 && id.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                options: .regularExpression) != nil
        }
        let prefix = origin + "/clips/watch/"
        guard value.hasPrefix(prefix) else { return false }
        let slug = value.dropFirst(prefix.count)
        return slug == "night-sky-traffic" || slug == "telescope-first-tilt" || slug == "which-height" || slug == "new-species"
    }
}
