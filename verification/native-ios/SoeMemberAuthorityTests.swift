import Foundation

private struct AuthorityTestFailure: Error {
    let message: String
}

private func check(_ value: @autoclosure () -> Bool, _ message: String) throws {
    if !value() { throw AuthorityTestFailure(message: message) }
}

private func denied<Value>(_ work: () async throws -> Value) async throws {
    do { _ = try await work() }
    catch SoeMemberCoreError.unavailable { return }
    throw AuthorityTestFailure(message: "Expected a closed native authority")
}

private final class RecordBackend: SoeMemberVaultRecordBackend, @unchecked Sendable {
    private let lock = NSLock()
    private var records: [String: Data] = [:]
    private var onRead: (@Sendable () throws -> Void)?

    func readRecord(namespace: String) throws -> Data? {
        try lock.withLock {
            let first = onRead
            onRead = nil
            try first?()
            return records[namespace]
        }
    }

    func replaceRecord(namespace: String, data: Data) {
        lock.withLock { records[namespace] = data }
    }

    func checkNextRead(_ check: @escaping @Sendable () throws -> Void) {
        lock.withLock { onRead = check }
    }
}

private final class SyntheticTransfer: SoeMemberHTTPTask, @unchecked Sendable {
    let request: URLRequest
    private let completion: @Sendable (Result<SoeMemberWireResponse, SoeMemberCoreError>) -> Void
    private let lock = NSLock()
    private var resumed = false
    private var cancelled = false

    init(request: URLRequest, completion: @escaping @Sendable (Result<SoeMemberWireResponse, SoeMemberCoreError>) -> Void) {
        self.request = request
        self.completion = completion
    }

    var didResume: Bool { lock.withLock { resumed } }
    var didCancel: Bool { lock.withLock { cancelled } }

    func resume() { lock.withLock { if !cancelled { resumed = true } } }
    // Deliberately do not call completion. Authority retirement must settle even
    // if a transport callback is delayed or never arrives.
    func cancel() { lock.withLock { cancelled = true } }

    func reply(body: String = "{}", url: String? = nil, status: Int = 200) {
        completion(.success(.init(status: status, url: url ?? request.url!.absoluteString, body: body, redirected: false)))
    }
}

private final class RecordingTransport: SoeMemberHTTPTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var tasks: [SyntheticTransfer] = []

    var count: Int { lock.withLock { tasks.count } }

    func makeTask(request: URLRequest, timeout: TimeInterval,
                  completion: @escaping @Sendable (Result<SoeMemberWireResponse, SoeMemberCoreError>) -> Void) throws -> any SoeMemberHTTPTask {
        try check(timeout > 0 && timeout <= 15, "Invalid remaining task lifetime")
        let task = SyntheticTransfer(request: request, completion: completion)
        lock.withLock { tasks.append(task) }
        return task
    }

    func started(_ index: Int) async throws -> SyntheticTransfer {
        for _ in 0..<400 {
            let task = lock.withLock { index < tasks.count ? tasks[index] : nil }
            if let task, task.didResume { return task }
            try await Task.sleep(for: .milliseconds(5))
        }
        throw AuthorityTestFailure(message: "Synthetic transfer never started")
    }
}

private let member = "https://soe.invalid"
private let provider = "https://auth.invalid"
private let publishable = "sb_publishable_syntheticAccountTestKey00"
private let fixedTime: Int64 = 1_800_000_000_000
private let memberRead = SoeMemberWireInput(url: member + "/api/auth/member", method: "GET", bearer: "synthetic.member.bearer", body: nil)

private func configuration() throws -> SoeMemberConfiguration {
    try SoeMemberConfiguration(applicationID: "org.soe.memberfixture", memberOrigin: member, storageKey: "soe-session",
                               providerOrigin: provider, publishableKey: publishable)
}

private func checkExclusive(_ config: SoeMemberConfiguration) throws {
    do {
        _ = try SoeMemberAuthority(configuration: config, backend: RecordBackend(), transport: RecordingTransport())
    } catch SoeMemberCoreError.unavailable {
        return
    }
    throw AuthorityTestFailure(message: "Another process-local authority acquired an owned namespace")
}

