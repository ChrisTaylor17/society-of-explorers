import Foundation

private struct BridgeFailure: Error { let message: String }
private func bridgeCheck(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    if !condition() { throw BridgeFailure(message: message) }
}

private struct BridgeReply: Sendable {
    let success: Bool
    let absent: Bool
    let null: Bool
    let data: Data?
    init(_ value: Any?, _ success: Bool) {
        self.success = success
        self.absent = value == nil
        self.null = value is NSNull
        self.data = value.flatMap { try? JSONSerialization.data(withJSONObject: $0, options: [.fragmentsAllowed, .sortedKeys]) }
    }
    var object: [String: Any] { data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:] }
    var text: String? { data.flatMap { try? JSONSerialization.jsonObject(with: $0, options: [.fragmentsAllowed]) as? String } }
}

private final class BridgeReplies: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [BridgeReply] = []
    var completion: SoeMemberBridgeCompletion { { [self] value, success in lock.withLock { values.append(BridgeReply(value, success)) } } }
    var count: Int { lock.withLock { values.count } }
    func wait(_ index: Int = 0) async throws -> BridgeReply {
        for _ in 0..<500 {
            if let reply = lock.withLock({ index < values.count ? values[index] : nil }) { return reply }
            try await Task.sleep(for: .milliseconds(5))
        }
        throw BridgeFailure(message: "Bridge callback did not settle")
    }
}

private func bridgeCall(_ invoke: (@escaping SoeMemberBridgeCompletion) -> Void) async throws -> BridgeReply {
    let replies = BridgeReplies()
    invoke(replies.completion)
    return try await replies.wait()
}

private final class BridgeBackend: SoeMemberVaultRecordBackend, @unchecked Sendable {
    private let lock = NSLock()
    private var record: Data?
    private var readsValue = 0
    private var writesValue = 0
    var reads: Int { lock.withLock { readsValue } }
    var writes: Int { lock.withLock { writesValue } }
    var generation: String? {
        lock.withLock { record.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }?["generation"] as? String }
    }
    func readRecord(namespace: String) throws -> Data? { lock.withLock { readsValue += 1; return record } }
    func replaceRecord(namespace: String, data: Data) throws { lock.withLock { writesValue += 1; record = data } }
}

private final class BridgeTransfer: SoeMemberHTTPTask, @unchecked Sendable {
    let request: URLRequest
    private let lock = NSLock()
    private var resumed = false
    private var cancelled = false
    private let completion: @Sendable (Result<SoeMemberWireResponse, SoeMemberCoreError>) -> Void
    init(_ request: URLRequest, _ completion: @escaping @Sendable (Result<SoeMemberWireResponse, SoeMemberCoreError>) -> Void) {
        self.request = request; self.completion = completion
    }
    var started: Bool { lock.withLock { resumed } }
    var stopped: Bool { lock.withLock { cancelled } }
    func resume() { lock.withLock { if !cancelled { resumed = true } } }
    func cancel() { lock.withLock { cancelled = true } }
    func reply(_ body: String = "{}", status: Int = 200) {
        completion(.success(.init(status: status, url: request.url!.absoluteString, body: body, redirected: false)))
    }
}

private final class BridgeTransport: SoeMemberHTTPTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var tasks: [BridgeTransfer] = []
    private var creationGate: DispatchSemaphore?
    var count: Int { lock.withLock { tasks.count } }
    func holdNextCreation() -> DispatchSemaphore {
        let gate = DispatchSemaphore(value: 0)
        lock.withLock { creationGate = gate }
        return gate
    }
    func makeTask(request: URLRequest, timeout: TimeInterval,
                  completion: @escaping @Sendable (Result<SoeMemberWireResponse, SoeMemberCoreError>) -> Void) throws -> any SoeMemberHTTPTask {
        let task = BridgeTransfer(request, completion)
        let gate = lock.withLock { () -> DispatchSemaphore? in
            tasks.append(task)
            let gate = creationGate; creationGate = nil; return gate
        }
        if let gate, gate.wait(timeout: .now() + 3) != .success { throw BridgeFailure(message: "Synthetic actor hold timed out") }
        return task
    }
    func wait(_ index: Int, resumed: Bool = true) async throws -> BridgeTransfer {
        for _ in 0..<500 {
            if let task = lock.withLock({ index < tasks.count ? tasks[index] : nil }), !resumed || task.started { return task }
            try await Task.sleep(for: .milliseconds(5))
        }
        throw BridgeFailure(message: "Bridge transport did not start")
    }
}

