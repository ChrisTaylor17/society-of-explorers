import Foundation

private final class SoeMemberNamespaceOwners: @unchecked Sendable {
    private let lock = NSLock()
    private var ids: [String: UUID] = [:]

    func claim(_ namespace: String) throws -> UUID {
        try lock.withLock {
            guard ids[namespace] == nil else { throw SoeMemberCoreError.unavailable }
            let id = UUID()
            ids[namespace] = id
            return id
        }
    }

    func release(_ namespace: String, id: UUID) {
        lock.withLock {
            if ids[namespace] == id { ids.removeValue(forKey: namespace) }
        }
    }
}

/// One owner for the installed namespace. The bridge captures the native fence
/// stamp before queueing calls here and updates the fence on native notifications.
actor SoeMemberAuthority {
    private enum Work: Sendable {
        case regular(SoeMemberLane, SoeMemberWireInput)
        case email(String, SoeMemberWireInput)
    }
    private typealias Delivery = (reply: SoeMemberWireResponse, emailWatchID: UUID?)

    private final class CallerCancellation: @unchecked Sendable {
        private let lock = NSLock()
        private var cancelled = false

        func cancel() { lock.withLock { cancelled = true } }

        func whileActive<Value>(_ work: () throws -> Value) throws -> Value {
            try lock.withLock {
                guard !cancelled else { throw SoeMemberCoreError.unavailable }
                return try work()
            }
        }
    }

    private struct Flight {
        let task: any SoeMemberHTTPTask
        let response: CheckedContinuation<Delivery, any Error>
        let caller: CallerCancellation
        let exactURL: String
        let emailPermit: SoeMemberEmailPermit?
        let emailWatchID: UUID?
        let flowID: String?
    }

    private struct Lease {
        let id: UUID
        let stamp: SoeMemberAccessStamp
        let generation: String
        let deadline: ContinuousClock.Instant
        let expiry: Task<Void, Never>
        var flight: Flight?
    }

    private struct EmailWatch {
        let id: UUID
        let stamp: SoeMemberAccessStamp
        let flowID: String
        var deadline: ContinuousClock.Instant
        var expiry: Task<Void, Never>?
    }

    private static let owners = SoeMemberNamespaceOwners()

    nonisolated let fence: SoeMemberAccessFence
    private let configuration: SoeMemberConfiguration
    private let ownershipID: UUID
    private let vault: SoeMemberVault
    private let transport: any SoeMemberHTTPTransport
    private let clock = ContinuousClock()
    private let requestLifetime: Duration
    private let clockMilliseconds: @Sendable () -> Int64
    private let email: SoeMemberEmailFlow?
    private var exposedGeneration: String?
    private var leases: [String: Lease] = [:]
    private var emailWatch: EmailWatch?

    init(configuration: SoeMemberConfiguration,
         backend: any SoeMemberVaultRecordBackend = SoeMemberKeychainRecordBackend(),
         transport: any SoeMemberHTTPTransport = SoeMemberEphemeralTransport(),
         requestLifetime: Duration = .seconds(15),
         clockMilliseconds: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) throws {
        guard requestLifetime > .zero, requestLifetime <= .seconds(15) else { throw SoeMemberCoreError.unavailable }
        let vault = try SoeMemberVault(namespace: configuration.namespace, backend: backend)
        let email: SoeMemberEmailFlow?
        if let providerOrigin = configuration.providerOrigin, let publishableKey = configuration.publishableKey {
            email = try SoeMemberEmailFlow(providerOrigin: providerOrigin, publishableKey: publishableKey,
                                           callbackURL: configuration.emailCallbackURL, clock: clockMilliseconds)
        } else {
            email = nil
        }
        self.ownershipID = try Self.owners.claim(configuration.namespace)
        self.configuration = configuration
        self.fence = SoeMemberAccessFence()
        self.vault = vault
        self.email = email
        self.transport = transport
        self.requestLifetime = requestLifetime
        self.clockMilliseconds = clockMilliseconds
    }

    deinit {
        fence.close()
        Self.owners.release(configuration.namespace, id: ownershipID)
    }

    func generation(stamp: SoeMemberAccessStamp) throws -> String {
        try storage(stamp) {
            let current = try vault.generation()
            exposedGeneration = current
            return current
        }
    }

    func newRequestID(generation: String, stamp: SoeMemberAccessStamp) throws -> String {
        try storage(stamp) {
            try requireGeneration(generation)
            return UUID().uuidString.lowercased()
        }
    }

    func read(slot: String, generation: String, stamp: SoeMemberAccessStamp) throws -> String? {
        try storage(stamp) { try vault.read(slot: slot, generation: generation) }
    }

    func write(slot: String, value: String, generation: String, stamp: SoeMemberAccessStamp) throws {
        try storage(stamp) { try vault.write(slot: slot, value: value, generation: generation) }
    }

    func remove(slot: String, generation: String, stamp: SoeMemberAccessStamp) throws {
        try storage(stamp) { try vault.remove(slot: slot, generation: generation) }
    }

    func resetAccountStorage(expectedGeneration: String, stamp: SoeMemberAccessStamp) throws -> SoeMemberReset {
        try storage(stamp) {
            guard let exposedGeneration, exposedGeneration.utf8.elementsEqual(expectedGeneration.utf8) else {
                throw SoeMemberCoreError.unavailable
            }
        }
        let successor = try fence.retireForReset(stamp)
        exposedGeneration = nil
        retireEmail()
        cancelAll()
        return try storage(successor) {
            let reset = try vault.reset(expectedGeneration: expectedGeneration)
            exposedGeneration = reset.generation
            return reset
        }
    }

    func begin(generation: String, stamp: SoeMemberAccessStamp) throws -> String {
        discardRetired()
        return try fence.withCurrent(stamp, purpose: .network) {
            try requireGeneration(generation)
            guard leases.count < 32 else { throw SoeMemberCoreError.unavailable }
            let id = UUID()
            let key = id.uuidString.lowercased()
            let deadline = clock.now.advanced(by: requestLifetime)
            let timer = Task { [weak self, clock] in
                do { try await clock.sleep(until: deadline) } catch { return }
                await self?.cancel(key)
            }
            leases[key] = Lease(id: id, stamp: stamp, generation: generation, deadline: deadline, expiry: timer)
            return key
        }
    }

    func send(id: String, lane: SoeMemberLane, input: SoeMemberWireInput,
              stamp: SoeMemberAccessStamp) async throws -> SoeMemberWireResponse {
        try await send(id: id, work: .regular(lane, input), stamp: stamp)
    }

    func sendEmailAuth(id: String, flowID: String, input: SoeMemberWireInput,
                       stamp: SoeMemberAccessStamp) async throws -> SoeMemberWireResponse {
        try await send(id: id, work: .email(flowID, input), stamp: stamp)
    }

    func cancel(_ id: String) {
        guard let lease = leases.removeValue(forKey: id) else { return }
        detach(lease)
        if let flight = lease.flight {
            if let permit = flight.emailPermit { email?.failed(permit) }
            flight.task.cancel()
            flight.response.resume(throwing: SoeMemberCoreError.unavailable)
        }
        if email?.nextClaimDeadline == nil { clearEmailWatch() }
    }

    func close() {
        fence.close()
        exposedGeneration = nil
        retireEmail()
        cancelAll()
        Self.owners.release(configuration.namespace, id: ownershipID)
    }

    func prepareEmailLink(purpose: String, email address: String, generation: String,
                          stamp: SoeMemberAccessStamp) throws -> SoeMemberEmailPending {
        let pending = try storage(stamp) {
            guard let email else { throw SoeMemberCoreError.unavailable }
            return try email.prepare(purpose: purpose, email: address, generation: generation, vault: vault)
        }
        clearEmailWatch()
        cancelEmailLeases()
        return pending
    }

    func pendingEmailLink(generation: String, stamp: SoeMemberAccessStamp) throws -> SoeMemberEmailPending? {
        try storage(stamp) {
            guard let email else { throw SoeMemberCoreError.unavailable }
            return try email.pending(generation: generation, vault: vault)
        }
    }

    func captureEmailLink(_ raw: String, stamp: SoeMemberAccessStamp) throws {
        try fence.withCurrent(stamp, purpose: .callback) {
            guard let email else { throw SoeMemberCoreError.unavailable }
            try email.capture(raw, generation: vault.generation(), vault: vault)
        }
    }

    func claimEmailLink(flowID: String, generation: String, stamp: SoeMemberAccessStamp) throws -> SoeMemberEmailClaim {
        discardRetired()
        let claimed = try fence.withCurrent(stamp, purpose: .network) {
            guard let email else { throw SoeMemberCoreError.unavailable }
            return try email.claim(flowId: flowID, generation: generation, vault: vault)
        }
        clearEmailWatch()
        cancelEmailLeases()
        let watchID = UUID()
        do {
            try fence.admit(stamp, id: watchID, retire: { [weak self] in
                Task { await self?.retireEmail(watchID: watchID) }
            }) {
                let remaining = claimed.expiresAt - clockMilliseconds()
                guard remaining > 0, remaining <= 300_000 else { throw SoeMemberCoreError.unavailable }
                emailWatch = EmailWatch(id: watchID, stamp: stamp, flowID: flowID,
                                        deadline: clock.now.advanced(by: .milliseconds(remaining)))
            }
            scheduleEmailExpiry()
            return try fence.withCurrent(stamp, purpose: .network) { claimed }
        } catch {
            retireEmail()
            throw SoeMemberCoreError.unavailable
        }
    }

    func discardEmailLink(flowID: String, generation: String, stamp: SoeMemberAccessStamp) throws {
        try storage(stamp) {
            guard let email else { throw SoeMemberCoreError.unavailable }
            try email.discard(flowId: flowID, generation: generation, vault: vault)
        }
        if emailWatch?.flowID == flowID { clearEmailWatch() }
        cancelEmailLeases(flowID: flowID)
    }

    private func send(id: String, work: Work, stamp: SoeMemberAccessStamp) async throws -> SoeMemberWireResponse {
        let caller = CallerCancellation()
        let result: Delivery = try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { response in
                enqueue(id: id, work: work, stamp: stamp, caller: caller, response: response)
            }
        } onCancel: {
            // A rejected duplicate must never cancel the invocation that actually
            // owns this lease. The bit also fences a reply ahead of actor cleanup.
            caller.cancel()
            Task { await self.cancel(id, ownedBy: caller) }
        }
        do {
            return try fence.withCurrent(stamp, purpose: .network) {
                try Task.checkCancellation()
                return try caller.whileActive { result.reply }
            }
        } catch {
            if let watchID = result.emailWatchID { retireEmail(watchID: watchID) }
            throw SoeMemberCoreError.unavailable
        }
    }

    private func cancel(_ id: String, ownedBy caller: CallerCancellation) {
        guard leases[id]?.flight?.caller === caller else { return }
        cancel(id)
    }

    private func enqueue(id: String, work: Work, stamp: SoeMemberAccessStamp, caller: CallerCancellation,
                         response: CheckedContinuation<Delivery, any Error>) {
        discardRetired()
        guard let lease = leases[id], lease.flight == nil, lease.stamp == stamp else {
            response.resume(throwing: SoeMemberCoreError.unavailable)
            return
        }
        var task: (any SoeMemberHTTPTask)?
        var emailPermit: SoeMemberEmailPermit?
        var flowID: String?
        do {
            let request = try fence.withCurrent(stamp, purpose: .network) {
                try Task.checkCancellation()
                try caller.whileActive {}
                try requireGeneration(lease.generation)
                switch work {
                case let .regular(lane, input):
                    return try configuration.requestPolicy.request(for: lane, input: input)
                case let .email(flow, input):
                    guard let email else { throw SoeMemberCoreError.unavailable }
                    let authorized = try email.authorize(input: input, flowId: flow, generation: lease.generation, vault: vault)
                    emailPermit = authorized.permit
                    flowID = flow
                    return authorized.request
                }
            }
            guard let exactURL = request.url?.absoluteString else { throw SoeMemberCoreError.unavailable }
            let time = clock.now.duration(to: lease.deadline).components
            let remaining = Double(time.seconds) + Double(time.attoseconds) / 1e18
            guard remaining > 0 else { throw SoeMemberCoreError.unavailable }
            let transfer = try transport.makeTask(request: request, timeout: min(remaining, 15)) { [weak self] result in
                Task { await self?.finish(id, result: result) }
            }
            task = transfer
            try fence.admit(stamp, id: lease.id, retire: { [weak self] in
                transfer.cancel()
                Task { await self?.cancel(id) }
            }) {
                try Task.checkCancellation()
                try requireGeneration(lease.generation)
                guard clock.now < lease.deadline else { throw SoeMemberCoreError.unavailable }
                try caller.whileActive {
                    let watchID = emailWatch.flatMap { $0.flowID == flowID ? $0.id : nil }
                    leases[id]?.flight = Flight(task: transfer, response: response, caller: caller, exactURL: exactURL,
                                                emailPermit: emailPermit, emailWatchID: watchID, flowID: flowID)
                    transfer.resume()
                }
            }
        } catch {
            task?.cancel()
            if let emailPermit { email?.failed(emailPermit) }
            cancel(id)
            response.resume(throwing: SoeMemberCoreError.unavailable)
        }
    }

    private func finish(_ id: String, result: Result<SoeMemberWireResponse, SoeMemberCoreError>) {
        discardRetired()
        guard let lease = leases.removeValue(forKey: id), let flight = lease.flight else { return }
        detach(lease)
        do {
            try fence.withCurrent(lease.stamp, purpose: .network) {
                try flight.caller.whileActive {}
                try requireGeneration(lease.generation)
                guard clock.now < lease.deadline else { throw SoeMemberCoreError.unavailable }
                let response = try result.get()
                try response.check(expectedURL: flight.exactURL)
                if let permit = flight.emailPermit {
                    guard let email else { throw SoeMemberCoreError.unavailable }
                    if let watchID = flight.emailWatchID {
                        guard let watch = emailWatch, watch.id == watchID, clock.now < watch.deadline else {
                            throw SoeMemberCoreError.unavailable
                        }
                    }
                    try email.receive(permit, response: response, vault: vault)
                }
                try flight.caller.whileActive { flight.response.resume(returning: (response, flight.emailWatchID)) }
            }
        } catch {
            if let permit = flight.emailPermit { email?.failed(permit) }
            flight.task.cancel()
            flight.response.resume(throwing: SoeMemberCoreError.unavailable)
        }
        if flight.emailPermit != nil { scheduleEmailExpiry() }
    }

    private func requireGeneration(_ expected: String) throws {
        guard (try vault.generation()).utf8.elementsEqual(expected.utf8) else { throw SoeMemberCoreError.unavailable }
    }

    private func storage<Value>(_ stamp: SoeMemberAccessStamp, _ work: () throws -> Value) throws -> Value {
        discardRetired()
        do { return try fence.withCurrent(stamp, purpose: .storage, work) }
        catch { throw SoeMemberCoreError.unavailable }
    }

    private func discardRetired() {
        let now = clock.now
        let expired = leases.filter { $0.value.deadline <= now || !fence.isCurrent($0.value.stamp) }.map(\.key)
        expired.forEach(cancel)
        if let watch = emailWatch, watch.deadline <= now || !fence.isCurrent(watch.stamp) {
            retireEmail(watchID: watch.id)
        }
    }

    private func detach(_ lease: Lease) {
        lease.expiry.cancel()
        fence.detach(lease.id)
    }

    private func cancelAll() {
        Array(leases.keys).forEach(cancel)
    }

    private func cancelEmailLeases(flowID: String? = nil) {
        let ids = leases.filter { entry in
            guard let flightFlow = entry.value.flight?.flowID else { return false }
            return flowID == nil || flowID == flightFlow
        }.map(\.key)
        ids.forEach(cancel)
    }

    private func scheduleEmailExpiry() {
        guard var watch = emailWatch else { return }
        guard let deadline = email?.nextClaimDeadline else {
            clearEmailWatch()
            return
        }
        let remaining = max(0, deadline - clockMilliseconds())
        watch.deadline = min(watch.deadline, clock.now.advanced(by: .milliseconds(remaining)))
        watch.expiry?.cancel()
        let watchID = watch.id
        let finishAt = watch.deadline
        watch.expiry = Task { [weak self, clock] in
            do { try await clock.sleep(until: finishAt) } catch { return }
            await self?.retireEmail(watchID: watchID)
        }
        emailWatch = watch
    }

    private func clearEmailWatch() {
        guard let watch = emailWatch else { return }
        emailWatch = nil
        fence.detach(watch.id)
        watch.expiry?.cancel()
    }

    private func retireEmail(watchID: UUID? = nil) {
        if let watchID, emailWatch?.id != watchID { return }
        clearEmailWatch()
        email?.retire()
        cancelEmailLeases()
    }
}
