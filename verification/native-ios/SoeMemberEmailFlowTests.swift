import Foundation

private enum EmailTestFailure: Error { case assertion(String), store }

private func emailCheck(_ value: @autoclosure () throws -> Bool, _ label: String) throws {
    guard try value() else { throw EmailTestFailure.assertion(label) }
}

private func emailRefuses(_ label: String, _ work: () throws -> Void) throws {
    do { try work() } catch { return }
    throw EmailTestFailure.assertion("Expected refusal: " + label)
}

private final class EmailTestClock { var now: Int64 = 1_700_000_000_000 }

private final class EmailTestVault: SoeMemberEmailBindingStore {
    var generation = "00000000-0000-0000-0000-000000000001"
    var raw: String?
    var writes: [String?] = []
    var failWrite = false
    func readEmailBinding(generation: String) throws -> String? {
        guard generation == self.generation else { throw EmailTestFailure.store }
        return raw
    }
    func writeEmailBinding(_ value: String?, generation: String) throws {
        guard generation == self.generation, !failWrite, value.map({ $0.utf8.count <= 8192 }) ?? true else { throw EmailTestFailure.store }
        writes.append(value)
        raw = value
    }
    func mutate(_ work: (inout [String: Any]) -> Void) throws {
        var object = try JSONSerialization.jsonObject(with: Data(raw!.utf8)) as! [String: Any]
        work(&object)
        raw = try emailJSON(object)
    }
}

private func emailJSON(_ value: [String: Any]) throws -> String {
    String(data: try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes]), encoding: .utf8)!
}
private func emailQuote(_ value: String) -> String {
    "\"" + value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
}
private func emailBase64(_ value: Data) -> String {
    value.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
}