private struct BridgeFixture {
    let configuration: SoeMemberConfiguration
    let backend = BridgeBackend()
    let transport = BridgeTransport()
    let authority: SoeMemberAuthority
    let queue = DispatchQueue(label: "soe.bridge.synthetic.delivery")
    let bridge: SoeMemberBridge
    init(_ name: String, lifetime: Duration = .seconds(15)) throws {
        configuration = try SoeMemberConfiguration(applicationID: "org.soe.bridge-" + name,
            memberOrigin: "https://soe.invalid", storageKey: "soe-session", providerOrigin: "https://auth.invalid",
            publishableKey: "sb_publishable_syntheticBridgeTestKey00")
        authority = try SoeMemberAuthority(configuration: configuration, backend: backend, transport: transport, requestLifetime: lifetime)
        bridge = SoeMemberBridge(configuration: configuration, authority: authority, deliveryQueue: queue)
    }
    func active(_ state: SoeMemberConnectivity = .online) {
        bridge.update(appActive: true, protectedDataAvailable: true, connectivity: state)
    }
    func generation() async throws -> String {
        let result = try await bridgeCall { bridge.capabilities(completion: $0) }
        guard result.success, let generation = result.object["storageGeneration"] as? String else { throw BridgeFailure(message: "No generation") }
        return generation
    }
    func begin(_ generation: String) async throws -> String {
        let result = try await bridgeCall { bridge.begin(generation: generation, completion: $0) }
        guard result.success, let id = result.text else { throw BridgeFailure(message: "No lease") }
        return id
    }
    func close() async { bridge.invalidate(); await authority.close() }
}

private func waitFor(_ predicate: () -> Bool) async throws {
    for _ in 0..<500 {
        if predicate() { return }
        try await Task.sleep(for: .milliseconds(5))
    }
    throw BridgeFailure(message: "Synthetic observation timed out")
}

