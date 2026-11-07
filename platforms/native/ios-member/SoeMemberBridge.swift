import Foundation

public typealias SoeMemberBridgeCompletion = @Sendable (Any?, Bool) -> Void

extension Notification.Name {
    static let soeMemberBridgeConnectivityDidChange = Notification.Name("SoeMemberBridgeConnectivityDidChange")
}

/// A single React attachment to the app-owned authority. Configuration and the
/// authority are supplied by the native host, never by JavaScript. Values are
/// projected into Foundation objects only on the delivery queue.
@objc(SoeMemberBridge)
public final class SoeMemberBridge: NSObject, @unchecked Sendable {
    private indirect enum Value: Sendable {
        case null, text(String), boolean(Bool), number(Int64), object([String: Value])

        var foundation: Any {
            switch self {
            case .null: return NSNull()
            case let .text(value): return value
            case let .boolean(value): return value
            case let .number(value): return value
            case let .object(value): return value.mapValues(\.foundation)
            }
        }
    }

    private struct Delivery: Sendable { let id: String; let token: UUID }

    private let lock = NSLock()
    private let configuration: SoeMemberConfiguration
    private let authority: SoeMemberAuthority
    private let deliveryQueue: DispatchQueue
    private let ownsAuthority: Bool
    private var invalidated = false
    private var eventRevision: UInt64 = 0
    private var emailRevision: UInt64 = 0
    private var deliveries: [String: UUID] = [:]

    var isInvalidated: Bool { lock.withLock { invalidated } }

    init(configuration: SoeMemberConfiguration, authority: SoeMemberAuthority,
         deliveryQueue: DispatchQueue = .main) {
        self.configuration = configuration
        self.authority = authority
        self.deliveryQueue = deliveryQueue
        self.ownsAuthority = false
        super.init()
    }

    init(configuration: SoeMemberConfiguration,
         backend: any SoeMemberVaultRecordBackend = SoeMemberKeychainRecordBackend(),
         transport: any SoeMemberHTTPTransport = SoeMemberEphemeralTransport(),
         deliveryQueue: DispatchQueue = .main) throws {
        self.configuration = configuration
        self.authority = try SoeMemberAuthority(configuration: configuration, backend: backend, transport: transport)
        self.deliveryQueue = deliveryQueue
        self.ownsAuthority = true
        super.init()
    }

    deinit {
        if !invalidated {
            authority.fence.retireInteractive()
            if ownsAuthority {
                let authority = authority
                Task { await authority.close() }
            }
        }
    }

    /// The production host updates the app-owned fence even while no React
    /// attachment exists. This convenience also supports isolated native tests.
    func update(appActive: Bool, protectedDataAvailable: Bool, connectivity: SoeMemberConnectivity) {
        let changed = lock.withLock {
            guard !invalidated else { return false }
            let before = authority.fence.interactiveConnectivitySnapshot()
            authority.fence.update(appActive: appActive, protectedDataAvailable: protectedDataAvailable,
                                   connectivity: connectivity)
            return before != authority.fence.interactiveConnectivitySnapshot()
        }
        if changed { hostConnectivityDidChange() }
    }

    /// Notification is a wake-up, not a retained historical connectivity value.
    /// It runs on the delivery queue without any bridge or fence lock held.
    func hostConnectivityDidChange() {
        let revision: UInt64? = lock.withLock {
            guard !invalidated else { return nil }
            eventRevision &+= 1
            return eventRevision
        }
        guard let revision else { return }
        deliveryQueue.async { [weak self] in
            guard let self else { return }
            let state: String? = self.lock.withLock {
                guard !self.invalidated, self.eventRevision == revision else { return nil }
                return self.authority.fence.interactiveConnectivitySnapshot().rawValue
            }
            guard let state else { return }
            NotificationCenter.default.post(name: .soeMemberBridgeConnectivityDidChange, object: self,
                                             userInfo: ["state": state])
        }
    }

    @objc(getConnectivitySnapshot)
    public func getConnectivitySnapshot() -> String {
        lock.withLock {
            invalidated ? "unknown" : authority.fence.interactiveConnectivitySnapshot().rawValue
        }
    }

    @objc(invalidate)
    public func invalidate() {
        let retired = lock.withLock {
            guard !invalidated else { return false }
            invalidated = true
            eventRevision &+= 1
            emailRevision &+= 1
            deliveries.removeAll()
            authority.fence.retireInteractive()
            return true
        }
        if retired && ownsAuthority {
            let authority = authority
            Task { await authority.close() }
        }
    }