private final class EmailFixture {
    let clock = EmailTestClock()
    let vault = EmailTestVault()
    let flow: SoeMemberEmailFlow
    let generation = "00000000-0000-0000-0000-000000000001"
    let subject = "11111111-1111-1111-1111-111111111111"
    let provider = "https://synthetic.invalid"
    let callback = "com.soe.synthetic.email://auth/callback"
    let key = "sb_publishable_synthetic000000000000000000"
    let password = "synthetic-password"
    init() throws {
        let clock = self.clock
        var serial = 0
        flow = try SoeMemberEmailFlow(providerOrigin: provider, publishableKey: key,
            callbackURL: callback, clock: { clock.now }, randomBytes: { Data(0..<32) }, newFlowId: {
                serial += 1
                return String(format: "22222222-2222-2222-2222-%012d", serial)
            })
    }
    func prepare(_ purpose: String = "recovery") throws -> SoeMemberEmailPending {
        try flow.prepare(purpose: purpose, email: "synthetic@example.invalid", generation: generation, vault: vault)
    }
    func startInput(_ pending: SoeMemberEmailPending, _ family: String? = nil) -> SoeMemberWireInput {
        let family = family ?? (pending.purpose == "recovery" ? "recover" : "signup")
        let encoded = pending.redirectTo.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"))!
        let extra = family == "signup" ? ",\"password\":" + emailQuote(password) + ",\"data\":{}" : family == "resend" ? ",\"type\":\"signup\"" : ""
        return SoeMemberWireInput(url: provider + "/auth/v1/" + family + "?redirect_to=" + encoded,
            method: "POST", bearer: nil, body: "{\"email\":" + emailQuote(pending.email) + extra + ",\"code_challenge\":" + emailQuote(pending.challenge) + ",\"code_challenge_method\":\"s256\",\"gotrue_meta_security\":{}}")
    }
    func start(_ pending: SoeMemberEmailPending, _ family: String? = nil) throws -> SoeMemberEmailPermit {
        try flow.authorize(input: startInput(pending, family), flowId: pending.flowId, generation: generation, vault: vault).permit
    }
    func capture(_ pending: SoeMemberEmailPending, code: String = "synthetic-code") throws {
        try flow.capture(pending.redirectTo + "&code=" + code, generation: generation, vault: vault)
    }
    func ready(_ purpose: String = "recovery") throws -> SoeMemberEmailClaim {
        let p = try prepare(purpose)
        _ = try start(p)
        try capture(p)
        return try flow.claim(flowId: p.flowId, generation: generation, vault: vault)
    }
    func exchangeInput(_ claim: SoeMemberEmailClaim) -> SoeMemberWireInput {
        SoeMemberWireInput(url: provider + "/auth/v1/token?grant_type=pkce", method: "POST", bearer: nil,
            body: "{\"auth_code\":" + emailQuote(claim.code) + ",\"code_verifier\":" + emailQuote(claim.verifier) + "}")
    }
    func exchange(_ claim: SoeMemberEmailClaim) throws -> SoeMemberEmailPermit {
        try flow.authorize(input: exchangeInput(claim), flowId: claim.flowId, generation: generation, vault: vault).permit
    }
    func session(_ purpose: String = "recovery", mutate: (inout [String: Any], inout [String: Any]) -> Void = { _, _ in }) throws -> (String, String) {
        let seconds = clock.now / 1000
        var claims: [String: Any] = ["sub": subject, "exp": seconds + 3600,
            "amr": [["method": purpose == "recovery" ? "recovery" : "email/signup", "timestamp": seconds]]]
        var body: [String: Any] = ["refresh_token": "synthetic-refresh", "token_type": "bearer", "user": ["id": subject], "expires_at": seconds + 3600]
        mutate(&claims, &body)
        let token = "synthetic." + emailBase64(Data(try emailJSON(claims).utf8)) + ".signature"
        if body["access_token"] == nil { body["access_token"] = token }
        return (token, try emailJSON(body))
    }
    func reply(_ permit: SoeMemberEmailPermit, _ input: SoeMemberWireInput, _ body: String = "{}", status: Int = 200, url: String? = nil, redirected: Bool = false) throws {
        try flow.receive(permit, response: SoeMemberWireResponse(status: status, url: url ?? input.url, body: body, redirected: redirected), vault: vault)
    }
    func exchanged(_ claim: SoeMemberEmailClaim) throws -> String {
        let permit = try exchange(claim), (token, body) = try session(claim.purpose)
        try reply(permit, exchangeInput(claim), body)
        return token
    }
    func userInput(_ token: String, update: Bool = false) -> SoeMemberWireInput {
        SoeMemberWireInput(url: provider + "/auth/v1/user", method: update ? "PUT" : "GET", bearer: token,
            body: update ? "{\"password\":" + emailQuote(password) + ",\"code_challenge\":null,\"code_challenge_method\":null}" : nil)
    }
    func verify(_ claim: SoeMemberEmailClaim, token: String) throws {
        let input = userInput(token)
        let permit = try flow.authorize(input: input, flowId: claim.flowId, generation: generation, vault: vault).permit
        try reply(permit, input, "{\"id\":\"" + subject + "\"}")
    }
}