func runSoeMemberBridgeTests() async throws {
    let f = try BridgeFixture("contract")
    let selectors = ["capabilitiesWithCompletion:", "beginWithGeneration:completion:", "newRequestIdWithGeneration:completion:",
        "sendWithId:url:method:bearer:body:completion:", "sendReviewWithId:url:method:bearer:body:completion:",
        "sendCircleReviewWithId:url:method:bearer:body:completion:", "sendAuthWithId:url:method:bearer:body:completion:",
        "sendPublicWithId:url:method:completion:", "sendEmailAuthWithId:flowId:url:method:bearer:body:completion:",
        "prepareEmailLinkWithGeneration:purpose:email:completion:", "pendingEmailLinkWithGeneration:completion:",
        "claimEmailLinkWithGeneration:flowId:completion:", "discardEmailLinkWithGeneration:flowId:completion:",
        "cancelWithId:completion:", "readWithSlot:generation:completion:", "writeWithSlot:value:generation:completion:",
        "removeWithSlot:generation:completion:", "resetAccountStorageWithExpectedGeneration:completion:", "getConnectivitySnapshot", "invalidate"]
    for name in selectors { try bridgeCheck(f.bridge.responds(to: NSSelectorFromString(name)), "Missing Objective-C selector: " + name) }
    try bridgeCheck(!f.bridge.responds(to: NSSelectorFromString("captureEmailLink:")), "Raw native callback must not be a JS-facing selector")
    let unavailable = try await bridgeCall { f.bridge.capabilities(completion: $0) }
    try bridgeCheck(!unavailable.success && unavailable.absent && f.backend.reads == 0 && f.backend.writes == 0,
                    "Unavailable attachment touched storage or exposed an error object")
    print("PASS bridge exports all 20 typed selectors, keeps callback native-only, and initializes without storage")

    f.active(.offline)
    let generation = try await f.generation()
    let capability = try await bridgeCall { f.bridge.capabilities(completion: $0) }
    try bridgeCheck(capability.object["version"] as? Int == 2 && capability.object["origin"] as? String == "https://soe.invalid" &&
                    capability.object["circleReviewPolicy"] as? String == "assigned-circle-review-v1" &&
                    capability.object["emailCallbackUrl"] as? String == f.configuration.emailCallbackURL, "Wrong capability projection")
    let offline = try await bridgeCall { f.bridge.begin(generation: generation, completion: $0) }
    try bridgeCheck(!offline.success && f.transport.count == 0 && f.bridge.getConnectivitySnapshot() == "offline", "Offline network gate opened")
    let empty = try await bridgeCall { f.bridge.read(slot: "session", generation: generation, completion: $0) }
    let written = try await bridgeCall { f.bridge.write(slot: "session", value: "synthetic-private-session", generation: generation, completion: $0) }
    let read = try await bridgeCall { f.bridge.read(slot: "session", generation: generation, completion: $0) }
    let removed = try await bridgeCall { f.bridge.remove(slot: "session", generation: generation, completion: $0) }
    let id = try await bridgeCall { f.bridge.newRequestId(generation: generation, completion: $0) }
    try bridgeCheck(empty.success && empty.null && written.success && written.null && read.text == "synthetic-private-session" &&
                    removed.success && removed.null && SoeMemberVault.isGeneration(id.text ?? ""), "Slot or null result mapping changed")
    print("PASS offline foreground capabilities and storage preserve null/string results while network stays closed")

    f.active()
    let endpoints = ["/api/auth/member", "/api/admin/circles/messages", "/api/admin/circles/reports", "/auth/v1/user", "/api/circles"]
    for (index, endpoint) in endpoints.enumerated() {
        let lease = try await f.begin(generation), replies = BridgeReplies()
        let url = (index == 3 ? "https://auth.invalid" : "https://soe.invalid") + endpoint
        switch index {
        case 0: f.bridge.send(id: lease, url: url, method: "GET", bearer: "synthetic.bearer", body: nil, completion: replies.completion)
        case 1: f.bridge.sendReview(id: lease, url: url, method: "GET", bearer: "synthetic.bearer", body: nil, completion: replies.completion)
        case 2: f.bridge.sendCircleReview(id: lease, url: url, method: "GET", bearer: "synthetic.bearer", body: nil, completion: replies.completion)
        case 3: f.bridge.sendAuth(id: lease, url: url, method: "GET", bearer: "synthetic.bearer", body: nil, completion: replies.completion)
        default: f.bridge.sendPublic(id: lease, url: url, method: "GET", completion: replies.completion)
        }
        let wire = try await f.transport.wait(index)
        wire.reply("{\"synthetic\":true}")
        let result = try await replies.wait()
        try bridgeCheck(result.success && result.object["status"] as? Int == 200 && result.object["url"] as? String == url &&
                        result.object["body"] as? String == "{\"synthetic\":true}" && result.object["redirected"] as? Bool == false,
                        "Lane result projection changed")
        try bridgeCheck(wire.request.value(forHTTPHeaderField: "Cookie") == nil &&
                        (index != 4 || wire.request.value(forHTTPHeaderField: "Authorization") == nil), "Credential lane crossed")
    }
    let wrongLease = try await f.begin(generation)
    let wrong = try await bridgeCall { f.bridge.send(id: wrongLease, url: "https://soe.invalid/api/admin/circles/reports",
        method: "GET", bearer: "synthetic.bearer", body: nil, completion: $0) }
    try bridgeCheck(!wrong.success && wrong.absent && f.transport.count == 5, "Member selector borrowed review authority")
    print("PASS all five request selectors preserve typed lanes, exact response fields and credential separation")

    let cancelLease = try await f.begin(generation), pending = BridgeReplies()
    f.bridge.send(id: cancelLease, url: "https://soe.invalid/api/auth/member", method: "GET", bearer: "synthetic.bearer", body: nil, completion: pending.completion)
    let cancelledWire = try await f.transport.wait(5)
    let cancellation = try await bridgeCall { f.bridge.cancel(id: cancelLease, completion: $0) }
    cancelledWire.reply()
    let cancelledReply = try await pending.wait()
    try bridgeCheck(cancellation.success && cancellation.null && cancelledWire.stopped && !cancelledReply.success, "Cancellation leaked late output")
    await f.close()
    print("PASS explicit cancel settles once and rejects a late transport reply")

    try await bridgeDelayedStorage()
    try await bridgeQueuedAdmission()
    try await bridgeResetSuccessor()
    try await bridgeAttachmentAndEvents()
    try await bridgeDelayedSend()
    try await bridgeEmailScope()
}