    /// Native-only URL delivery captures its protected callback epoch before
    /// actor queueing. The host intercepts the URL before any React URL fanout.
    func captureEmailLink(_ raw: String) {
        guard let stamp = capture(.callback) else { return }
        let authority = authority
        Task { try? await authority.captureEmailLink(raw, stamp: stamp) }
    }

    @objc(capabilitiesWithCompletion:)
    public func capabilities(completion: @escaping SoeMemberBridgeCompletion) {
        let configuration = configuration
        perform(.storage, completion: completion) { authority, stamp in
            let generation = try await authority.generation(stamp: stamp)
            var values: [String: Value] = [
                "version": .number(2), "origin": .text(configuration.memberOrigin),
                "storageKey": .text(configuration.storageKey), "storageGeneration": .text(generation),
                "redirectPolicy": .text("reject-before-send"), "storagePolicy": .text("os-protected"),
                "requestIdPolicy": .text("os-random-uuid"), "publicPolicy": .text("circle-discovery-v1"),
                "circleInvitePolicy": .text("public-circle-invite-v1"),
                "readingPolicy": .text("pinned-passage-v1"), "profilePolicy": .text("owner-profile-v1"),
                "memberBlocksPolicy": .text("owner-member-blocks-v1"),
                "publicProfilePolicy": .text("published-profile-v1"), "savedReadingPolicy": .text("owner-reading-v1"),
                "attendancePolicy": .text("circle-rsvp-v1"), "hostingPolicy": .text("circle-host-v1"),
                "circleAdmissionPolicy": .text("member-bound-circle-admission-v1"),
                "messageAiConsentPolicy": .text("author-message-ai-consent-v1"),
                "messageReviewPolicy": .text("assigned-message-review-v1"),
                "circleReviewPolicy": .text("assigned-circle-review-v1")
            ]
            if let origin = configuration.providerOrigin, let key = configuration.publishableKey {
                values["authPolicy"] = .text("supabase-password-v1")
                values["providerOrigin"] = .text(origin)
                values["publishableKey"] = .text(key)
                values["emailAuthPolicy"] = .text("supabase-email-pkce-v1")
                values["emailCallbackUrl"] = .text(configuration.emailCallbackURL)
            }
            return .object(values)
        }
    }

    @objc(beginWithGeneration:completion:)
    public func begin(generation: String, completion: @escaping SoeMemberBridgeCompletion) {
        perform(.network, completion: completion) { authority, stamp in
            .text(try await authority.begin(generation: generation, stamp: stamp))
        }
    }

    @objc(newRequestIdWithGeneration:completion:)
    public func newRequestId(generation: String, completion: @escaping SoeMemberBridgeCompletion) {
        perform(.storage, completion: completion) { authority, stamp in
            .text(try await authority.newRequestID(generation: generation, stamp: stamp))
        }
    }

    @objc(readWithSlot:generation:completion:)
    public func read(slot: String, generation: String, completion: @escaping SoeMemberBridgeCompletion) {
        perform(.storage, completion: completion) { authority, stamp in
            try await authority.read(slot: slot, generation: generation, stamp: stamp).map(Value.text) ?? .null
        }
    }

    @objc(writeWithSlot:value:generation:completion:)
    public func write(slot: String, value: String, generation: String, completion: @escaping SoeMemberBridgeCompletion) {
        perform(.storage, completion: completion) { authority, stamp in
            try await authority.write(slot: slot, value: value, generation: generation, stamp: stamp)
            return .null
        }
    }

    @objc(removeWithSlot:generation:completion:)
    public func remove(slot: String, generation: String, completion: @escaping SoeMemberBridgeCompletion) {
        perform(.storage, completion: completion) { authority, stamp in
            try await authority.remove(slot: slot, generation: generation, stamp: stamp)
            return .null
        }
    }

    @objc(resetAccountStorageWithExpectedGeneration:completion:)
    public func resetAccountStorage(expectedGeneration: String, completion: @escaping SoeMemberBridgeCompletion) {
        guard let stamp = capture(.storage) else { fail(completion); return }
        Task {
            do {
                let result = try await authority.resetAccountStorageWithStamp(expectedGeneration: expectedGeneration, stamp: stamp)
                let reset = result.reset
                settle(.object(["previousGeneration": .text(reset.previousGeneration), "generation": .text(reset.generation),
                                "cleared": .boolean(reset.cleared)]), stamp: result.stamp, completion: completion)
            } catch { fail(completion) }
        }
    }