/// Synthetic clock/store/provider replies only. No Keychain or HTTP operations.
func runSoeMemberEmailFlowTests() throws {
    var count = 0
    func test(_ name: String, _ run: () throws -> Void) throws {
        try run()
        count += 1
        print("PASS email \(count): \(name)")
    }

    try test("S256 preparation, typed projection, exact installed redirect and durable-only binding") {
        let f = try EmailFixture(), p = try f.prepare()
        try emailCheck(p.phase == "waiting" && p.expiresAt - p.createdAt == 3_600_000, "binding TTL")
        try emailCheck(p.redirectTo == f.callback + "?flow=" + p.flowId, "installed callback")
        let saved = try JSONSerialization.jsonObject(with: Data(f.vault.raw!.utf8)) as! [String: Any]
        try emailCheck(saved["verifier"] as? String == "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8", "32-byte verifier")
        try emailCheck(p.challenge == "6oZqdX5MOLq_qBJ8vppAnT4fk6AP8UiP9zX8-Rev_9A", "known SHA256 S256 vector")
        let publicJSON = String(data: try JSONEncoder().encode(p), encoding: .utf8)!
        try emailCheck(!publicJSON.contains("verifier") && !publicJSON.contains("code\""), "metadata excludes secrets")
        try emailCheck(f.flow.nextClaimDeadline == nil && f.vault.writes.count == 1, "no claim or network from prepare")
    }
    try test("configuration requires canonical HTTPS origin, publishable key and installed callback form") {
        for origin in ["http://synthetic.invalid", "https://synthetic.invalid/", "https://synthetic.invalid:443", "https://user@synthetic.invalid", "https://synthetic..invalid", "https://synthetic.invalid?x=1"] {
            try emailRefuses(origin) { _ = try SoeMemberEmailFlow(providerOrigin: origin, publishableKey: "sb_publishable_00000000000000000000", callbackURL: "com.soe.email://auth/callback") }
        }
        for callback in ["com.soe.email://other/callback", "com.soe.email://auth/callback/", "com.soe.email://auth/callback?flow=x", "https://auth/callback"] {
            try emailRefuses(callback) { _ = try SoeMemberEmailFlow(providerOrigin: "https://synthetic.invalid", publishableKey: "sb_publishable_00000000000000000000", callbackURL: callback) }
        }
        try emailRefuses("secret key") { _ = try SoeMemberEmailFlow(providerOrigin: "https://synthetic.invalid", publishableKey: "sb_secret_00000000000000000000", callbackURL: "com.soe.email://auth/callback") }
    }
    try test("signup, resend and recovery preserve canonical envelopes and consume start once") {
        for family in ["signup", "resend", "recover"] {
            let f = try EmailFixture(), p = try f.prepare(family == "recover" ? "recovery" : "signup"), input = f.startInput(p, family)
            let pair = try f.flow.authorize(input: input, flowId: p.flowId, generation: f.generation, vault: f.vault)
            try emailCheck(pair.request.httpMethod == "POST" && pair.request.httpBody == Data(input.body!.utf8), "wire bytes")
            try emailCheck(pair.request.value(forHTTPHeaderField: "apikey") == f.key && pair.request.value(forHTTPHeaderField: "Authorization") == nil, "headers")
            try emailCheck(!pair.request.httpShouldHandleCookies && pair.request.value(forHTTPHeaderField: "Cache-Control") == "no-store", "no cookies/cache")
            try emailRefuses("second start") { _ = try f.start(p, family) }
            f.flow.failed(pair.permit)
            try emailRefuses("lost start is not retryable") { _ = try f.start(p, family) }
            try emailCheck(try f.flow.pending(generation: f.generation, vault: f.vault) != nil, "uncertain unclaimed binding retained")
        }
    }
    try test("noncanonical and cross-purpose request bodies cannot reserve a family") {
        let f = try EmailFixture(), p = try f.prepare(), base = f.startInput(p)
        let body = base.body!
        for candidate in [" " + body, body + "\n", body.replacingOccurrences(of: "\"email\":", with: "\"email\":\"other@example.invalid\",\"email\":"), body.replacingOccurrences(of: "s256", with: "S256"), body.replacingOccurrences(of: "{}", with: "{\"captcha_token\":\"x\"}"), body.replacingOccurrences(of: "\"email\"", with: "\"\\u0065mail\"")] {
            try emailRefuses("canonical start") { _ = try f.flow.authorize(input: SoeMemberWireInput(url: base.url, method: "POST", bearer: nil, body: candidate), flowId: p.flowId, generation: f.generation, vault: f.vault) }
        }
        try emailRefuses("recovery cannot signup") { _ = try f.start(p, "signup") }
        try emailRefuses("wrong origin") { _ = try f.flow.authorize(input: SoeMemberWireInput(url: base.url.replacingOccurrences(of: f.provider, with: "https://elsewhere.invalid"), method: "POST", bearer: nil, body: body), flowId: p.flowId, generation: f.generation, vault: f.vault) }
        _ = try f.start(p)
    }
    try test("exact callback binding rejects aliases, duplicate/query confusion and unsent callbacks") {
        let f = try EmailFixture(), p = try f.prepare()
        try f.capture(p)
        try emailCheck(try f.flow.pending(generation: f.generation, vault: f.vault)?.phase == "waiting", "unsent callback ignored")
        _ = try f.start(p)
        for raw in [p.redirectTo + "&code=good&code=bad", p.redirectTo + "&code=good#fragment", p.redirectTo + "&code=good&unexpected=1", p.redirectTo + "&code=%0a", p.redirectTo + "&code=%ZZ", p.redirectTo + "&code=good&error=bad", p.redirectTo.replacingOccurrences(of: "auth/callback", with: "AUTH/callback") + "&code=good", p.redirectTo.replacingOccurrences(of: "auth/callback", with: "auth/%63allback") + "&code=good", p.redirectTo.replacingOccurrences(of: "auth/callback", with: "evil@auth/callback") + "&code=good"] {
            try emailRefuses("callback") { try f.flow.capture(raw, generation: f.generation, vault: f.vault) }
        }
        try f.flow.capture(f.callback + "?flow=33333333-3333-3333-3333-333333333333&code=wrong", generation: f.generation, vault: f.vault)
        try emailCheck(try f.flow.pending(generation: f.generation, vault: f.vault)?.phase == "waiting", "wrong flow ignored")
        try f.capture(p, code: "first")
        try f.capture(p, code: "second")
        let c = try f.flow.claim(flowId: p.flowId, generation: f.generation, vault: f.vault)
        try emailCheck(c.code == "first", "callback cannot overwrite")
    }
    try test("canonical-equivalent Unicode email cannot replace the exact prepared bytes") {
        let f = try EmailFixture()
        let p = try f.flow.prepare(purpose: "recovery", email: "e\u{301}@example.invalid", generation: f.generation, vault: f.vault)
        let input = f.startInput(p)
        let changed = input.body!.replacingOccurrences(of: "e\u{301}@example.invalid", with: "\u{e9}@example.invalid")
        try emailRefuses("Unicode normalization changes identity") {
            _ = try f.flow.authorize(input: SoeMemberWireInput(url: input.url, method: input.method, bearer: nil, body: changed), flowId: p.flowId, generation: f.generation, vault: f.vault)
        }
        _ = try f.start(p)
    }
    try test("provider error is reduced to phase without retaining arbitrary error text") {
        let f = try EmailFixture(), p = try f.prepare()
        _ = try f.start(p)
        try f.flow.capture(p.redirectTo + "&error=expired&error_description=PRIVATE_ERROR_TEXT", generation: f.generation, vault: f.vault)
        try emailCheck(try f.flow.pending(generation: f.generation, vault: f.vault)?.phase == "callback_error", "error phase")
        try emailCheck(!f.vault.raw!.contains("PRIVATE_ERROR_TEXT"), "error text omitted")
        try emailRefuses("error cannot claim") { _ = try f.flow.claim(flowId: p.flowId, generation: f.generation, vault: f.vault) }
    }
    try test("unclaimed binding survives retirement/reconstruction; erasure commits before one-time claim") {
        let f = try EmailFixture(), p = try f.prepare()
        _ = try f.start(p); try f.capture(p)
        f.flow.retire()
        let reopened = try SoeMemberEmailFlow(providerOrigin: f.provider, publishableKey: f.key, callbackURL: f.callback, clock: { f.clock.now })
        try emailCheck(try reopened.pending(generation: f.generation, vault: f.vault)?.phase == "callback_ready", "durable reopen")
        f.vault.failWrite = true
        try emailRefuses("erase failure") { _ = try reopened.claim(flowId: p.flowId, generation: f.generation, vault: f.vault) }
        try emailCheck(reopened.nextClaimDeadline == nil && f.vault.raw != nil, "no claim on failed erase")
        f.vault.failWrite = false
        let c = try reopened.claim(flowId: p.flowId, generation: f.generation, vault: f.vault)
        try emailCheck(f.vault.raw == nil && f.vault.writes.last! == nil && c.expiresAt == f.clock.now + 300_000, "erase precedes returned secret")
        try emailRefuses("second claim") { _ = try reopened.claim(flowId: p.flowId, generation: f.generation, vault: f.vault) }
    }
    try test("expired, future and stale-code bindings erase; malformed binding refuses") {
        for mode in ["expired", "future", "code"] {
            let f = try EmailFixture(), p = try f.prepare()
            if mode == "code" { _ = try f.start(p); try f.capture(p); f.clock.now += 300_000 }
            else { f.clock.now += mode == "expired" ? 3_600_000 : -1 }
            try emailCheck(try f.flow.pending(generation: f.generation, vault: f.vault) == nil && f.vault.raw == nil, "expiry clears " + mode)
        }
        for mutation in ["extra", "challenge", "boolean-time", "phase", "code"] {
            let f = try EmailFixture(); _ = try f.prepare()
            try f.vault.mutate { value in
                switch mutation {
                case "extra": value["extra"] = 1
                case "challenge": value["challenge"] = "A"
                case "boolean-time": value["createdAt"] = true
                case "phase": value["phase"] = "accepted"
                default: value["code"] = "unexpected"
                }
            }
            try emailRefuses("malformed store " + mutation) { _ = try f.flow.pending(generation: f.generation, vault: f.vault) }
        }
    }
    try test("exchange requires exact one-use code and verifier; no refresh lane") {
        let f = try EmailFixture(), c = try f.ready(), input = f.exchangeInput(c)
        try emailRefuses("alternate verifier") { _ = try f.flow.authorize(input: SoeMemberWireInput(url: input.url, method: "POST", bearer: nil, body: input.body!.replacingOccurrences(of: c.verifier, with: "wrong")), flowId: c.flowId, generation: f.generation, vault: f.vault) }
        try emailRefuses("refresh") { _ = try f.flow.authorize(input: SoeMemberWireInput(url: f.provider + "/auth/v1/token?grant_type=refresh_token", method: "POST", bearer: nil, body: "{\"refresh_token\":\"x\"}"), flowId: c.flowId, generation: f.generation, vault: f.vault) }
        _ = try f.exchange(c)
        try emailRefuses("second exchange") { _ = try f.exchange(c) }
        try emailCheck(f.vault.raw == nil, "no new disk credentials")
    }
    try test("exchange validates purpose, subject, AMR, freshness and expires_at before accepting bearer") {
        for mutation in ["purpose", "mixed-amr", "empty-amr", "future-amr", "zero-amr", "boolean-exp", "short-exp", "long-exp", "subject", "user", "expires_at", "refresh", "type", "access"] {
            let f = try EmailFixture(), c = try f.ready(), permit = try f.exchange(c)
            let (_, body) = try f.session { claims, value in
                switch mutation {
                case "purpose": claims["amr"] = [["method": "email/signup", "timestamp": f.clock.now / 1000]]
                case "mixed-amr": claims["amr"] = [["method": "recovery", "timestamp": 1], ["method": "password", "timestamp": 1]]
                case "empty-amr": claims["amr"] = []
                case "future-amr": claims["amr"] = [["method": "recovery", "timestamp": f.clock.now / 1000 + 31]]
                case "zero-amr": claims["amr"] = [["method": "recovery", "timestamp": 0]]
                case "boolean-exp": claims["exp"] = true
                case "short-exp": claims["exp"] = f.clock.now / 1000 + 120
                case "long-exp": claims["exp"] = f.clock.now / 1000 + 31_536_001
                case "subject": claims["sub"] = "33333333-3333-3333-3333-333333333333"
                case "user": value["user"] = ["id": "not-a-uuid"]
                case "expires_at": value["expires_at"] = f.clock.now / 1000 + 3599
                case "refresh": value["refresh_token"] = "contains spaces"
                case "type": value["token_type"] = "other"
                default: value["access_token"] = "not.a.jwt"
                }
            }
            try emailRefuses("session " + mutation) { try f.reply(permit, f.exchangeInput(c), body) }
            try emailCheck(f.flow.nextClaimDeadline == nil && f.vault.raw == nil, "invalid token retires")
            try emailRefuses("invalid exchange cannot retry") { _ = try f.exchange(c) }
        }
    }
    try test("recovery requires fresh exact bearer /user proof before one canonical update") {
        let f = try EmailFixture(), c = try f.ready(), token = try f.exchanged(c)
        let writes = f.vault.writes.count
        try emailRefuses("update before user") { _ = try f.flow.authorize(input: f.userInput(token, update: true), flowId: c.flowId, generation: f.generation, vault: f.vault) }
        try emailRefuses("different bearer") { _ = try f.flow.authorize(input: f.userInput("different"), flowId: c.flowId, generation: f.generation, vault: f.vault) }
        try f.verify(c, token: token)
        let input = f.userInput(token, update: true)
        let pair = try f.flow.authorize(input: input, flowId: c.flowId, generation: f.generation, vault: f.vault)
        try emailCheck(pair.request.value(forHTTPHeaderField: "Authorization") == "Bearer " + token, "exact bearer")
        try emailRefuses("second update") { _ = try f.flow.authorize(input: input, flowId: c.flowId, generation: f.generation, vault: f.vault) }
        try f.reply(pair.permit, input, "{\"user\":{\"id\":\"" + f.subject + "\"}}")
        try emailCheck(f.flow.nextClaimDeadline == nil && f.vault.raw == nil && f.vault.writes.count == writes, "update retires memory without ordinary persistence")
    }
    try test("signup verification cannot authorize recovery update") {
        let f = try EmailFixture(), c = try f.ready("signup"), token = try f.exchanged(c)
        try f.verify(c, token: token)
        try emailRefuses("signup update") { _ = try f.flow.authorize(input: f.userInput(token, update: true), flowId: c.flowId, generation: f.generation, vault: f.vault) }
        f.flow.retire()
        try emailCheck(f.flow.nextClaimDeadline == nil, "confirmation can retire")
    }
    try test("user and final update receipts must bind the exchange subject") {
        for update in [false, true] {
            let f = try EmailFixture(), c = try f.ready(), token = try f.exchanged(c)
            if update { try f.verify(c, token: token) }
            let input = f.userInput(token, update: update)
            let permit = try f.flow.authorize(input: input, flowId: c.flowId, generation: f.generation, vault: f.vault).permit
            try emailRefuses("wrong subject") { try f.reply(permit, input, "{\"id\":\"33333333-3333-3333-3333-333333333333\"}") }
            try emailCheck(f.flow.nextClaimDeadline == nil, "wrong subject retires")
        }
    }
    try test("response URL, redirects, status, object and size are independently bounded") {
        for mode in ["url", "redirect", "status", "array", "oversized"] {
            let f = try EmailFixture(), c = try f.ready(), permit = try f.exchange(c), (_, body) = try f.session()
            try emailRefuses("receipt " + mode) {
                try f.reply(permit, f.exchangeInput(c), mode == "array" ? "[]" : mode == "oversized" ? String(repeating: " ", count: 262145) : body,
                    status: mode == "status" ? 503 : 200, url: mode == "url" ? "https://elsewhere.invalid" : nil, redirected: mode == "redirect")
            }
            try emailCheck(f.flow.nextClaimDeadline == nil, "receipt failure retires")
        }
    }
    try test("late/replayed responses cannot affect a replacement claim") {
        let f = try EmailFixture(), old = try f.ready(), oldPermit = try f.exchange(old)
        let fresh = try f.ready(), current = try f.exchange(fresh), (_, body) = try f.session()
        try emailRefuses("late old response") { try f.reply(oldPermit, f.exchangeInput(old), body) }
        f.flow.failed(oldPermit)
        try emailCheck(f.flow.nextClaimDeadline != nil, "old failure leaves current claim")
        try f.reply(current, f.exchangeInput(fresh), body)
        try emailRefuses("replayed response") { try f.reply(current, f.exchangeInput(fresh), body) }
        try emailCheck(f.flow.nextClaimDeadline != nil, "replayed receipt leaves accepted current claim")
    }
    try test("failure, discard and explicit retirement invalidate memory without erasing unrelated pending") {
        let f = try EmailFixture(), c = try f.ready(), permit = try f.exchange(c)
        f.flow.failed(permit)
        try emailCheck(f.flow.nextClaimDeadline == nil, "failed exchange retires")
        try emailRefuses("failed claim cannot retry") { _ = try f.exchange(c) }
        let next = try f.prepare()
        try f.flow.discard(flowId: c.flowId, generation: f.generation, vault: f.vault)
        try emailCheck(try f.flow.pending(generation: f.generation, vault: f.vault)?.flowId == next.flowId, "old discard keeps replacement")
        f.flow.retire()
        try emailCheck(try f.flow.pending(generation: f.generation, vault: f.vault)?.flowId == next.flowId, "retire keeps unclaimed slot")
        try f.flow.discard(flowId: next.flowId, generation: f.generation, vault: f.vault)
        try emailCheck(f.vault.raw == nil, "matching discard erases")
    }
    try test("stale vault generation rejects pending, request and response authority") {
        let f = try EmailFixture(), c = try f.ready(), permit = try f.exchange(c), (_, body) = try f.session()
        f.vault.generation = "99999999-9999-9999-9999-999999999999"
        try emailRefuses("reset pending") { _ = try f.flow.pending(generation: f.generation, vault: f.vault) }
        try emailRefuses("reset response") { try f.reply(permit, f.exchangeInput(c), body) }
        try emailCheck(f.flow.nextClaimDeadline == nil, "generation failure retires claim")
        try emailRefuses("reset request") { _ = try f.exchange(c) }
    }
    try test("claim deadline is checked without timer and failed expiry cannot revive") {
        let f = try EmailFixture(), c = try f.ready(), permit = try f.exchange(c), (_, body) = try f.session()
        f.clock.now = c.expiresAt
        try emailRefuses("late response") { try f.reply(permit, f.exchangeInput(c), body) }
        try emailCheck(f.flow.nextClaimDeadline == nil && !f.flow.expireIfNeeded(), "deadline already retired")
        f.clock.now -= 10
        try emailRefuses("clock reverse cannot revive") { _ = try f.exchange(c) }
    }
    try test("short-lived fresh token narrows deadline; recovery needs two minutes of remaining claim") {
        let f = try EmailFixture(), c = try f.ready(), permit = try f.exchange(c)
        let (token, body) = try f.session { claims, value in
            claims["exp"] = f.clock.now / 1000 + 121
            value["expires_at"] = f.clock.now / 1000 + 121
        }
        try f.reply(permit, f.exchangeInput(c), body)
        try emailCheck(f.flow.nextClaimDeadline == f.clock.now + 1000, "token freshness deadline")
        f.clock.now += 1000
        try emailCheck(f.flow.expireIfNeeded(), "timer-independent expiry")
        try emailRefuses("expired user") { _ = try f.flow.authorize(input: f.userInput(token), flowId: c.flowId, generation: f.generation, vault: f.vault) }
        let g = try EmailFixture(), d = try g.ready(), bearer = try g.exchanged(d)
        try g.verify(d, token: bearer)
        g.clock.now = d.expiresAt - 120_000
        try emailRefuses("insufficient recovery window") { _ = try g.flow.authorize(input: g.userInput(bearer, update: true), flowId: d.flowId, generation: g.generation, vault: g.vault) }
    }
    try test("claimed scope retires on backward clock and bad generation/input bounds refuse") {
        let f = try EmailFixture(), c = try f.ready()
        f.clock.now -= 1
        try emailCheck(f.flow.expireIfNeeded(), "backward clock")
        try emailRefuses("expired exchange") { _ = try f.exchange(c) }
        try emailRefuses("noncanonical generation") { _ = try f.flow.prepare(purpose: "signup", email: "synthetic@example.invalid", generation: "ABC", vault: f.vault) }
        for email in [" leading@example.invalid", "x@x", "x\n@example.invalid", String(repeating: "a", count: 250) + "@x.invalid"] {
            try emailRefuses("email bounds") { _ = try f.flow.prepare(purpose: "signup", email: email, generation: f.generation, vault: f.vault) }
        }
    }
    print("SoeMemberEmailFlowTests: \(count) passed; synthetic stores/replies; zero provider or Keychain operations")
}