private func bridgeDelayedStorage() async throws {
    let f = try BridgeFixture("settlement"); f.active()
    let generation = try await f.generation()
    _ = try await bridgeCall { f.bridge.write(slot: "session", value: "synthetic-held-secret", generation: generation, completion: $0) }
    let reads = f.backend.reads, reply = BridgeReplies()
    f.queue.suspend()
    f.bridge.read(slot: "session", generation: generation, completion: reply.completion)
    try await waitFor { f.backend.reads > reads }
    f.bridge.update(appActive: false, protectedDataAvailable: true, connectivity: .online)
    f.active()
    f.queue.resume()
    let result = try await reply.wait()
    try bridgeCheck(!result.success && result.absent && reply.count == 1, "Old delivery adopted a new foreground stamp")
    await f.close()
    print("PASS a delayed protected read cannot deliver after background and foreground resume")
}

private func bridgeQueuedAdmission() async throws {
    let f = try BridgeFixture("queue"); f.active()
    let generation = try await f.generation(), lease = try await f.begin(generation)
    let gate = f.transport.holdNextCreation(), sending = BridgeReplies(), writing = BridgeReplies()
    f.bridge.send(id: lease, url: "https://soe.invalid/api/auth/member", method: "GET", bearer: "synthetic.bearer", body: nil, completion: sending.completion)
    let wire = try await f.transport.wait(0, resumed: false)
    let writes = f.backend.writes
    f.bridge.write(slot: "session", value: "must-not-be-written", generation: generation, completion: writing.completion)
    f.bridge.update(appActive: false, protectedDataAvailable: true, connectivity: .online)
    f.active(); gate.signal()
    let sent = try await sending.wait(), wrote = try await writing.wait()
    try bridgeCheck(!sent.success && !wrote.success && !wire.started && f.backend.writes == writes,
                    "Queued old work captured a replacement native stamp")
    await f.close()
    print("PASS stamps captured before actor queueing prevent old write and physical send after resume")
}

private func bridgeResetSuccessor() async throws {
    let f = try BridgeFixture("reset"); f.active()
    let generation = try await f.generation(), first = BridgeReplies(), second = BridgeReplies()
    f.queue.suspend()
    f.bridge.resetAccountStorage(expectedGeneration: generation, completion: first.completion)
    try await waitFor { f.backend.generation != generation }
    guard let successor = f.backend.generation else { throw BridgeFailure(message: "No reset successor") }
    f.bridge.resetAccountStorage(expectedGeneration: successor, completion: second.completion)
    try await waitFor { f.backend.generation != successor }
    f.queue.resume()
    let old = try await first.wait(), current = try await second.wait()
    try bridgeCheck(!old.success && old.absent && current.success && current.object["previousGeneration"] as? String == successor &&
                    current.object["generation"] as? String == f.backend.generation && current.object["cleared"] as? Bool == true,
                    "An older reset adopted the latest successor stamp")
    await f.close()
    print("PASS delayed reset delivery binds the exact successor and refuses a later reset's authority")
}

