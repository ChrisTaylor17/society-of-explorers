import Foundation
import CoreFoundation
import CryptoKit
import Security

/// This slot is independent of ordinary member/provider session storage. The
/// owning actor serializes all calls, including authorize and physical enqueue.
protocol SoeMemberEmailBindingStore: AnyObject {
    func readEmailBinding(generation: String) throws -> String?
    func writeEmailBinding(_ value: String?, generation: String) throws
}

extension SoeMemberVault: SoeMemberEmailBindingStore {}

enum SoeMemberEmailFlowError: Error { case invalidInput, unavailable }

struct SoeMemberEmailPending: Codable, Sendable, Equatable {
    let flowId: String
    let purpose: String
    let email: String
    let challenge: String
    let redirectTo: String
    let createdAt: Int64
    let expiresAt: Int64
    let phase: String
}

struct SoeMemberEmailClaim: Codable, Sendable, Equatable {
    let flowId: String
    let purpose: String
    let email: String
    let code: String
    let verifier: String
    let expiresAt: Int64
}

/// Opaque, single-use response authority. Contains no code, verifier or token.
struct SoeMemberEmailPermit: Sendable, Equatable {
    fileprivate let id: UUID
    fileprivate let epoch: UUID
    fileprivate let generation: String
    fileprivate let flowId: String
    fileprivate let family: String
    fileprivate let url: String
    fileprivate let claimId: UUID?
}

/// Synchronous, actor-confined email quarantine. No network, timer, ordinary
/// session storage, or refresh operation exists here. The owner cancels leases
/// on retirement and schedules nextClaimDeadline; every operation also checks
/// the wall-clock deadline so a delayed timer cannot extend authority.
final class SoeMemberEmailFlow {
    private struct Binding: Codable {
        let version: Int
        let flowId: String
        let purpose: String
        let email: String
        let verifier: String
        let challenge: String
        let redirectTo: String
        let createdAt: Int64
        let expiresAt: Int64
        var phase: String
        var started: Bool
        var code: String?
        var receivedAt: Int64?

        var metadata: SoeMemberEmailPending {
            SoeMemberEmailPending(flowId: flowId, purpose: purpose, email: email,
                challenge: challenge, redirectTo: redirectTo, createdAt: createdAt,
                expiresAt: expiresAt, phase: phase)
        }