    @objc(sendWithId:url:method:bearer:body:completion:)
    public func send(id: String, url: String, method: String, bearer: String, body: String?, completion: @escaping SoeMemberBridgeCompletion) {
        send(id, lane: .member, input: .init(url: url, method: method, bearer: bearer, body: body), completion: completion)
    }

    @objc(sendReviewWithId:url:method:bearer:body:completion:)
    public func sendReview(id: String, url: String, method: String, bearer: String, body: String?, completion: @escaping SoeMemberBridgeCompletion) {
        send(id, lane: .messageReview, input: .init(url: url, method: method, bearer: bearer, body: body), completion: completion)
    }

    @objc(sendCircleReviewWithId:url:method:bearer:body:completion:)
    public func sendCircleReview(id: String, url: String, method: String, bearer: String, body: String?, completion: @escaping SoeMemberBridgeCompletion) {
        send(id, lane: .circleReview, input: .init(url: url, method: method, bearer: bearer, body: body), completion: completion)
    }

    @objc(sendAuthWithId:url:method:bearer:body:completion:)
    public func sendAuth(id: String, url: String, method: String, bearer: String?, body: String?, completion: @escaping SoeMemberBridgeCompletion) {
        send(id, lane: .auth, input: .init(url: url, method: method, bearer: bearer, body: body), completion: completion)
    }

    @objc(sendPublicWithId:url:method:completion:)
    public func sendPublic(id: String, url: String, method: String, completion: @escaping SoeMemberBridgeCompletion) {
        send(id, lane: .publicRead, input: .init(url: url, method: method, bearer: nil, body: nil), completion: completion)
    }

    @objc(sendEmailAuthWithId:flowId:url:method:bearer:body:completion:)
    public func sendEmailAuth(id: String, flowId: String, url: String, method: String, bearer: String?, body: String?,
                              completion: @escaping SoeMemberBridgeCompletion) {
        dispatch(id, emailRevision: currentEmailRevision(), completion: completion) { authority, stamp in
            try await authority.sendEmailAuthWithDeadline(id: id, flowID: flowId,
                input: .init(url: url, method: method, bearer: bearer, body: body), stamp: stamp)
        }
    }

    @objc(prepareEmailLinkWithGeneration:purpose:email:completion:)
    public func prepareEmailLink(generation: String, purpose: String, email: String, completion: @escaping SoeMemberBridgeCompletion) {
        perform(.storage, emailRevision: nextEmailRevision(), completion: completion) { authority, stamp in
            Self.pending(try await authority.prepareEmailLink(purpose: purpose, email: email, generation: generation, stamp: stamp))
        }
    }

    @objc(pendingEmailLinkWithGeneration:completion:)
    public func pendingEmailLink(generation: String, completion: @escaping SoeMemberBridgeCompletion) {
        perform(.storage, emailRevision: currentEmailRevision(), completion: completion) { authority, stamp in
            try await authority.pendingEmailLink(generation: generation, stamp: stamp).map(Self.pending) ?? .null
        }
    }

    @objc(claimEmailLinkWithGeneration:flowId:completion:)
    public func claimEmailLink(generation: String, flowId: String, completion: @escaping SoeMemberBridgeCompletion) {
        let revision = nextEmailRevision()
        guard let stamp = capture(.network) else { fail(completion); return }
        Task {
            do {
                let result = try await authority.claimEmailLinkWithScope(flowID: flowId, generation: generation, stamp: stamp)
                let claim = result.claim
                let value = Value.object(["flowId": .text(claim.flowId), "purpose": .text(claim.purpose), "email": .text(claim.email),
                                          "code": .text(claim.code), "verifier": .text(claim.verifier), "expiresAt": .number(claim.expiresAt)])
                settle(value, stamp: stamp, emailRevision: revision, admission: result.watchID,
                       deadline: result.deadline, completion: completion)
            } catch { fail(completion) }
        }
    }

    @objc(discardEmailLinkWithGeneration:flowId:completion:)
    public func discardEmailLink(generation: String, flowId: String, completion: @escaping SoeMemberBridgeCompletion) {
        perform(.storage, emailRevision: nextEmailRevision(), completion: completion) { authority, stamp in
            try await authority.discardEmailLink(flowID: flowId, generation: generation, stamp: stamp)
            return .null
        }
    }

    @objc(cancelWithId:completion:)
    public func cancel(id: String, completion: @escaping SoeMemberBridgeCompletion) {
        // Native lifecycle closure already retires unavailable transfers. A
        // retained attachment may never cancel a newer attachment's lease.
        guard let stamp = capture(.network) else { fail(completion); return }
        lock.withLock { _ = deliveries.removeValue(forKey: id) }
        Task {
            await authority.cancel(id, stamp: stamp)
            settle(.null, stamp: stamp, completion: completion)
        }
    }

