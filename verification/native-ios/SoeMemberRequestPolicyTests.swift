import Foundation

private struct SoeRequestPolicyTestFailure: Error { let name: String }

/// Compiled Foundation policy tests, not an installed iOS bridge or HTTP test.
func runSoeMemberRequestPolicyTests() throws {
    var checks = 0
    func expect(_ condition: @autoclosure () throws -> Bool, _ name: String) throws {
        checks += 1; if try !condition() { throw SoeRequestPolicyTestFailure(name: name) }
    }
    func rejects(_ name: String, _ work: () throws -> Void) throws {
        checks += 1
        do { try work() } catch is SoeMemberRequestPolicyError { return }
        catch { throw SoeRequestPolicyTestFailure(name: "Unexpected unsanitized policy error: " + name) }
        throw SoeRequestPolicyTestFailure(name: name)
    }
    let origin = "https://member.example.invalid", provider = "https://provider.example.invalid"
    let key = "sb_publishable_" + String(repeating: "A", count: 24), token = "SYNTHETIC.token-not-issued"
    let a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222", c = "abcdefab-cdef-4abc-8def-abcdefabcdef"
    let hash = String(repeating: "a", count: 64), edition = "pg-1656-" + String(repeating: "a", count: 64)
    let philemonEdition = "web-classic-b2bc6316f4217a8c97637d44786a4cd6b9b9a83b88cd4880b5aacdf67cae4e19"
    let policy = try SoeMemberRequestPolicy(memberOrigin: origin, providerOrigin: provider, publishableKey: key)
    let noAuth = try SoeMemberRequestPolicy(memberOrigin: origin, providerOrigin: nil, publishableKey: nil)
    func input(_ lane: SoeMemberLane, _ path: String, _ method: String = "GET", _ body: String? = nil, bearer: String? = nil) -> SoeMemberWireInput {
        SoeMemberWireInput(url: (lane == .auth ? provider : origin) + path, method: method,
                           bearer: bearer ?? ([.member, .messageReview, .circleReview].contains(lane) ? token : nil), body: body)
    }
    @discardableResult func accepts(_ lane: SoeMemberLane, _ path: String, _ method: String = "GET", _ body: String? = nil, bearer: String? = nil) throws -> URLRequest {
        let i = input(lane, path, method, body, bearer: bearer), r = try policy.request(for: lane, input: i)
        try expect(r.url?.absoluteString == i.url && r.httpMethod == method, "preserved URL and method")
        try expect(r.cachePolicy == .reloadIgnoringLocalCacheData && !r.httpShouldHandleCookies, "cache and cookie policy")
        try expect(r.value(forHTTPHeaderField: "Cache-Control") == "no-store" && r.value(forHTTPHeaderField: "Pragma") == "no-cache", "private request headers")
        try expect(r.value(forHTTPHeaderField: "Cookie") == nil, "no cookies")
        if method == "GET" { try expect(r.httpBody == nil && r.value(forHTTPHeaderField: "Content-Type") == nil, "GET has no body") }
        else { try expect(r.httpBody == Data((body ?? "").utf8) && r.value(forHTTPHeaderField: "Content-Type") == "application/json", "exact body bytes") }
        if lane == .publicRead { try expect(r.value(forHTTPHeaderField: "Authorization") == nil && r.value(forHTTPHeaderField: "apikey") == nil, "anonymous public read") }
        return r
    }
    func denies(_ lane: SoeMemberLane, _ path: String, _ method: String = "GET", _ body: String? = nil, bearer: String? = nil) throws {
        try rejects("denied route/body") { _ = try policy.request(for: lane, input: input(lane, path, method, body, bearer: bearer)) }
    }

    for origin in ["https://member.example.invalid", "https://member.example.invalid:8443", "https://127.0.0.1:8443", "https://localhost"] {
        try expect(try SoeMemberRequestPolicy.checkedOrigin(origin) == origin, "canonical configured origin")
    }
    for origin in ["", "http://member.example.invalid", "https://MEMBER.example.invalid", "https://member.example.invalid/", "https://member.example.invalid?q=1", "https://member.example.invalid#x", "https://user:password@member.example.invalid", "https://member.example.invalid:443", "https://member.example.invalid:0", "https://member.example.invalid:65536", "https://member.example.invalid:08443", "https://127.1", "https://2130706433", "https://0x7f000001", "https://127.000.0.1", "https://256.0.0.1", "https://-bad.invalid", "https://bad-.invalid", "https://bad..invalid", "https://" + String(repeating: "a", count: 64) + ".invalid", "https://bad.invalid\n", "https://é.invalid", "https://[::1]"] {
        try rejects("invalid configured origin") { _ = try SoeMemberRequestPolicy.checkedOrigin(origin) }
    }
    for (p, k) in [(provider as String?, nil as String?), (nil, key), (provider, "issued-or-secret-key"), ("", "")] {
        try rejects("partial or invalid provider configuration") { _ = try SoeMemberRequestPolicy(memberOrigin: origin, providerOrigin: p, publishableKey: k) }
    }
    try rejects("disabled auth") { _ = try noAuth.request(for: .auth, input: input(.auth, "/auth/v1/user", bearer: token)) }
    for url in ["http://member.example.invalid/api/auth/member", "https://MEMBER.example.invalid/api/auth/member", origin + ":443/api/auth/member", "https://member.example.invalid.evil.invalid/api/auth/member", "https://user@member.example.invalid/api/auth/member", origin + "//api/auth/member", origin + "/api/../api/auth/member", origin + "/api/%61uth/member", origin + "/api/auth/member#x", origin + "/api/auth/member?", origin + "/api/auth/member\n", origin + "\\api/auth/member", origin + "/api/auth/member/", origin + "/api/auth/member%00"] {
        try rejects("noncanonical or foreign URL") { _ = try policy.request(for: .member, input: SoeMemberWireInput(url: url, method: "GET", bearer: token, body: nil)) }
    }
    for bearer in [nil, "", "has space", "line\nbreak", "Bearer token", String(repeating: "a", count: 16385)] as [String?] {
        try rejects("member bearer boundary") { _ = try policy.request(for: .member, input: SoeMemberWireInput(url: origin + "/api/auth/member", method: "GET", bearer: bearer, body: nil)) }
    }
    for method in ["get", "PUT", "PATCH", "DELETE", "OPTIONS", "POST\r\nX: 1"] { try denies(.member, "/api/auth/member", method) }

    for path in ["/api/auth/member", "/api/circles/start", "/api/members/profile", "/api/great-books/progress", "/api/great-books/progress?bookId=apology", "/api/circles/mine?after=" + a, "/api/circles/contributions?after=" + c, "/api/circles/" + a, "/api/circles/" + a + "/membership", "/api/book-salons/" + a, "/api/circles/" + a + "/messages/" + b, "/api/circles/" + a + "/messages/" + b + "/ai-consent"] { try accepts(.member, path) }
    try accepts(.member, "/api/auth/ensure-member", "POST", "{}")
    let discussion = "/api/circles/" + c + "/discussion"
    for q in ["", "?before=" + a + "&limit=25", "?message=" + b + "&after=" + a + "&limit=1", "?requestId=" + c] { try accepts(.member, discussion + q) }
    for q in ["?limit=0", "?limit=26", "?limit=01", "?requestId=" + c + "&limit=1", "?after=" + a, "?message=" + a + "&before=" + b, "?before=" + a + "&before=" + b, "?before=%31" + a.dropFirst(), "?limit=1&"] { try denies(.member, discussion + q) }
    for path in [discussion, discussion + "/preview", "/api/book-salons/" + a, "/api/circles/" + a + "/messages/" + b] { try accepts(.member, path, "POST", "{}") }
    try accepts(.member, discussion, "POST", String(repeating: "x", count: 16384)) // Existing opaque-body lane; server owns its semantic parser.
    try denies(.member, discussion, "POST", String(repeating: "x", count: 16385))
    try denies(.member, "/api/auth/member", "GET", "")
    try denies(.member, "/api/circles")

    let join = "{\"requestId\":\"\(c)\",\"expectedRevision\":0}"
    let joinReverse = "{\"expectedRevision\":0,\"requestId\":\"\(c)\"}"
    try accepts(.member, "/api/circles/" + a + "/join", "POST", join)
    try accepts(.member, "/api/circles/" + a + "/leave", "POST", joinReverse)
    let attendance = "{\"expectedMemberId\":\"\(a)\",\"requestId\":\"\(c)\",\"expectedRevision\":0,\"date\":\"2028-02-29\",\"status\":\"going\"}"
    let complete = "{\"expectedMemberId\":\"\(a)\",\"requestId\":\"\(c)\",\"expectedRevision\":0}"
    try accepts(.member, "/api/circles/" + a + "/rsvp", "POST", attendance)
    try accepts(.member, "/api/circles/" + a + "/complete", "POST", complete)
    try denies(.member, "/api/circles/" + a + "/rsvp", "POST", attendance.replacingOccurrences(of: "2028-02-29", with: "2027-02-29"))
    let consent = "{\"expectedConsentRevision\":0,\"contentHash\":\"\(hash)\",\"policy\":\"anthropic-message-review-v1\",\"allowed\":false}"
    let consentPath = "/api/circles/" + a + "/messages/" + b + "/ai-consent"
    try accepts(.member, consentPath, "POST", consent)
    try denies(.member, consentPath, "POST", consent.replacingOccurrences(of: "anthropic", with: "openai"))
    try denies(.member, consentPath, "POST", consent.replacingOccurrences(of: "false", with: "0"))
    let saved = "{\"expectedMemberId\":\"\(a)\",\"expectedRevision\":0,\"bookId\":\"apology\",\"action\":\"save\",\"editionId\":\"\(edition)\",\"blockIndex\":42,\"completed\":false}"
    let removed = "{\"expectedMemberId\":\"\(a)\",\"expectedRevision\":0,\"bookId\":\"apology\",\"action\":\"remove\"}"
    try accepts(.member, "/api/great-books/progress", "POST", saved)
    try accepts(.member, "/api/great-books/progress", "POST", removed)
    try denies(.member, "/api/great-books/progress", "POST", saved.replacingOccurrences(of: "\"blockIndex\":42", with: "\"blockIndex\":100000"))
    let patch = "{\"displayName\":\"Explorer\",\"bio\":\"A line\\nAnother line\",\"discipline\":\"\",\"skills\":[\"Reading\"],\"projectDescription\":\"\",\"seeking\":\"\",\"philosophy\":\"\",\"visibility\":\"private\"}"
    let profile = "{\"expectedMemberId\":\"\(a)\",\"expectedRevision\":0,\"patch\":\(patch)}"
    try accepts(.member, "/api/members/profile", "POST", profile)
    try accepts(.member, "/api/members/profile", "POST", profile.replacingOccurrences(of: "Explorer", with: String(repeating: "🌍", count: 100)))
    try denies(.member, "/api/members/profile", "POST", profile.replacingOccurrences(of: "Explorer", with: String(repeating: "🌍", count: 101)))
    try accepts(.member, "/api/members/profile", "POST", profile.replacingOccurrences(of: "Explorer", with: "e\u{301}"))
    try denies(.member, "/api/members/profile", "POST", profile.replacingOccurrences(of: "Explorer", with: "\\u0045xplorer"))
    try denies(.member, "/api/members/profile", "POST", profile.replacingOccurrences(of: "Explorer", with: "\\ud800"))
    try denies(.member, "/api/members/profile", "POST", profile.replacingOccurrences(of: "Explorer", with: " Explorer"))
    let creation = "{\"expectedMemberId\":\"\(a)\",\"requestId\":\"\(c)\",\"title\":\"A Circle\",\"description\":null,\"format\":\"in_person\",\"city\":\"Boston\",\"region\":null,\"venueName\":\"Library\",\"venueType\":\"library\",\"weekday\":2,\"time\":\"19:00\",\"timezone\":\"UTC\",\"startDate\":\"2026-11-10\",\"maxMembers\":8,\"onlineUrl\":null}"
    try accepts(.member, "/api/circles", "POST", creation)
    let program = ",\"readingProgram\":{\"version\":1,\"bookId\":\"apology\",\"editionId\":\"\(edition)\",\"sessions\":[{\"from\":0,\"to\":10}]}"
    try accepts(.member, "/api/circles", "POST", String(creation.dropLast()) + program + "}")
    let philemonProgram = program.replacingOccurrences(of: "apology", with: "philemon")
        .replacingOccurrences(of: edition, with: philemonEdition).replacingOccurrences(of: "\"to\":10", with: "\"to\":0")
    let philemonCreation = String(creation.dropLast()) + philemonProgram + "}"
    try accepts(.member, "/api/circles", "POST", philemonCreation)
    try denies(.member, "/api/circles", "POST", philemonCreation.replacingOccurrences(of: philemonEdition, with: edition))
    try denies(.member, "/api/circles", "POST", philemonCreation.replacingOccurrences(of: "\"to\":0", with: "\"to\":1"))
    try denies(.member, "/api/great-books/progress", "POST", saved.replacingOccurrences(of: "apology", with: "philemon"))
    try denies(.member, "/api/circles", "POST", creation.replacingOccurrences(of: "A Circle", with: "A  Circle"))
    try denies(.member, "/api/circles", "POST", creation.replacingOccurrences(of: "\"maxMembers\":8", with: "\"maxMembers\":13"))
    func meeting(_ url: String) -> String { creation.replacingOccurrences(of: "in_person", with: "hybrid").replacingOccurrences(of: "\"onlineUrl\":null", with: "\"onlineUrl\":\"" + url + "\"") }
    for url in ["https://meet.example.invalid/room", "https://meet.example.invalid:8443/room?x=1#room", "https://meet.example.invalid./room", "https://meet_host.example.invalid/room", "https://127.0.0.1/room"] { try accepts(.member, "/api/circles", "POST", meeting(url)) }
    for url in ["http://meet.example.invalid/room", "https://meet.example.invalid", "https://user@meet.example.invalid/room", "https://meet.example.invalid:443/room", "https://meet.example.invalid:08443/room", "https://m%65et.example.invalid/room", "https://meet.example.invalid/a/../room", "https://meet.example.invalid/%2e/room", "https://meet.example.invalid/%2E%2e/room", "https://meet.example.invalid/room?x='a'", "https://127.1/room"] { try denies(.member, "/api/circles", "POST", meeting(url)) }

    let summary = "A human reviewed the available evidence."
    let messageDecision = "{\"expectedRevision\":0,\"contentHash\":\"\(hash)\",\"requestId\":\"\(c)\",\"action\":\"restore\",\"reason\":\"no_violation\",\"summary\":\"\(summary)\",\"evidenceReportId\":null,\"evidenceExcerpt\":null}"
    let listingDecision = messageDecision.replacingOccurrences(of: ",\"contentHash\":\"\(hash)\"", with: "")
    let messagePath = "/api/admin/circles/" + a + "/messages/" + b, listingPath = "/api/admin/circles/reports/" + a
    for (lane, path, decision) in [(SoeMemberLane.messageReview, messagePath, messageDecision), (.circleReview, listingPath, listingDecision)] {
        try accepts(lane, path)
        try accepts(lane, path, "POST", decision)
        try accepts(lane, path + "/coverage/decision", "POST", String(decision.dropLast()) + ",\"sessionId\":\"\(c)\"}")
        try accepts(lane, path + "/coverage?sessionId=" + c + "&page=42949673")
        try denies(lane, path + "/coverage?sessionId=" + c + "&page=42949674")
        try denies(lane, path + "/coverage?sessionId=" + c + "&page=01")
        try denies(lane, path + "/coverage")
        try denies(lane, path + "?sessionId=" + c)
        try accepts(lane, path + "/coverage", "POST", "{\"action\":\"ack\",\"sessionId\":\"\(a)\",\"pageToken\":\"\(b)\"}")
        let hide = decision.replacingOccurrences(of: "restore", with: "hide").replacingOccurrences(of: "no_violation", with: "safety").replacingOccurrences(of: "\"evidenceExcerpt\":null", with: "\"evidenceExcerpt\":\"Exact excerpt\"")
        try accepts(lane, path, "POST", hide)
        try denies(lane, path, "POST", hide.replacingOccurrences(of: "Exact excerpt", with: "Tiny"))
        try denies(lane, path, "POST", decision.replacingOccurrences(of: summary, with: "Too short"))
        try denies(lane, path, "POST", decision.replacingOccurrences(of: "restore", with: "delete"))
    }
    try accepts(.messageReview, "/api/admin/circles/messages?after=" + c)
    try accepts(.circleReview, "/api/admin/circles/reports?after=" + c)
    try accepts(.messageReview, messagePath + "/advice", "POST", "{\"expectedRevision\":0,\"contentHash\":\"\(hash)\"}")
    try accepts(.messageReview, messagePath + "/coverage", "POST", "{\"action\":\"start\",\"expectedRevision\":0,\"contentHash\":\"\(hash)\"}")
    try accepts(.circleReview, listingPath + "/coverage", "POST", "{\"action\":\"start\",\"expectedRevision\":0,\"contentHash\":null}")
    try denies(.circleReview, listingPath + "/advice", "POST", "{\"expectedRevision\":0,\"contentHash\":\"\(hash)\"}")
    try denies(.circleReview, listingPath, "POST", listingDecision.replacingOccurrences(of: "restore", with: "hide").replacingOccurrences(of: "no_violation", with: "inappropriate").replacingOccurrences(of: "\"evidenceExcerpt\":null", with: "\"evidenceExcerpt\":\"Exact excerpt\""))
    for lane in [SoeMemberLane.member, .publicRead, .circleReview, .auth] { try denies(lane, messagePath) }
    for lane in [SoeMemberLane.member, .publicRead, .messageReview, .auth] { try denies(lane, listingPath) }
    for lane in [SoeMemberLane.messageReview, .circleReview] { try denies(lane, "/api/auth/member") }
    try denies(.messageReview, "/api/admin/circles/messages?after=" + c.uppercased())

    for (lane, path, wire) in [(SoeMemberLane.member, "/api/circles/" + a + "/join", join), (.member, "/api/circles/" + a + "/rsvp", attendance), (.member, "/api/circles/" + a + "/complete", complete), (.member, consentPath, consent), (.member, "/api/great-books/progress", saved), (.member, "/api/members/profile", profile), (.member, "/api/circles", creation), (.messageReview, messagePath, messageDecision), (.circleReview, listingPath, listingDecision)] {
        for bad in [" " + wire, wire + "\n", String(wire.dropLast()) + ",\"extra\":true}", wire.replacingOccurrences(of: ":0", with: ":0.0"), wire.replacingOccurrences(of: ":0", with: ":false"), wire.replacingOccurrences(of: ":0", with: ":9007199254740992")] {
            // Hosting has no revision field; its other integers get independent tests.
            if bad != wire { try denies(lane, path, "POST", bad) }
        }
        let firstKey = wire.split(separator: ":", maxSplits: 1)[0].dropFirst()
        try denies(lane, path, "POST", String(wire.dropLast()) + "," + firstKey + ":null}")
    }

    let password = "{\"email\":\"synthetic@example.invalid\",\"password\":\"not-issued\",\"gotrue_meta_security\":{}}"
    let authRequest = try accepts(.auth, "/auth/v1/token?grant_type=password", "POST", password)
    try expect(authRequest.value(forHTTPHeaderField: "Authorization") == "Bearer " + key && authRequest.value(forHTTPHeaderField: "apikey") == key, "provider-owned headers")
    try expect(authRequest.value(forHTTPHeaderField: "X-Supabase-Api-Version") == "2024-01-01", "provider API version")
    try accepts(.auth, "/auth/v1/token?grant_type=refresh_token", "POST", "{\"refresh_token\":\"synthetic.refresh\"}")
    try accepts(.auth, "/auth/v1/user", bearer: token)
    try accepts(.auth, "/auth/v1/logout?scope=local", "POST", bearer: token)
    for path in ["/auth/v1/signup", "/auth/v1/recover", "/auth/v1/verify", "/auth/v1/authorize", "/auth/v1/token?grant_type=pkce", "/auth/v1/logout?scope=global", "/auth/v1/token?grant_type=password&redirect_to=https://evil.invalid", "/api/auth/member"] { try denies(.auth, path, "POST", password) }
    try denies(.auth, "/auth/v1/user", bearer: key)
    try denies(.auth, "/auth/v1/user")
    try denies(.auth, "/auth/v1/token?grant_type=password", "POST", password, bearer: token)
    try denies(.auth, "/auth/v1/token?grant_type=password", "POST", password.replacingOccurrences(of: "\"gotrue_meta_security\":{}", with: "\"gotrue_meta_security\":{\"captcha\":\"x\"}"))
    try denies(.auth, "/auth/v1/token?grant_type=password", "POST", "{\"email\":\"a@b.invalid\",\"email\":\"c@d.invalid\",\"password\":\"not-issued\"}")
    try denies(.auth, "/auth/v1/token?grant_type=password", "POST", "{\"email\":\"a@b.invalid\",\"password\":true}")
    try denies(.auth, "/auth/v1/token?grant_type=refresh_token", "POST", "{\"refresh_token\":\"synthetic\",\"provider_token\":\"x\"}")

    for path in ["/api/circles", "/api/circles?q=Caf%C3%A9+reading&city=New+York&format=in_person&open=1&sort=title&limit=24&cursor=abc_X-1", "/api/circles?book=apology&edition=" + edition + "&from=0&to=10", "/api/great-books/passage?book=apology&edition=" + edition + "&block=100000", "/api/great-books/text/apology", "/api/explorer/" + c] { try accepts(.publicRead, path) }
    for path in ["/api/circles?", "/api/circles?q=two%20words", "/api/circles?q=%c3%a9", "/api/circles?q=%FF", "/api/circles?q=two++words", "/api/circles?q=two%09words", "/api/circles?city=Boston&q=read", "/api/circles?q=one&q=two", "/api/circles?open=true", "/api/circles?sort=next", "/api/circles?format=hybrid", "/api/circles?limit=25", "/api/circles?book=apology", "/api/circles?book=apology&edition=" + edition + "&from=10&to=9", "/api/great-books/passage?edition=" + edition + "&book=apology&block=0", "/api/great-books/passage?book=apology&edition=" + edition + "&block=100001", "/api/great-books/text/unknown", "/api/explorer/" + c.uppercased(), "/api/members/profile"] { try denies(.publicRead, path) }
    try accepts(.publicRead, "/api/great-books/text/philemon")
    try denies(.publicRead, "/api/great-books/text/philemon", bearer: token)
    let philemonDiscovery = "/api/circles?book=philemon&edition=" + philemonEdition
    try accepts(.publicRead, philemonDiscovery)
    try accepts(.publicRead, philemonDiscovery + "&from=0&to=0")
    try denies(.publicRead, philemonDiscovery + "&from=0&to=1")
    try denies(.publicRead, "/api/circles?book=philemon&edition=" + edition)
    try denies(.publicRead, "/api/great-books/passage?book=philemon&edition=" + philemonEdition + "&block=0")
    try denies(.publicRead, "/api/circles", bearer: token)
    try denies(.publicRead, "/api/circles", "GET", "")
    try denies(.publicRead, "/api/circles", "POST", "{}")
    let onlinePath = "/api/circles?format=online"
    let online = try noAuth.request(for: .publicRead, input: input(.publicRead, onlinePath))
    try expect(online.url?.absoluteString == origin + onlinePath && online.httpMethod == "GET", "online search without provider configuration")
    try expect(!online.httpShouldHandleCookies && online.value(forHTTPHeaderField: "Cookie") == nil &&
               online.value(forHTTPHeaderField: "Authorization") == nil && online.value(forHTTPHeaderField: "apikey") == nil,
               "online search omits cookies and credentials")
    try denies(.publicRead, onlinePath + "&format=in_person")
    try denies(.publicRead, onlinePath, bearer: token)
    print("SOE_MEMBER_REQUEST_POLICY_TESTS " + String(checks) + " checks passed")
}
