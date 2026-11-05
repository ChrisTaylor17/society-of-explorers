import Foundation

private struct FenceTestFailure: Error {
    let message: String
}

private func check(_ result: @autoclosure () -> Bool, _ message: String) throws {
    if !result() { throw FenceTestFailure(message: message) }
}

private func unavailable<T>(_ work: () throws -> T) throws {
    do { _ = try work() }
    catch SoeMemberCoreError.unavailable { return }
    throw FenceTestFailure(message: "Expected an unavailable result")
}

private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var total = 0
    var value: Int { lock.withLock { total } }
    func add() { lock.withLock { total += 1 } }
}

func runSoeMemberFenceTests() throws {
    let fence = SoeMemberAccessFence()
    try unavailable { try fence.stamp(for: .storage) }
    try unavailable { try fence.stamp(for: .network) }
    try unavailable { try fence.stamp(for: .callback) }
    try check(fence.connectivitySnapshot() == .unknown, "Cold connectivity must be unknown")
    print("PASS native fence is closed before protected data, foreground, and network signals")

    fence.update(protectedDataAvailable: true)
    let callback = try fence.stamp(for: .callback)
    try unavailable { try fence.stamp(for: .storage) }
    fence.update(appActive: true, connectivity: .offline)
    let offlineStorage = try fence.stamp(for: .storage)
    try check(fence.isCurrent(callback) && fence.isCurrent(offlineStorage), "Cold callback and offline storage must remain separate")
    try unavailable { try fence.stamp(for: .network) }
    try unavailable { try fence.withCurrent(callback, purpose: .storage) { true } }
    print("PASS launch callback can bind before foreground, while network still requires online access")

    let retired = Counter()
    let admitted = Counter()
    fence.update(connectivity: .online)
    let network = try fence.stamp(for: .network)
    try check(!fence.isCurrent(offlineStorage), "Prior offline invocation must not survive reconnection")
    let id = UUID()
    try fence.admit(network, id: id, retire: { retired.add() }) { admitted.add() }
    try unavailable { try fence.admit(network, id: id, retire: { retired.add() }) { admitted.add() } }
    fence.update(connectivity: .unknown)
    try check(retired.value == 1 && admitted.value == 1, "Network loss must synchronously cancel once")
    fence.update(connectivity: .online)
    try unavailable { try fence.admit(network, id: UUID(), retire: { retired.add() }) { admitted.add() } }
    try check(admitted.value == 1 && fence.isCurrent(callback), "Reconnection cannot dispatch stale work")
    print("PASS admission rejects replay and reconnection cannot restore an old native invocation")

    let nextNetwork = try fence.stamp(for: .network)
    let storage = try fence.stamp(for: .storage)
    try fence.admit(nextNetwork, id: UUID(), retire: { retired.add() }) { admitted.add() }
    let reset = try fence.retireForReset(storage)
    try check(retired.value == 2 && !fence.isCurrent(nextNetwork), "Reset must cancel active network work")
    try check(!fence.isCurrent(callback) && fence.isCurrent(reset), "Reset must rotate callback and interactive ownership")
    fence.update(protectedDataAvailable: false)
    try unavailable { try fence.withCurrent(reset, purpose: .storage) { true } }
    try unavailable { try fence.stamp(for: .callback) }
    fence.close()
    fence.update(appActive: true, protectedDataAvailable: true, connectivity: .online)
    try unavailable { try fence.stamp(for: .network) }
    print("PASS reset, device lock, and close retire the relevant native scopes")

    let exact = "https://soe.invalid/api/auth/member"
    let url = URL(string: exact)!
    let ok = HTTPURLResponse(url: url, statusCode: 403, httpVersion: nil, headerFields: ["Content-Length": "2"])!
    var body = SoeMemberHTTPBody(exactURL: exact)
    try unavailable { try body.append(Data([123])) }
    try body.accept(ok)
    try body.append(Data("{}".utf8))
    let response = try body.response()
    try response.check(expectedURL: exact)
    try check(response.status == 403 && response.body == "{}", "Bounded HTTP error must reach the client as a response")
    try unavailable { try body.accept(ok) }
    try unavailable { try response.check(expectedURL: "https://other.invalid/api/auth/member") }
    print("PASS response accumulator binds the exact URL and retains bounded HTTP error outcomes")

    let redirect = HTTPURLResponse(url: url, statusCode: 302, httpVersion: nil, headerFields: nil)!
    var refused = SoeMemberHTTPBody(exactURL: exact)
    try unavailable { try refused.accept(redirect) }
    let other = HTTPURLResponse(url: URL(string: "https://other.invalid/api/auth/member")!, statusCode: 200,
                                httpVersion: nil, headerFields: nil)!
    try unavailable { try refused.accept(other) }
    let huge = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil,
                               headerFields: ["Content-Length": String(SoeMemberWireResponse.maximumBytes + 1)])!
    try unavailable { try refused.accept(huge) }
    try refused.accept(ok)
    try refused.append(Data(repeating: 65, count: SoeMemberWireResponse.maximumBytes))
    try unavailable { try refused.append(Data([65])) }
    var malformed = SoeMemberHTTPBody(exactURL: exact)
    try malformed.accept(ok)
    try malformed.append(Data([0xC3, 0x28]))
    try unavailable { try malformed.response() }
    print("PASS redirects, wrong origin, oversize, and malformed UTF-8 responses are refused")

    let transfer = SoeMemberEphemeralTransport()
    let callbacks = Counter()
    let failures = Counter()
    var cookie = URLRequest(url: url)
    cookie.setValue("synthetic=true", forHTTPHeaderField: "Cookie")
    try unavailable { try transfer.makeTask(request: cookie, timeout: 1) { _ in callbacks.add() } }
    let task = try transfer.makeTask(request: URLRequest(url: url), timeout: 1) { result in
        callbacks.add()
        if case .failure(.unavailable) = result { failures.add() }
    }
    task.cancel()
    task.cancel()
    try check(callbacks.value == 1 && failures.value == 1, "Owned Foundation task must settle exactly once on cancellation")
    print("PASS actual ephemeral Foundation task cancels once and rejects cookie input before creation")
}