    private func capture(_ purpose: SoeMemberAccessPurpose) -> SoeMemberAccessStamp? {
        lock.withLock {
            guard !invalidated else { return nil }
            return try? authority.fence.stamp(for: purpose)
        }
    }

    private func perform(_ purpose: SoeMemberAccessPurpose, emailRevision: UInt64? = nil, completion: @escaping SoeMemberBridgeCompletion,
                         work: @escaping @Sendable (SoeMemberAuthority, SoeMemberAccessStamp) async throws -> Value) {
        guard let stamp = capture(purpose) else { fail(completion); return }
        Task {
            do { settle(try await work(authority, stamp), stamp: stamp, emailRevision: emailRevision, completion: completion) }
            catch { fail(completion) }
        }
    }

    private func settle(_ value: Value, stamp: SoeMemberAccessStamp, emailRevision: UInt64? = nil,
                        admission: UUID? = nil, deadline: ContinuousClock.Instant? = nil,
                        delivery: Delivery? = nil,
                        completion: @escaping SoeMemberBridgeCompletion) {
        deliveryQueue.async {
            let admitted = self.lock.withLock {
                if let delivery {
                    guard self.deliveries[delivery.id] == delivery.token else { return false }
                    self.deliveries.removeValue(forKey: delivery.id)
                }
                guard !self.invalidated, self.authority.fence.isCurrent(stamp),
                      emailRevision == nil || self.emailRevision == emailRevision,
                      deadline == nil || ContinuousClock().now < deadline! else { return false }
                return admission.map { self.authority.fence.isAdmissionCurrent($0, stamp: stamp) } ?? true
            }
            // This check is the delivery admission boundary. External callbacks
            // run without our locks so promise/event consumers may reenter.
            if admitted { completion(value.foundation, true) }
            else { completion(nil, false) }
        }
    }

    private func fail(_ completion: @escaping SoeMemberBridgeCompletion, delivery: Delivery? = nil) {
        deliveryQueue.async {
            if let delivery {
                self.lock.withLock {
                    if self.deliveries[delivery.id] == delivery.token { self.deliveries.removeValue(forKey: delivery.id) }
                }
            }
            completion(nil, false)
        }
    }

    private func currentEmailRevision() -> UInt64 { lock.withLock { emailRevision } }
    private func nextEmailRevision() -> UInt64 {
        lock.withLock { emailRevision &+= 1; return emailRevision }
    }

    private func send(_ id: String, lane: SoeMemberLane, input: SoeMemberWireInput, completion: @escaping SoeMemberBridgeCompletion) {
        dispatch(id, completion: completion) { authority, stamp in
            try await authority.sendWithDeadline(id: id, lane: lane, input: input, stamp: stamp)
        }
    }

    private func dispatch(_ id: String, emailRevision: UInt64? = nil, completion: @escaping SoeMemberBridgeCompletion,
                          work: @escaping @Sendable (SoeMemberAuthority, SoeMemberAccessStamp) async throws
                            -> (reply: SoeMemberWireResponse, deadline: ContinuousClock.Instant)) {
        guard let stamp = capture(.network) else { fail(completion); return }
        let delivery: Delivery? = lock.withLock {
            guard !invalidated, deliveries[id] == nil else { return nil }
            let value = Delivery(id: id, token: UUID())
            deliveries[id] = value.token
            return value
        }
        guard let delivery else { fail(completion); return }
        Task {
            do {
                let result = try await work(authority, stamp)
                settle(Self.response(result.reply), stamp: stamp, emailRevision: emailRevision,
                       deadline: result.deadline, delivery: delivery, completion: completion)
            } catch { fail(completion, delivery: delivery) }
        }
    }

    private static func response(_ response: SoeMemberWireResponse) -> Value {
        .object(["status": .number(Int64(response.status)), "url": .text(response.url),
                 "body": .text(response.body), "redirected": .boolean(response.redirected)])
    }

    private static func pending(_ pending: SoeMemberEmailPending) -> Value {
        .object(["flowId": .text(pending.flowId), "purpose": .text(pending.purpose), "email": .text(pending.email),
                 "challenge": .text(pending.challenge), "redirectTo": .text(pending.redirectTo),
                 "createdAt": .number(pending.createdAt), "expiresAt": .number(pending.expiresAt), "phase": .text(pending.phase)])
    }
}
