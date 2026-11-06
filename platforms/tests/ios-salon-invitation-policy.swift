import Foundation

@main
struct SalonInvitationPolicyCheck {
    static func main() throws {
        let origin = "https://salons.fixture.test"
        let id = "61000000-aaaa-4000-8000-000000000001"
        let invitation = origin + "/circles/invite/" + id
        let listing = origin + "/api/circles/" + id
        let publicURL = listing + "?view=listing"
        let info: [String: Any] = ["SoeMemberOrigin": origin, "SoeReelLinksEnabled": true]
        let enabled = SoePublicReelLink.allows(URL(string: invitation)!, info: info)
        precondition(enabled)
        precondition(SoePublicReelLink.allows(URL(string: origin + "/clips/watch/which-height")!, info: info))
        precondition(SoePublicReelLink.allows(URL(string: origin + "/clips/watch/new-species")!, info: info))
        precondition(!SoePublicReelLink.allows(URL(string: invitation)!, info: ["SoeMemberOrigin": origin]))
        let badLinks = [invitation + "/", invitation + "?next=/private", invitation + "#note",
                        invitation.replacingOccurrences(of: "aaaa", with: "AAAA"),
                        invitation.replacingOccurrences(of: "aaaa", with: "%61aaa"),
                        invitation.replacingOccurrences(of: "-4000-", with: "-0000-"),
                        invitation.replacingOccurrences(of: "-8000-", with: "-7000-"),
                        invitation.replacingOccurrences(of: origin, with: "https://wrong.fixture.test")]
        for link in badLinks { precondition(!SoePublicReelLink.allows(URL(string: link)!, info: info)) }

        let policy = try SoeMemberRequestPolicy(memberOrigin: origin, providerOrigin: nil, publishableKey: nil)
        func input(_ url: String, _ method: String = "GET", _ bearer: String? = nil, _ body: String? = nil) -> SoeMemberWireInput {
            SoeMemberWireInput(url: url, method: method, bearer: bearer, body: body)
        }
        let publicRequest = try policy.request(for: .publicRead, input: input(publicURL))
        precondition(publicRequest.url?.absoluteString == publicURL && publicRequest.httpMethod == "GET")
        precondition(!publicRequest.httpShouldHandleCookies && publicRequest.httpBody == nil)
        for header in ["Authorization", "Cookie", "apikey"] { precondition(publicRequest.value(forHTTPHeaderField: header) == nil) }
        let badRequests: [(SoeMemberLane, SoeMemberWireInput)] = [
            (.publicRead, input(listing)), (.publicRead, input(publicURL + "#")),
            (.publicRead, input(publicURL + "&next=/private")),
            (.publicRead, input(listing + "?%76iew=listing")),
            (.publicRead, input(listing + "/membership?view=listing")),
            (.publicRead, input(publicURL.replacingOccurrences(of: "aaaa", with: "AAAA"))),
            (.publicRead, input(publicURL, "POST", nil, "{}")),
            (.publicRead, input(publicURL, "GET", "NONISSUED_FIXTURE")),
            (.member, input(publicURL, "GET", "NONISSUED_FIXTURE")),
        ]
        for (lane, value) in badRequests {
            do {
                _ = try policy.request(for: lane, input: value)
                preconditionFailure("An invalid invitation operation was accepted")
            } catch SoeMemberRequestPolicyError.rejected {}
        }
        print("Swift salon invitations passed three accepted links, \(badLinks.count + 1) rejected links, one anonymous GET, and \(badRequests.count) refused requests.")
    }
}