private func bridgeAttachmentAndEvents() async throws {
    let f = try BridgeFixture("attachment"), events = BridgeReplies()
    let observer = NotificationCenter.default.addObserver(forName: .soeMemberBridgeConnectivityDidChange, object: f.bridge, queue: nil) {
        events.completion($0.userInfo?["state"], true)
    }
    defer { NotificationCenter.default.removeObserver(observer) }
    f.active()
    let online = try await events.wait()
    try bridgeCheck(online.text == "online", "Connectivity event lacked current effective state")
    f.bridge.update(appActive: false, protectedDataAvailable: true, connectivity: .online)
    let inactive = try await events.wait(1)
    try bridgeCheck(inactive.text == "unknown" && f.bridge.getConnectivitySnapshot() == "unknown", "Inactive app advertised online")
    f.active()
    _ = try await events.wait(2)
    let generation = try await f.generation(), pending = BridgeReplies()
    let lease = try await f.begin(generation)
    f.bridge.send(id: lease, url: "https://soe.invalid/api/auth/member", method: "GET", bearer: "synthetic.bearer", body: nil, completion: pending.completion)
    let wire = try await f.transport.wait(0)
    f.bridge.invalidate()
    try bridgeCheck(f.bridge.isInvalidated && wire.stopped && f.bridge.getConnectivitySnapshot() == "unknown", "Invalidation was not synchronous")
    wire.reply()
    let retiredReply = try await pending.wait()
    try bridgeCheck(!retiredReply.success, "Invalidated attachment delivered a late reply")
    let replacement = SoeMemberBridge(configuration: f.configuration, authority: f.authority, deliveryQueue: f.queue)
    let next = try await bridgeCall { replacement.capabilities(completion: $0) }
    f.bridge.invalidate()
    let stillLive = try await bridgeCall { replacement.read(slot: "session", generation: generation, completion: $0) }
    try bridgeCheck(next.success && stillLive.success && stillLive.null, "Old invalidation closed the app-owned replacement")
    let newLeaseReply = try await bridgeCall { replacement.begin(generation: generation, completion: $0) }
    guard let newLease = newLeaseReply.text else { throw BridgeFailure(message: "No replacement lease") }
    let newReply = BridgeReplies()
    replacement.send(id: newLease, url: "https://soe.invalid/api/auth/member", method: "GET", bearer: "synthetic.bearer", body: nil, completion: newReply.completion)
    let newWire = try await f.transport.wait(1)
    let staleCancel = try await bridgeCall { f.bridge.cancel(id: newLease, completion: $0) }
    try bridgeCheck(!staleCancel.success && staleCancel.absent && !newWire.stopped, "Retained bridge cancelled replacement lease")
    newWire.reply()
    let newResult = try await newReply.wait()
    try bridgeCheck(newResult.success, "New attachment reply failed after retained old cancel")
    let reentrant = BridgeReplies()
    replacement.capabilities { value, success in replacement.invalidate(); reentrant.completion(value, success) }
    let reentrantReply = try await reentrant.wait()
    try bridgeCheck(reentrantReply.success && replacement.isInvalidated, "Promise callback cannot reenter invalidate")
    await f.authority.close()
    print("PASS connectivity is effective, invalidation stops synchronously, and replacement plus reentrant callback stays safe")
}

private func bridgeDelayedSend() async throws {
    let f = try BridgeFixture("deadline", lifetime: .milliseconds(250)); f.active()
    let generation = try await f.generation(), lease = try await f.begin(generation), reply = BridgeReplies()
    f.bridge.send(id: lease, url: "https://soe.invalid/api/auth/member", method: "GET", bearer: "synthetic.bearer", body: nil, completion: reply.completion)
    let wire = try await f.transport.wait(0), reads = f.backend.reads
    f.queue.suspend(); wire.reply("{\"syntheticSecret\":true}")
    try await waitFor { f.backend.reads > reads }
    try await Task.sleep(for: .milliseconds(300))
    f.queue.resume()
    let expired = try await reply.wait()
    try bridgeCheck(!expired.success && expired.absent, "Held response extended its original request deadline")
    await f.close()

    let c = try BridgeFixture("held-cancel"); c.active()
    let current = try await c.generation(), handle = try await c.begin(current), result = BridgeReplies(), cancelled = BridgeReplies()
    c.bridge.send(id: handle, url: "https://soe.invalid/api/auth/member", method: "GET", bearer: "synthetic.bearer", body: nil, completion: result.completion)
    let completed = try await c.transport.wait(0), before = c.backend.reads
    c.queue.suspend(); completed.reply()
    try await waitFor { c.backend.reads > before }
    c.bridge.cancel(id: handle, completion: cancelled.completion)
    c.queue.resume()
    let withheld = try await result.wait(), cancellation = try await cancelled.wait()
    try bridgeCheck(!withheld.success && withheld.absent && cancellation.success && cancellation.null,
                    "Explicit cancellation allowed an already queued successful response")
    await c.close()
    print("PASS held send output obeys its original monotonic deadline and synchronous delivery cancellation")
}

