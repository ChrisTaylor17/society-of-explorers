import Foundation

enum SoeMemberConnectivity: String, Sendable {
    case unknown, offline, online
}

enum SoeMemberAccessPurpose: Sendable {
    case storage, network, callback
}

struct SoeMemberAccessStamp: Equatable, Sendable {
    fileprivate let epoch: UUID
    fileprivate let purpose: SoeMemberAccessPurpose
}

/// Native notifications update this fence synchronously. Bridge invocations
/// capture a stamp before queueing actor work. A resumed app cannot admit work
/// captured during a previous foreground, network, or protected-data lifetime.
final class SoeMemberAccessFence: @unchecked Sendable {
    private let lock = NSLock()
    private var appActive = false
    private var protectedDataAvailable = false
    private var connectivity = SoeMemberConnectivity.unknown
    private var closed = false
    private var interactiveEpoch = UUID()
    private var callbackEpoch = UUID()
    private var retirements: [UUID: @Sendable () -> Void] = [:]

    func update(appActive: Bool? = nil, protectedDataAvailable: Bool? = nil,
                connectivity: SoeMemberConnectivity? = nil) {
        let actions = lock.withLock {
            guard !closed else { return [@Sendable () -> Void]() }
            let protectedChanged = protectedDataAvailable.map { $0 != self.protectedDataAvailable } ?? false
            let activityChanged = appActive.map { $0 != self.appActive } ?? false
            let networkChanged = connectivity.map { $0 != self.connectivity } ?? false
            if let appActive { self.appActive = appActive }
            if let protectedDataAvailable { self.protectedDataAvailable = protectedDataAvailable }
            if let connectivity { self.connectivity = connectivity }
            if protectedChanged || activityChanged || networkChanged {
                return rotateLocked(includingCallbacks: protectedChanged)
            }
            return []
        }
        actions.forEach { $0() }
    }

    func connectivitySnapshot() -> SoeMemberConnectivity {
        lock.withLock { closed ? .unknown : connectivity }
    }

    func stamp(for purpose: SoeMemberAccessPurpose) throws -> SoeMemberAccessStamp {
        try lock.withLock {
            let value = SoeMemberAccessStamp(epoch: epoch(for: purpose), purpose: purpose)
            try requireLocked(value, purpose: purpose)
            return value
        }
    }

    func isCurrent(_ stamp: SoeMemberAccessStamp) -> Bool {
        lock.withLock { (try? requireLocked(stamp, purpose: stamp.purpose)) != nil }
    }

    func withCurrent<Value>(_ stamp: SoeMemberAccessStamp, purpose: SoeMemberAccessPurpose,
                            _ work: () throws -> Value) throws -> Value {
        try lock.withLock {
            try requireLocked(stamp, purpose: purpose)
            return try work()
        }
    }

    /// Admission and physical enqueue share the same native fence. A retirement
    /// action runs after releasing the lock, including if a completion races it.
    func admit<Value>(_ stamp: SoeMemberAccessStamp, id: UUID, retire: @escaping @Sendable () -> Void,
                      _ work: () throws -> Value) throws -> Value {
        try lock.withLock {
            try requireLocked(stamp, purpose: .network)
            guard retirements[id] == nil else { throw SoeMemberCoreError.unavailable }
            retirements[id] = retire
            do {
                return try work()
            } catch {
                retirements.removeValue(forKey: id)
                throw error
            }
        }
    }

    func detach(_ id: UUID) {
        lock.withLock { _ = retirements.removeValue(forKey: id) }
    }

    func retireForReset(_ stamp: SoeMemberAccessStamp) throws -> SoeMemberAccessStamp {
        let (next, actions) = try lock.withLock {
            try requireLocked(stamp, purpose: .storage)
            let actions = rotateLocked(includingCallbacks: true)
            return (SoeMemberAccessStamp(epoch: interactiveEpoch, purpose: .storage), actions)
        }
        actions.forEach { $0() }
        return next
    }

    func close() {
        let actions = lock.withLock {
            closed = true
            return rotateLocked(includingCallbacks: true)
        }
        actions.forEach { $0() }
    }

    private func epoch(for purpose: SoeMemberAccessPurpose) -> UUID {
        purpose == .callback ? callbackEpoch : interactiveEpoch
    }

    private func requireLocked(_ stamp: SoeMemberAccessStamp, purpose: SoeMemberAccessPurpose) throws {
        guard !closed, protectedDataAvailable, stamp.purpose == purpose,
              stamp.epoch == epoch(for: purpose), purpose == .callback || appActive,
              purpose != .network || connectivity == .online else {
            throw SoeMemberCoreError.unavailable
        }
    }

    private func rotateLocked(includingCallbacks: Bool) -> [@Sendable () -> Void] {
        interactiveEpoch = UUID()
        if includingCallbacks { callbackEpoch = UUID() }
        let actions = Array(retirements.values)
        retirements.removeAll()
        return actions
    }
}
