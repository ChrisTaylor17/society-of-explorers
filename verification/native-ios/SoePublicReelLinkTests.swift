import Foundation

func runSoePublicReelLinkTests() throws {
    let origin = "https://circles.test"
    let prefix = origin + "/clips/watch/"
    let enabled: [String: Any] = ["SoeReelLinksEnabled": true, "SoeMemberOrigin": origin]
    let paths = ["night-sky-traffic", "telescope-first-tilt", "which-height"]
    let valid = paths.map { prefix + $0 }
    let invalid = [
        prefix + "unreviewed", prefix + paths[0] + "?next=other", prefix + paths[1] + "#detail",
        prefix + paths[2] + "/", prefix + "%77hich-height",
        "https://other.test/clips/watch/which-height", "http://circles.test/clips/watch/which-height",
        "https://circles.test:443/clips/watch/which-height", "https://circles.test/clips/../clips/watch/which-height",
        "https://user@circles.test/clips/watch/which-height", "org.soe.email://auth/callback?code=fixture",
        origin + "/circles/private",
    ]
    for (urls, expected) in [(valid, true), (invalid, false)] {
        for value in urls {
            guard let url = URL(string: value), SoePublicReelLink.allows(url, info: enabled) == expected else {
                throw NSError(domain: "Reel policy", code: 1)
            }
        }
    }
    guard let reel = URL(string: valid[0]),
          !SoePublicReelLink.allows(reel, info: [:]),
          !SoePublicReelLink.allows(reel, info: ["SoeReelLinksEnabled": false, "SoeMemberOrigin": origin]),
          !SoePublicReelLink.allows(reel, info: ["SoeReelLinksEnabled": true, "SoeMemberOrigin": "https://other.test"]) else {
        throw NSError(domain: "Reel policy", code: 2)
    }
    print("PASS 18 Swift Reel link policy checks")
}