private func bridgeEmailScope() async throws {
    let f = try BridgeFixture("email"); f.active()
    let generation = try await f.generation()
    let missing = try await bridgeCall { f.bridge.pendingEmailLink(generation: generation, completion: $0) }
    try bridgeCheck(missing.success && missing.null, "Missing email binding must resolve null")
    let prepared = try await bridgeCall { f.bridge.prepareEmailLink(generation: generation, purpose: "recovery", email: "member@example.invalid", completion: $0) }
    guard let flow = prepared.object["flowId"] as? String, let redirect = prepared.object["redirectTo"] as? String,
          let challenge = prepared.object["challenge"] as? String else { throw BridgeFailure(message: "Missing email preparation") }
    let lease = try await f.begin(generation), sent = BridgeReplies()
    let encoded = redirect.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"))!
    f.bridge.sendEmailAuth(id: lease, flowId: flow, url: "https://auth.invalid/auth/v1/recover?redirect_to=" + encoded,
        method: "POST", bearer: nil, body: "{\"email\":\"member@example.invalid\",\"code_challenge\":\"\(challenge)\",\"code_challenge_method\":\"s256\",\"gotrue_meta_security\":{}}", completion: sent.completion)
    let wire = try await f.transport.wait(0); wire.reply()
    let sentReply = try await sent.wait()
    try bridgeCheck(sentReply.success, "Email selector failed its exact native lane")
    f.bridge.update(appActive: false, protectedDataAvailable: true, connectivity: .offline)
    let writes = f.backend.writes
    f.bridge.captureEmailLink(redirect + "&code=synthetic_callback_code")
    try await waitFor { f.backend.writes > writes }
    f.active()
    let captured = try await bridgeCall { f.bridge.pendingEmailLink(generation: generation, completion: $0) }
    try bridgeCheck(captured.object["phase"] as? String == "callback_ready", "Protected background callback was not captured")
    let claim = BridgeReplies(), replacement = BridgeReplies(), claimWrites = f.backend.writes
    f.queue.suspend()
    f.bridge.claimEmailLink(generation: generation, flowId: flow, completion: claim.completion)
    try await waitFor { f.backend.writes > claimWrites }
    f.bridge.prepareEmailLink(generation: generation, purpose: "recovery", email: "next@example.invalid", completion: replacement.completion)
    try await waitFor { f.backend.writes > claimWrites + 1 }
    f.queue.resume()
    let oldClaim = try await claim.wait(), newFlow = try await replacement.wait()
    try bridgeCheck(!oldClaim.success && oldClaim.absent && newFlow.success && newFlow.object["email"] as? String == "next@example.invalid",
                    "Retired claim delivered code/verifier from the held event queue")
    let nextID = newFlow.object["flowId"] as! String
    let discarded = try await bridgeCall { f.bridge.discardEmailLink(generation: generation, flowId: nextID, completion: $0) }
    let after = try await bridgeCall { f.bridge.pendingEmailLink(generation: generation, completion: $0) }
    try bridgeCheck(discarded.success && discarded.null && after.success && after.null, "Email discard projection changed")
    await f.close()
    print("PASS email preparation, native cold callback and discard work; queued replaced claim never releases code or verifier")
}
