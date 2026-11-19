import Foundation

private struct SoeAdmissionPolicyFailure: Error { let name: String }

/// Actual Foundation policy execution. This neither sends HTTP nor runs an iOS app.
func runSoeMemberAdmissionPolicyTests() throws {
    let origin = "https://native-admission.invalid", member = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    let circle = "dddddddd-dddd-4ddd-8ddd-dddddddddddd", key = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    let token = "NONISSUED_SYNTHETIC_MEMBER", recipient = "soe-cr1.e30." + String(repeating: "A", count: 43)
    let approval = "soe-ci1.e30." + String(repeating: "A", count: 43)
    let policy = try SoeMemberRequestPolicy(memberOrigin: origin, providerOrigin: nil, publishableKey: nil)
    let base = "/api/circles/" + circle + "/"
    let owner = "\"expectedMemberId\":\"" + member + "\""
    let request = ",\"requestId\":\"" + key + "\",\"expectedRevision\":0"
    let cases: [(String, String)] = [
        ("admission-access", "{" + owner + "}"),
        ("recipient-code", "{" + owner + ",\"shareConsent\":true}"),
        ("invitation-review", "{" + owner + ",\"recipientCode\":\"" + recipient + "\"}"),
        ("invitations", "{" + owner + ",\"recipientCode\":\"" + recipient + "\",\"targetMemberId\":\"" + member + "\",\"requestId\":\"" + key + "\",\"expectedRevision\":0,\"expectedInvitationRevision\":1,\"expectedTargetLabel\":\"Synthetic reader\",\"expiresAt\":\"2030-01-01T00:00:00.000Z\"}"),
        ("invitation-check", "{" + owner + ",\"invitationToken\":\"" + approval + "\"}"),
        ("join-invited", "{" + owner + request + ",\"invitationToken\":\"" + approval + "\"}"),
        ("invitation-receipt", "{" + owner + request + ",\"approvalNonce\":\"" + key + "\",\"proofHash\":\"" + String(repeating: "a", count: 64) + "\"}"),
        ("invitations/revoke", "{" + owner + request + ",\"expectedInvitationRevision\":1}")
    ]
    var checks = 0
    func expect(_ condition: Bool, _ name: String) throws {
        checks += 1; if !condition { throw SoeAdmissionPolicyFailure(name: name) }
    }
    func rejected(_ name: String, _ work: () throws -> Void) throws {
        checks += 1
        do { try work() } catch { return }
        throw SoeAdmissionPolicyFailure(name: name)
    }
    func input(_ action: String, _ raw: String, method: String = "POST", url: String? = nil) -> SoeMemberWireInput {
        SoeMemberWireInput(url: url ?? origin + base + action, method: method, bearer: token, body: raw)
    }
    for (action, raw) in cases {
        let r = try policy.request(for: .member, input: input(action, raw))
        try expect(r.httpMethod == "POST" && r.httpShouldHandleCookies == false, action + " method/cookies")
        try expect(r.httpBody == Data(raw.utf8) && r.value(forHTTPHeaderField: "Authorization") == "Bearer " + token, action + " exact body/bearer")
        try rejected(action + " GET") { _ = try policy.request(for: .member, input: input(action, raw, method: "GET")) }
        try rejected(action + " query") { _ = try policy.request(for: .member, input: input(action, raw, url: origin + base + action + "?")) }
        try rejected(action + " alias") { _ = try policy.request(for: .member, input: input(action, raw, url: origin + base + action + "/")) }
        try rejected(action + " whitespace") { _ = try policy.request(for: .member, input: input(action, raw + " ")) }
        for lane in [SoeMemberLane.publicRead, .messageReview, .circleReview, .auth] {
            try rejected(action + " other lane") { _ = try policy.request(for: lane, input: input(action, raw)) }
        }
    }
    let sharing = cases[1].1, issue = cases[3].1, receipt = cases[6].1
    let invalid: [(String, String)] = [
        ("recipient-code", sharing.replacingOccurrences(of: "true", with: "false")),
        ("recipient-code", "{" + owner + ",\"shareConsent\":true,\"shareConsent\":true}"),
        ("recipient-code", "{\"shareConsent\":true," + owner + "}"),
        ("recipient-code", sharing.replacingOccurrences(of: member, with: member.uppercased())),
        ("recipient-code", String(repeating: "x", count: 4097)),
        ("invitation-review", "{" + owner + ",\"targetMemberId\":\"" + member + "\"}"),
        ("invitation-check", cases[4].1.replacingOccurrences(of: approval, with: recipient)),
        ("invitation-check", cases[4].1.replacingOccurrences(of: approval, with: "soe-ci1.e30." + String(repeating: "A", count: 44))),
        ("invitation-receipt", receipt.replacingOccurrences(of: "\"expectedRevision\":0", with: "\"expectedRevision\":9007199254740992")),
        ("invitation-receipt", receipt.replacingOccurrences(of: String(repeating: "a", count: 64), with: String(repeating: "A", count: 64))),
        ("invitations", issue.replacingOccurrences(of: "\"expectedInvitationRevision\":1", with: "\"expectedInvitationRevision\":0")),
        ("invitations", issue.replacingOccurrences(of: "Synthetic reader", with: "name@example.invalid")),
        ("invitations", issue.replacingOccurrences(of: "2030-01-01", with: "2030-02-30")),
        ("invitations", issue.replacingOccurrences(of: ".000Z", with: "Z")),
        ("invitations", issue.replacingOccurrences(of: "T00:00:00", with: "T24:00:00"))
    ]
    for (action, raw) in invalid { try rejected(action + " malformed envelope") { _ = try policy.request(for: .member, input: input(action, raw)) } }
    for url in [origin + base + "recipient-code#x", origin + base + "%72ecipient-code", "https://foreign.invalid" + base + "recipient-code", origin + "/api/circles/" + circle.uppercased() + "/recipient-code"] {
        try rejected("origin/encoded/case boundary") { _ = try policy.request(for: .member, input: input("recipient-code", sharing, url: url)) }
    }
    let create = "{" + owner + ",\"requestId\":\"" + key + "\",\"title\":\"Native private salon\",\"description\":null,\"format\":\"in_person\",\"city\":\"Boston\",\"region\":null,\"venueName\":\"Public library\",\"venueType\":\"library\",\"weekday\":2,\"time\":\"19:00\",\"timezone\":\"UTC\",\"startDate\":\"2030-01-01\",\"maxMembers\":8,\"onlineUrl\":null,\"admissionMode\":\"host_approval\"}"
    _ = try policy.request(for: .member, input: input("", create, url: origin + "/api/circles")); checks += 1
    try rejected("unknown admission mode") { _ = try policy.request(for: .member, input: input("", create.replacingOccurrences(of: "host_approval", with: "private"), url: origin + "/api/circles")) }
    print("PASS native admission policy: " + String(checks) + " checks; Foundation/Mac only")
}