        func encode() throws -> String {
            // JSONEncoder omits nil values; the durable contract has exact keys.
            let value: [String: Any] = ["version": version, "flowId": flowId,
                "purpose": purpose, "email": email, "verifier": verifier,
                "challenge": challenge, "redirectTo": redirectTo,
                "createdAt": createdAt, "expiresAt": expiresAt, "phase": phase,
                "started": started, "code": code as Any? ?? NSNull(),
                "receivedAt": receivedAt as Any? ?? NSNull()]
            let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])
            guard data.count <= 8192, let raw = String(data: data, encoding: .utf8) else { throw SoeMemberEmailFlowError.invalidInput }
            return raw
        }
    }

    private struct Scope {
        let id: UUID
        let generation: String
        let binding: Binding
        let claimDeadline: Int64
        var deadline: Int64
        var used = Set<String>()
        var bearer: String?
        var subject: String?
        var tokenExpiresAt: Int64 = 0
        var verified = false
    }

    private static let ttl: Int64 = 3_600_000
    private static let codeTTL: Int64 = 300_000
    private static let safeInteger: Int64 = 9_007_199_254_740_991
    private let providerOrigin: String
    private let publishableKey: String
    private let callbackURL: String
    private let clock: () -> Int64
    private let randomBytes: () throws -> Data
    private let newFlowId: () -> String
    private var epoch = UUID()
    private var scope: Scope?
    private var permits: [UUID: SoeMemberEmailPermit] = [:]

    init(providerOrigin: String, publishableKey: String, callbackURL: String,
         clock: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) },
         randomBytes: @escaping () throws -> Data = SoeMemberEmailFlow.secureRandom,
         newFlowId: @escaping () -> String = { UUID().uuidString.lowercased() }) throws {
        guard Self.origin(providerOrigin), Self.matches(publishableKey, "sb_publishable_[A-Za-z0-9_-]{20,200}"),
              callbackURL.utf8.count <= 300,
              Self.matches(callbackURL, "[a-z][a-z0-9.-]*\\.email://auth/callback") else { throw SoeMemberEmailFlowError.invalidInput }
        self.providerOrigin = providerOrigin
        self.publishableKey = publishableKey
        self.callbackURL = callbackURL
        self.clock = clock
        self.randomBytes = randomBytes
        self.newFlowId = newFlowId
    }

    var nextClaimDeadline: Int64? { scope?.deadline }

    @discardableResult func expireIfNeeded() -> Bool {
        if let current = scope, clock() < current.binding.createdAt || clock() >= current.deadline {
            retire()
            return true
        }
        return false
    }

    func retire() {
        scope = nil
        permits.removeAll()
        epoch = UUID()
    }

    func prepare(purpose: String, email: String, generation: String,
                 vault: any SoeMemberEmailBindingStore) throws -> SoeMemberEmailPending {
        try validGeneration(generation)
        guard ["signup", "recovery"].contains(purpose), Self.validEmail(email) else { throw SoeMemberEmailFlowError.invalidInput }
        let now = try currentTime()
        guard now <= Self.safeInteger - Self.ttl else { throw SoeMemberEmailFlowError.invalidInput }
        let bytes = try randomBytes()
        guard bytes.count == 32 else { throw SoeMemberEmailFlowError.unavailable }
        let flow = newFlowId()
        try validGeneration(flow)
        let verifier = Self.base64url(bytes)
        let value = Binding(version: 1, flowId: flow, purpose: purpose, email: email,
            verifier: verifier, challenge: Self.challenge(verifier),
            redirectTo: callbackURL + "?flow=" + flow, createdAt: now,
            expiresAt: now + Self.ttl, phase: "waiting", started: false)
        try vault.writeEmailBinding(value.encode(), generation: generation)
        retire()
        return value.metadata
    }

    func pending(generation: String, vault: any SoeMemberEmailBindingStore) throws -> SoeMemberEmailPending? {
        expireIfNeeded()
        return try read(generation: generation, vault: vault)?.metadata
    }

    func capture(_ raw: String, generation: String, vault: any SoeMemberEmailBindingStore) throws {
        guard raw.utf16.count <= 4096, raw.hasPrefix(callbackURL + "?"), !raw.contains("#") else { throw SoeMemberEmailFlowError.invalidInput }
        let query = String(raw.dropFirst(callbackURL.count + 1))
        var fields: [String: String] = [:]
        for part in query.split(separator: "&", omittingEmptySubsequences: false) {
            let pair = part.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard pair.count == 2 else { throw SoeMemberEmailFlowError.invalidInput }
            let key = String(pair[0])
            guard ["flow", "code", "error", "error_code", "error_description"].contains(key), fields[key] == nil,
                  let value = String(pair[1]).replacingOccurrences(of: "+", with: " ").removingPercentEncoding,
                  value.utf16.count <= 2048, Self.noControls(value) else { throw SoeMemberEmailFlowError.invalidInput }
            fields[key] = value
        }
        guard let flow = fields["flow"] else { throw SoeMemberEmailFlowError.invalidInput }
        try validGeneration(flow)
        let validCode = Set(fields.keys) == Set(["flow", "code"]) && Self.matches(fields["code"] ?? "", "[A-Za-z0-9._~-]{1,2048}")
        let providerError = Self.matches(fields["error"] ?? "", "[A-Za-z0-9_-]{1,100}") && fields["code"] == nil
        guard validCode || providerError else { throw SoeMemberEmailFlowError.invalidInput }
        guard var value = try read(generation: generation, vault: vault), value.flowId == flow,
              value.started, value.phase == "waiting" else { return }
        if validCode {
            value.phase = "callback_ready"
            value.code = fields["code"]
            value.receivedAt = try currentTime()
        } else {
            value.phase = "callback_error"
        }
        try vault.writeEmailBinding(value.encode(), generation: generation)
    }

    func claim(flowId: String, generation: String, vault: any SoeMemberEmailBindingStore) throws -> SoeMemberEmailClaim {
        try validGeneration(flowId)
        guard let value = try read(generation: generation, vault: vault), value.flowId == flowId,
              value.phase == "callback_ready", value.started, let code = value.code, let received = value.receivedAt else { throw SoeMemberEmailFlowError.unavailable }
        // Durable erasure must succeed before code/verifier can leave this scope.
        try vault.writeEmailBinding(nil, generation: generation)
        retire()
        let deadline = min(value.expiresAt, received + Self.codeTTL)
        scope = Scope(id: UUID(), generation: generation, binding: value, claimDeadline: deadline, deadline: deadline)
        return SoeMemberEmailClaim(flowId: flowId, purpose: value.purpose, email: value.email,
            code: code, verifier: value.verifier, expiresAt: deadline)
    }

    func discard(flowId: String, generation: String, vault: any SoeMemberEmailBindingStore) throws {
        try validGeneration(flowId)
        let matches = try read(generation: generation, vault: vault)?.flowId == flowId
        if matches { try vault.writeEmailBinding(nil, generation: generation) }
        if matches || scope?.binding.flowId == flowId { retire() }
    }

    func authorize(input: SoeMemberWireInput, flowId: String, generation: String,
                   vault: any SoeMemberEmailBindingStore) throws -> (request: URLRequest, permit: SoeMemberEmailPermit) {
        expireIfNeeded()
        try validGeneration(generation)
        try validGeneration(flowId)
        guard input.url.utf16.count <= 2048, let url = URL(string: input.url), url.absoluteString == input.url,
              input.body.map({ $0.utf8.count <= 16384 }) ?? true else { throw SoeMemberEmailFlowError.invalidInput }
        let family: String
        if input.method == "POST", let candidate = ["signup", "resend", "recover"].first(where: {
            input.url.hasPrefix(providerOrigin + "/auth/v1/" + $0 + "?redirect_to=")
        }) { family = candidate }
        else if input.method == "POST" && input.url == providerOrigin + "/auth/v1/token?grant_type=pkce" { family = "exchange" }
        else if input.method == "GET" && input.url == providerOrigin + "/auth/v1/user" { family = "user" }
        else if input.method == "PUT" && input.url == providerOrigin + "/auth/v1/user" { family = "update" }
        else { throw SoeMemberEmailFlowError.invalidInput }
        let body = try input.body.map { try Self.object($0, limit: 16384) }
        var claimId: UUID?
        if ["signup", "resend", "recover"].contains(family) {
            guard input.bearer == nil, var value = try read(generation: generation, vault: vault),
                  value.flowId == flowId, value.phase == "waiting", !value.started, let body,
                  (value.purpose == "signup" && ["signup", "resend"].contains(family)) || (value.purpose == "recovery" && family == "recover"),
                  input.url == providerOrigin + "/auth/v1/" + family + "?redirect_to=" + Self.encodeURIComponent(value.redirectTo) else { throw SoeMemberEmailFlowError.invalidInput }
            let extra = family == "signup" ? ["password", "data"] : family == "resend" ? ["type"] : []
            let order = ["email"] + extra + ["code_challenge", "code_challenge_method", "gotrue_meta_security"]
            guard Set(body.keys) == Set(order), Self.exact(body["email"] as? String, value.email),
                  body["code_challenge"] as? String == value.challenge, body["code_challenge_method"] as? String == "s256",
                  Self.emptyObject(body["gotrue_meta_security"]),
                  family != "signup" || (Self.emptyObject(body["data"]) && Self.validPassword(body["password"] as? String)),
                  family != "resend" || body["type"] as? String == "signup",
                  Self.exact(input.body, try Self.canonical(body, order: order)) else { throw SoeMemberEmailFlowError.invalidInput }
            value.started = true
            // A lost send/response is never retried with this binding.
            try vault.writeEmailBinding(value.encode(), generation: generation)
        } else {
            _ = try vault.readEmailBinding(generation: generation) // Reset-generation fence, no ordinary storage.
            guard var current = scope, current.generation == generation, current.binding.flowId == flowId,
                  !current.used.contains(family) else { throw SoeMemberEmailFlowError.unavailable }
            let now = try currentTime()
            if family == "exchange" {
                guard input.bearer == nil, let body, Set(body.keys) == Set(["auth_code", "code_verifier"]),
                      body["auth_code"] as? String == current.binding.code,
                      body["code_verifier"] as? String == current.binding.verifier,
                      Self.exact(input.body, try Self.canonical(body, order: ["auth_code", "code_verifier"])) else { throw SoeMemberEmailFlowError.invalidInput }
            } else {
                guard let bearer = current.bearer, input.bearer == bearer, current.tokenExpiresAt > now + 120_000 else { throw SoeMemberEmailFlowError.unavailable }
                if family == "user" {
                    guard input.body == nil else { throw SoeMemberEmailFlowError.invalidInput }
                } else {
                    guard current.binding.purpose == "recovery", current.verified,
                          min(current.tokenExpiresAt, current.claimDeadline) > now + 120_000,
                          let body, Set(body.keys) == Set(["password", "code_challenge", "code_challenge_method"]),
                          Self.validPassword(body["password"] as? String), body["code_challenge"] is NSNull,
                          body["code_challenge_method"] is NSNull,
                          Self.exact(input.body, try Self.canonical(body, order: ["password", "code_challenge", "code_challenge_method"])) else { throw SoeMemberEmailFlowError.invalidInput }
                }
            }
            current.used.insert(family)
            claimId = current.id
            scope = current
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 15)
        request.httpMethod = input.method
        request.httpShouldHandleCookies = false
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let bearer = input.bearer { request.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
        if let raw = input.body { request.httpBody = Data(raw.utf8); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let permit = SoeMemberEmailPermit(id: UUID(), epoch: epoch, generation: generation,
            flowId: flowId, family: family, url: input.url, claimId: claimId)
        permits[permit.id] = permit
        return (request, permit)
    }

    func receive(_ permit: SoeMemberEmailPermit, response: SoeMemberWireResponse,
                 vault: any SoeMemberEmailBindingStore) throws {
        expireIfNeeded()
        guard permits.removeValue(forKey: permit.id) == permit, permit.epoch == epoch else { throw SoeMemberEmailFlowError.unavailable }
        do {
            guard response.status == 200, response.url == permit.url, !response.redirected else { throw SoeMemberEmailFlowError.unavailable }
            let value = try Self.object(response.body, limit: 262144)
            if let claimId = permit.claimId {
                _ = try vault.readEmailBinding(generation: permit.generation)
                guard var current = scope, current.id == claimId, current.generation == permit.generation else { throw SoeMemberEmailFlowError.unavailable }
                if permit.family == "exchange" {
                    guard let access = value["access_token"] as? String, let refresh = value["refresh_token"] as? String,
                          Self.token(access), Self.token(refresh), value["token_type"] as? String == "bearer",
                          let user = value["user"] as? [String: Any], let subject = user["id"] as? String else { throw SoeMemberEmailFlowError.invalidInput }
                    try validGeneration(subject)
                    let parts = access.split(separator: ".", omittingEmptySubsequences: false)
                    guard parts.count == 3, parts.allSatisfy({ Self.matches(String($0), "[A-Za-z0-9_-]+") }),
                          let decoded = Self.decodeBase64url(String(parts[1])), let raw = String(data: decoded, encoding: .utf8) else { throw SoeMemberEmailFlowError.invalidInput }
                    let claims = try Self.object(raw, limit: 16384)
                    let now = try currentTime() / 1000
                    let seconds = try Self.integer(claims["exp"])
                    let responseExpiry = try value["expires_at"].map { try Self.integer($0) }
                    guard claims["sub"] as? String == subject, seconds > now + 120, seconds <= now + 31_536_000,
                          responseExpiry == nil || responseExpiry == seconds,
                          let amr = claims["amr"] as? [[String: Any]], (1...8).contains(amr.count) else { throw SoeMemberEmailFlowError.invalidInput }
                    for entry in amr {
                        let timestamp = try Self.integer(entry["timestamp"])
                        guard entry["method"] as? String == (current.binding.purpose == "recovery" ? "recovery" : "email/signup"),
                              timestamp > 0, timestamp <= now + 30 else { throw SoeMemberEmailFlowError.invalidInput }
                    }
                    current.bearer = access // Refresh token is validated and immediately discarded.
                    current.subject = subject
                    current.tokenExpiresAt = seconds * 1000
                    current.deadline = min(current.claimDeadline, seconds * 1000 - 120_000)
                    scope = current
                } else {
                    let user = value["user"] as? [String: Any] ?? value
                    guard user["id"] as? String == current.subject else { throw SoeMemberEmailFlowError.invalidInput }
                    if permit.family == "user" { current.verified = true; scope = current }
                    else { retire() }
                }
            } else {
                guard try read(generation: permit.generation, vault: vault)?.flowId == permit.flowId else { throw SoeMemberEmailFlowError.unavailable }
            }
        } catch {
            if let claimId = permit.claimId, scope?.id == claimId { retire() }
            throw error
        }
    }

    func failed(_ permit: SoeMemberEmailPermit) {
        guard permits.removeValue(forKey: permit.id) == permit else { return }
        if let claimId = permit.claimId, scope?.id == claimId { retire() }
    }

    private func read(generation: String, vault: any SoeMemberEmailBindingStore) throws -> Binding? {
        try validGeneration(generation)
        guard let raw = try vault.readEmailBinding(generation: generation) else { return nil }
        let value = try Self.object(raw, limit: 8192)
        guard Set(value.keys) == Set(["version", "flowId", "purpose", "email", "verifier", "challenge", "redirectTo", "createdAt", "expiresAt", "phase", "started", "code", "receivedAt"]),
              try Self.integer(value["version"]) == 1,
              let flow = value["flowId"] as? String, let purpose = value["purpose"] as? String,
              ["signup", "recovery"].contains(purpose), let email = value["email"] as? String, Self.validEmail(email),
              let verifier = value["verifier"] as? String, Self.matches(verifier, "[A-Za-z0-9_-]{43}"),
              let challenge = value["challenge"] as? String, challenge == Self.challenge(verifier),
              let redirect = value["redirectTo"] as? String, redirect == callbackURL + "?flow=" + flow,
              let phase = value["phase"] as? String, ["waiting", "callback_ready", "callback_error"].contains(phase),
              let startedNumber = value["started"] as? NSNumber, CFGetTypeID(startedNumber) == CFBooleanGetTypeID() else { throw SoeMemberEmailFlowError.invalidInput }
        try validGeneration(flow)
        let created = try Self.integer(value["createdAt"]), expires = try Self.integer(value["expiresAt"]), now = try currentTime()
        guard created <= Self.safeInteger - Self.ttl, expires == created + Self.ttl else { throw SoeMemberEmailFlowError.invalidInput }
        if created > now || expires <= now { try vault.writeEmailBinding(nil, generation: generation); return nil }
        let code = value["code"] as? String
        let received = value["receivedAt"] is NSNull ? nil : try Self.integer(value["receivedAt"])
        if phase == "callback_ready" {
            guard let code, Self.matches(code, "[A-Za-z0-9._~-]{1,2048}"), let received,
                  received >= created, received <= now else { throw SoeMemberEmailFlowError.invalidInput }
        } else {
            guard value["code"] is NSNull, received == nil else { throw SoeMemberEmailFlowError.invalidInput }
        }
        if let received, received + Self.codeTTL <= now { try vault.writeEmailBinding(nil, generation: generation); return nil }
        return Binding(version: 1, flowId: flow, purpose: purpose, email: email, verifier: verifier,
            challenge: challenge, redirectTo: redirect, createdAt: created, expiresAt: expires,
            phase: phase, started: startedNumber.boolValue, code: code, receivedAt: received)
    }

    private func validGeneration(_ value: String) throws {
        guard Self.matches(value, "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}") else { throw SoeMemberEmailFlowError.invalidInput }
    }

    private func currentTime() throws -> Int64 {
        let now = clock()
        guard now >= 0, now <= Self.safeInteger - Self.ttl else { throw SoeMemberEmailFlowError.unavailable }
        return now
    }

    private static func secureRandom() throws -> Data {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw SoeMemberEmailFlowError.unavailable }
        return Data(bytes)
    }
    private static func base64url(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    private static func challenge(_ value: String) -> String { base64url(Data(SHA256.hash(data: Data(value.utf8)))) }
    private static func decodeBase64url(_ raw: String) -> Data? {
        let value = raw.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        return Data(base64Encoded: value + String(repeating: "=", count: (4 - value.count % 4) % 4))
    }
    private static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: "\\A(?:" + pattern + ")\\z", options: .regularExpression) != nil
    }
    private static func noControls(_ value: String) -> Bool { !value.unicodeScalars.contains { $0.value < 32 || $0.value == 127 } }
    private static func exact(_ value: String?, _ expected: String) -> Bool { value.map { $0.utf8.elementsEqual(expected.utf8) } ?? false }
    private static func validEmail(_ value: String) -> Bool {
        (3...254).contains(value.utf16.count) && value == value.trimmingCharacters(in: .whitespacesAndNewlines) && noControls(value) && matches(value, "[^\\s@]+@[^\\s@]+\\.[^\\s@]+")
    }
    private static func validPassword(_ value: String?) -> Bool {
        guard let value else { return false }
        return (8...1024).contains(value.utf16.count) && noControls(value)
    }
    private static func token(_ value: String) -> Bool { (1...16384).contains(value.utf16.count) && matches(value, "[A-Za-z0-9._~+/-]+=*") }
    private static func emptyObject(_ value: Any?) -> Bool { (value as? [String: Any])?.isEmpty == true }
    private static func integer(_ value: Any?) throws -> Int64 {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue >= 0, number.doubleValue <= Double(safeInteger),
              number.doubleValue.rounded(.towardZero) == number.doubleValue else { throw SoeMemberEmailFlowError.invalidInput }
        return number.int64Value
    }
    private static func object(_ raw: String, limit: Int) throws -> [String: Any] {
        guard raw.utf8.count <= limit,
              let value = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any] else { throw SoeMemberEmailFlowError.invalidInput }
        return value
    }
    private static func canonical(_ value: [String: Any], order: [String]) throws -> String {
        let fields = try order.map { key -> String in
            let encoded: String
            if let text = value[key] as? String {
                guard noControls(text) else { throw SoeMemberEmailFlowError.invalidInput }
                encoded = "\"" + text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
            } else if value[key] is NSNull { encoded = "null" }
            else if emptyObject(value[key]) { encoded = "{}" }
            else { throw SoeMemberEmailFlowError.invalidInput }
            return "\"" + key + "\":" + encoded
        }
        return "{" + fields.joined(separator: ",") + "}"
    }
    private static func encodeURIComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"))!
    }
    private static func origin(_ value: String) -> Bool {
        guard value.utf8.count <= 300, matches(value, "https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?"),
              let url = URLComponents(string: value), let host = url.host,
              url.port == nil || ((1...65535).contains(url.port!) && url.port != 443) else { return false }
        return host.split(separator: ".", omittingEmptySubsequences: false).allSatisfy { !$0.isEmpty && $0.count <= 63 && !$0.hasPrefix("-") && !$0.hasSuffix("-") }
    }
}