func runSoeMemberAuthorityTests() async throws {
    let config = try configuration()
    let other = try SoeMemberConfiguration(applicationID: "org.soe.otherfixture", memberOrigin: member, storageKey: "soe-session",
                                           providerOrigin: provider, publishableKey: publishable)
    try check(config.namespace != other.namespace && config.emailCallbackURL == "org.soe.memberfixture.email://auth/callback",
              "Installed identities must not share a stored account namespace")
    let backend = RecordBackend()
    let transport = RecordingTransport()
    let authority = try SoeMemberAuthority(configuration: config, backend: backend, transport: transport,
                                            clockMilliseconds: { fixedTime })
    try checkExclusive(config)
    let fence = authority.fence
    fence.update(appActive: true, protectedDataAvailable: true, connectivity: .online)
    let storage = try fence.stamp(for: .storage)
    let network = try fence.stamp(for: .network)
    let generation = try await authority.generation(stamp: storage)
    let requestA = try await authority.newRequestID(generation: generation, stamp: storage)
    let requestB = try await authority.newRequestID(generation: generation, stamp: storage)
    try check(UUID(uuidString: requestA)?.uuidString.lowercased() == requestA && requestA != requestB,
              "Logical request IDs must be new canonical UUIDs")
    try await authority.write(slot: "session", value: "synthetic-ordinary-session", generation: generation, stamp: storage)
    let session = try await authority.read(slot: "session", generation: generation, stamp: storage)
    try check(session == "synthetic-ordinary-session", "Protected session was not read back")
    print("PASS installed configuration separates namespaces and current generation owns slot access")

    let id = try await authority.begin(generation: generation, stamp: network)
    let pending = Task { try await authority.send(id: id, lane: .member, input: memberRead, stamp: network) }
    let first = try await transport.started(0)
    try await denied { try await authority.send(id: id, lane: .member, input: memberRead, stamp: network) }
    let cancelledDuplicate = Task {
        withUnsafeCurrentTask { $0?.cancel() }
        return try await authority.send(id: id, lane: .member, input: memberRead, stamp: network)
    }
    try await denied { try await cancelledDuplicate.value }
    // Give the duplicate's queued cancellation a chance to run before reply.
    try await Task.sleep(for: .milliseconds(20))
    try check(!first.didCancel && transport.count == 1, "Duplicate send interfered with the authorized request")
    try check(first.request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic.member.bearer" &&
              first.request.value(forHTTPHeaderField: "Cookie") == nil, "Member request lacked its exact header separation")
    first.reply()
    let accepted = try await pending.value
    try check(accepted.status == 200, "Current authorized reply was refused")
    try await denied { try await authority.send(id: id, lane: .member, input: memberRead, stamp: network) }
    print("PASS one-use lease delivers its exact reply and survives a cancelled duplicate caller")

    let refused = try await authority.begin(generation: generation, stamp: network)
    let foreignLane = SoeMemberWireInput(url: member + "/api/admin/circles/reports", method: "GET", bearer: memberRead.bearer, body: nil)
    try await denied { try await authority.send(id: refused, lane: .member, input: foreignLane, stamp: network) }
    try await denied { try await authority.send(id: refused, lane: .member, input: memberRead, stamp: network) }
    try check(transport.count == 1, "Rejected request must not create a transport task")
    print("PASS ordinary member lane cannot borrow review authority or retry a refused lease")

    let stale = try await authority.begin(generation: generation, stamp: network)
    let waiting = Task { try await authority.send(id: stale, lane: .member, input: memberRead, stamp: network) }
    let old = try await transport.started(1)
    fence.update(connectivity: .unknown)
    try check(old.didCancel, "Native network retirement did not stop the owned transfer synchronously")
    fence.update(connectivity: .online)
    old.reply()
    try await denied { try await waiting.value }
    try await denied { try await authority.read(slot: "session", generation: generation, stamp: storage) }
    print("PASS silent transport cancellation and late reply cannot cross native reconnect")

    let currentNetwork = try fence.stamp(for: .network)
    let currentStorage = try fence.stamp(for: .storage)
    let resetID = try await authority.begin(generation: generation, stamp: currentNetwork)
    let inFlight = Task { try await authority.send(id: resetID, lane: .member, input: memberRead, stamp: currentNetwork) }
    let retiring = try await transport.started(2)
    backend.checkNextRead {
        try check(retiring.didCancel, "Reset touched protected storage before stopping the transfer")
    }
    let reset = try await authority.resetAccountStorage(expectedGeneration: generation, stamp: currentStorage)
    retiring.reply()
    try await denied { try await inFlight.value }
    let freshStorage = try fence.stamp(for: .storage)
    let freshNetwork = try fence.stamp(for: .network)
    let empty = try await authority.read(slot: "session", generation: reset.generation, stamp: freshStorage)
    try check(reset.cleared && reset.previousGeneration == generation && reset.generation != generation && empty == nil,
              "Reset must return a verified empty successor")
    try await denied { try await authority.read(slot: "session", generation: generation, stamp: freshStorage) }
    print("PASS reset stops the old transfer before its first storage read and clears the old generation")

    let mismatchID = try await authority.begin(generation: reset.generation, stamp: freshNetwork)
    let mismatch = Task { try await authority.send(id: mismatchID, lane: .member, input: memberRead, stamp: freshNetwork) }
    let wrong = try await transport.started(3)
    wrong.reply(url: "https://other.invalid/api/auth/member")
    try await denied { try await mismatch.value }
    print("PASS authority independently refuses a mismatched response URL")

    try await exerciseRecovery(authority, transport: transport, generation: reset.generation, storage: freshStorage, network: freshNetwork)
    let passwordStamp = try fence.stamp(for: .network)
    let passwordID = try await authority.begin(generation: reset.generation, stamp: passwordStamp)
    let password = SoeMemberWireInput(url: provider + "/auth/v1/token?grant_type=password", method: "POST", bearer: nil,
                                      body: #"{"email":"member@example.invalid","password":"synthetic-password","gotrue_meta_security":{}}"#)
    let signIn = Task { try await authority.send(id: passwordID, lane: .auth, input: password, stamp: passwordStamp) }
    let passwordWire = try await transport.started(8)
    try check(passwordWire.request.value(forHTTPHeaderField: "apikey") == publishable &&
              passwordWire.request.value(forHTTPHeaderField: "Authorization") == "Bearer " + publishable &&
              passwordWire.request.value(forHTTPHeaderField: "Cookie") == nil, "Password lane crossed credential boundaries")
    passwordWire.reply(body: #"{"message":"Synthetic provider reply"}"#, status: 400)
    let signInResult = try await signIn.value
    try check(signInResult.status == 400, "Ordinary SDK must receive the exact bounded provider outcome")
    print("PASS ordinary password lane runs independently of the retired recovery claim")

    let cancelledID = try await authority.begin(generation: reset.generation, stamp: passwordStamp)
    let cancelled = Task { try await authority.send(id: cancelledID, lane: .member, input: memberRead, stamp: passwordStamp) }
    let cancelledWire = try await transport.started(9)
    cancelled.cancel()
    cancelledWire.reply()
    try await denied { try await cancelled.value }
    try check(cancelledWire.didCancel, "A caller-cancelled transfer must be stopped")
    print("PASS caller cancellation rejects a simultaneous reply before or after actor cleanup")
    await authority.close()
    fence.update(appActive: true, protectedDataAvailable: true, connectivity: .online)
    try await denied { try await authority.generation(stamp: freshStorage) }

    let expiryTransport = RecordingTransport()
    let expiring = try SoeMemberAuthority(configuration: config, backend: RecordBackend(), transport: expiryTransport,
                                          requestLifetime: .milliseconds(250))
    await authority.close()
    try checkExclusive(config)
    print("PASS namespace ownership transfers only after close and stale close cannot release its successor")
    expiring.fence.update(appActive: true, protectedDataAvailable: true, connectivity: .online)
    let expiryStore = try expiring.fence.stamp(for: .storage)
    let expiryNetwork = try expiring.fence.stamp(for: .network)
    let expiryGeneration = try await expiring.generation(stamp: expiryStore)
    let expiredID = try await expiring.begin(generation: expiryGeneration, stamp: expiryNetwork)
    try await Task.sleep(for: .milliseconds(300))
    try await denied { try await expiring.send(id: expiredID, lane: .member, input: memberRead, stamp: expiryNetwork) }
    try check(expiryTransport.count == 0, "A lease expired before dispatch created a task")
    let expiringID = try await expiring.begin(generation: expiryGeneration, stamp: expiryNetwork)
    let expiringSend = Task { try await expiring.send(id: expiringID, lane: .member, input: memberRead, stamp: expiryNetwork) }
    let held = try await expiryTransport.started(0)
    try await denied { try await expiringSend.value }
    try check(held.didCancel, "The native deadline did not stop an in-flight task")
    held.reply()
    await expiring.close()
    print("PASS monotonic deadline rejects pre-dispatch and in-flight expiry; close is permanent")
}

private func exerciseRecovery(_ authority: SoeMemberAuthority, transport: RecordingTransport, generation: String,
                              storage: SoeMemberAccessStamp, network: SoeMemberAccessStamp) async throws {
    let address = "member@example.invalid"
    let prepared = try await authority.prepareEmailLink(purpose: "recovery", email: address, generation: generation, stamp: storage)
    let redirect = prepared.redirectTo.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"))!
    let start = SoeMemberWireInput(url: provider + "/auth/v1/recover?redirect_to=" + redirect, method: "POST", bearer: nil,
                                   body: "{\"email\":\"\(address)\",\"code_challenge\":\"\(prepared.challenge)\",\"code_challenge_method\":\"s256\",\"gotrue_meta_security\":{}}")
    let deliveryID = try await authority.begin(generation: generation, stamp: network)
    let delivery = Task { try await authority.sendEmailAuth(id: deliveryID, flowID: prepared.flowId, input: start, stamp: network) }
    let deliveryWire = try await transport.started(4)
    try check(deliveryWire.request.value(forHTTPHeaderField: "apikey") == publishable, "Email lane used the wrong provider key")
    deliveryWire.reply()
    _ = try await delivery.value
    let callback = try authority.fence.stamp(for: .callback)
    authority.fence.update(appActive: false, connectivity: .offline)
    try await authority.captureEmailLink(prepared.redirectTo + "&code=synthetic-code", stamp: callback)
    authority.fence.update(appActive: true, connectivity: .online)
    let resumed = try authority.fence.stamp(for: .network)
    let resumedStorage = try authority.fence.stamp(for: .storage)
    let claim = try await authority.claimEmailLink(flowID: prepared.flowId, generation: generation, stamp: resumed)
    let erased = try await authority.pendingEmailLink(generation: generation, stamp: resumedStorage)
    try check(erased == nil && claim.code == "synthetic-code", "Recovery code was exposed before erasing its durable binding")

    let exchange = SoeMemberWireInput(url: provider + "/auth/v1/token?grant_type=pkce", method: "POST", bearer: nil,
                                      body: "{\"auth_code\":\"\(claim.code)\",\"code_verifier\":\"\(claim.verifier)\"}")
    let ordinary = try await authority.begin(generation: generation, stamp: resumed)
    try await denied { try await authority.send(id: ordinary, lane: .auth, input: exchange, stamp: resumed) }
    let exchangeID = try await authority.begin(generation: generation, stamp: resumed)
    let result = Task { try await authority.sendEmailAuth(id: exchangeID, flowID: claim.flowId, input: exchange, stamp: resumed) }
    let exchangeWire = try await transport.started(5)
    let subject = "22222222-2222-4222-8222-222222222222"
    let time = fixedTime / 1000
    let expires = time + 3600
    let payload = Data("{\"sub\":\"\(subject)\",\"exp\":\(expires),\"amr\":[{\"method\":\"recovery\",\"timestamp\":\(time)}]}".utf8)
    let part = payload.base64EncodedString().replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    let bearer = "e30.\(part).c2ln"
    exchangeWire.reply(body: "{\"access_token\":\"\(bearer)\",\"refresh_token\":\"synthetic-refresh\",\"token_type\":\"bearer\",\"expires_at\":\(expires),\"user\":{\"id\":\"\(subject)\"}}")
    _ = try await result.value

    let user = SoeMemberWireInput(url: provider + "/auth/v1/user", method: "GET", bearer: bearer, body: nil)
    let userID = try await authority.begin(generation: generation, stamp: resumed)
    let verification = Task { try await authority.sendEmailAuth(id: userID, flowID: claim.flowId, input: user, stamp: resumed) }
    let userWire = try await transport.started(6)
    userWire.reply(body: "{\"id\":\"\(subject)\"}")
    _ = try await verification.value

    let update = SoeMemberWireInput(url: provider + "/auth/v1/user", method: "PUT", bearer: bearer,
                                    body: "{\"password\":\"synthetic-password\",\"code_challenge\":null,\"code_challenge_method\":null}")
    let updateID = try await authority.begin(generation: generation, stamp: resumed)
    let saving = Task { try await authority.sendEmailAuth(id: updateID, flowID: claim.flowId, input: update, stamp: resumed) }
    let updateWire = try await transport.started(7)
    authority.fence.update(appActive: false)
    try check(updateWire.didCancel, "Backgrounding must retire an in-flight email change")
    authority.fence.update(appActive: true)
    updateWire.reply(body: "{\"id\":\"\(subject)\"}")
    try await denied { try await saving.value }
    let newStorage = try authority.fence.stamp(for: .storage)
    let ordinarySession = try await authority.read(slot: "session", generation: generation, stamp: newStorage)
    try check(ordinarySession == nil, "Isolated recovery must never publish an ordinary session")
    print("PASS composed recovery binds one cold callback, fences PKCE to its lane, and drops a late update without ordinary storage")
}
