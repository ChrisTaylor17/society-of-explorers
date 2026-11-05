import Foundation
import Security
import LocalAuthentication

enum SoeMemberVaultError: Error, Sendable {
    case invalidInput
    case staleGeneration
    case unavailable
}

struct SoeMemberReset: Sendable, Equatable {
    let previousGeneration: String
    let generation: String
    let cleared: Bool
}

/// A replacement must atomically replace ONE complete record. It is not a
/// compare-and-swap contract. A namespace must have one native authority owner;
/// independent processes/instances require additional coordination before use.
protocol SoeMemberVaultRecordBackend: Sendable {
    func readRecord(namespace: String) throws -> Data?
    func replaceRecord(namespace: String, data: Data) throws
}

/// The existing Apple policy's device-only, nonsynchronizing attributes are
/// retained. Construction performs no Keychain operation. No access group or
/// migration from historical namespaces is inferred from the configured name.
struct SoeMemberKeychainRecordBackend: SoeMemberVaultRecordBackend {
    private func query(_ namespace: String) -> [String: Any] {
        let context = LAContext()
        context.interactionNotAllowed = true
        return [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: namespace,
         kSecAttrAccount as String: "soe.protected-record.v1",
         kSecAttrSynchronizable as String: kCFBooleanFalse!,
         kSecUseAuthenticationContext as String: context]
    }

    func readRecord(namespace: String) throws -> Data? {
        var request = query(namespace)
        request[kSecReturnData as String] = kCFBooleanTrue
        request[kSecReturnAttributes as String] = kCFBooleanTrue
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let item = result as? [String: Any],
              let data = item[kSecValueData as String] as? Data,
              data.count <= SoeMemberVault.maximumRecordBytes,
              let accessibility = item[kSecAttrAccessible as String],
              CFEqual(accessibility as CFTypeRef, kSecAttrAccessibleWhenUnlockedThisDeviceOnly)
        else { throw SoeMemberVaultError.unavailable }
        return data
    }

    func replaceRecord(namespace: String, data: Data) throws {
        guard data.count <= SoeMemberVault.maximumRecordBytes else { throw SoeMemberVaultError.unavailable }
        let request = query(namespace)
        let fields: [String: Any] = [kSecValueData as String: data,
                                    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(request as CFDictionary, fields as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw SoeMemberVaultError.unavailable }
        var item = request
        fields.forEach { item[$0.key] = $0.value }
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw SoeMemberVaultError.unavailable }
    }
}

/// Synchronous storage for one native authority actor. The lock protects this
/// instance, not other processes or independently constructed vaults. No decoded
/// record or plaintext slot is retained between calls. Swift/OS memory copies
/// are not a forensic-erasure guarantee.
///
/// The actor MUST retire its authority/requests before calling reset, including
/// before its initial read can fail. Once the marker replacement commits, a
/// new vault may recover only EMPTY successor state. Failure before that commit
/// cannot durably retire another process or a later independently opened owner.
final class SoeMemberVault: @unchecked Sendable {
    static let maximumRecordBytes = 280_000
    private static let normalSlots: Set<String> = ["session", "pkce", "user"]
    private let namespace: String
    private let backend: any SoeMemberVaultRecordBackend
    private let makeGeneration: @Sendable () throws -> String
    private let lock = NSLock()
    private var poisoned = false
    private var observedRecord = false

    private struct Ready {
        let generation: String
        var slots: [String: String]
        var emailBinding: String?
    }
    private enum Record {
        case ready(Ready)
        case reset(previous: String, next: String)
    }

    init(namespace: String,
         backend: any SoeMemberVaultRecordBackend = SoeMemberKeychainRecordBackend(),
         makeGeneration: @escaping @Sendable () throws -> String = { UUID().uuidString.lowercased() }) throws {
        guard !namespace.isEmpty, namespace.utf8.count <= 1024,
              namespace == namespace.trimmingCharacters(in: .whitespacesAndNewlines),
              !namespace.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })
        else { throw SoeMemberVaultError.invalidInput }
        self.namespace = namespace
        self.backend = backend
        self.makeGeneration = makeGeneration
    }

    static func isGeneration(_ value: String) -> Bool {
        value.utf8.count == 36 && value.range(of: "^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$", options: .regularExpression) != nil
    }

    func generation() throws -> String {
        try synchronized { try loadReady().generation }
    }

    func read(slot: String, generation: String) throws -> String? {
        try validate(slot: slot, generation: generation)
        return try synchronized { try current(generation).slots[slot] }
    }

    func write(slot: String, value: String, generation: String) throws {
        try validate(slot: slot, generation: generation)
        guard value.utf8.count <= 65_536 else { throw SoeMemberVaultError.invalidInput }
        try synchronized {
            var record = try current(generation)
            record.slots[slot] = value
            try commit(.ready(record))
        }
    }

    func remove(slot: String, generation: String) throws {
        try validate(slot: slot, generation: generation)
        try synchronized {
            var record = try current(generation)
            record.slots.removeValue(forKey: slot)
            try commit(.ready(record))
        }
    }

    // This reserved binding is deliberately absent from the generic slot API.
    func readEmailBinding(generation: String) throws -> String? {
        guard Self.isGeneration(generation) else { throw SoeMemberVaultError.invalidInput }
        return try synchronized { try current(generation).emailBinding }
    }

    func writeEmailBinding(_ value: String?, generation: String) throws {
        guard Self.isGeneration(generation), value == nil || value!.utf8.count <= 8192
        else { throw SoeMemberVaultError.invalidInput }
        try synchronized {
            var record = try current(generation)
            record.emailBinding = value
            try commit(.ready(record))
        }
    }

    func reset(expectedGeneration: String) throws -> SoeMemberReset {
        guard Self.isGeneration(expectedGeneration) else { throw SoeMemberVaultError.invalidInput }
        return try synchronized {
            let previous = try current(expectedGeneration).generation
            let next: String
            do {
                next = try makeGeneration()
                guard Self.isGeneration(next), next != previous else { throw SoeMemberVaultError.unavailable }
            } catch { poisoned = true; throw SoeMemberVaultError.unavailable }
            // Replacing the record with this marker removes every secret from
            // the durable logical record before successor state is published.
            try commit(.reset(previous: previous, next: next))
            try commit(.ready(Ready(generation: next, slots: [:], emailBinding: nil)))
            return SoeMemberReset(previousGeneration: previous, generation: next, cleared: true)
        }
    }

    private func synchronized<T>(_ operation: () throws -> T) throws -> T {
        lock.lock()
        defer { lock.unlock() }
        guard !poisoned else { throw SoeMemberVaultError.unavailable }
        return try operation()
    }

    private func validate(slot: String, generation: String) throws {
        guard Self.normalSlots.contains(slot), Self.isGeneration(generation) else { throw SoeMemberVaultError.invalidInput }
    }

    private func current(_ expected: String) throws -> Ready {
        let record = try loadReady()
        guard record.generation == expected else { throw SoeMemberVaultError.staleGeneration }
        return record
    }

    private func loadReady() throws -> Ready {
        do {
            guard let bytes = try backend.readRecord(namespace: namespace) else {
                // Disappearance after this instance observed a record is not a
                // confirmed clear. A genuinely new namespace initializes once.
                guard !observedRecord else { throw SoeMemberVaultError.unavailable }
                let generation = try makeGeneration()
                guard Self.isGeneration(generation) else { throw SoeMemberVaultError.unavailable }
                let initial = Ready(generation: generation, slots: [:], emailBinding: nil)
                try commit(.ready(initial))
                observedRecord = true
                return initial
            }
            let decoded = try decode(bytes)
            observedRecord = true
            switch decoded {
            case .ready(let record): return record
            case .reset(_, let next):
                let empty = Ready(generation: next, slots: [:], emailBinding: nil)
                try commit(.ready(empty))
                return empty
            }
        } catch { poisoned = true; throw SoeMemberVaultError.unavailable }
    }

    private func commit(_ record: Record) throws {
        do {
            let encoded = try encode(record)
            try backend.replaceRecord(namespace: namespace, data: encoded)
            guard let readback = try backend.readRecord(namespace: namespace), readback == encoded
            else { throw SoeMemberVaultError.unavailable }
        } catch {
            // An error can follow a committed replacement. This instance never
            // guesses the outcome, retries, or resumes after that ambiguity.
            poisoned = true
            throw SoeMemberVaultError.unavailable
        }
    }

    private func encode(_ record: Record) throws -> Data {
        let object: [String: Any]
        switch record {
        case .ready(let ready):
            let slots = ready.slots.mapValues { Data($0.utf8).base64EncodedString() }
            object = ["version": 1, "kind": "ready", "generation": ready.generation,
                      "slots": slots, "emailBinding": ready.emailBinding.map { Data($0.utf8).base64EncodedString() } as Any? ?? NSNull()]
        case .reset(let previous, let next):
            object = ["version": 1, "kind": "reset", "previousGeneration": previous, "generation": next]
        }
        let bytes = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
        guard bytes.count <= Self.maximumRecordBytes else { throw SoeMemberVaultError.unavailable }
        return bytes
    }

    private func decode(_ bytes: Data) throws -> Record {
        guard !bytes.isEmpty, bytes.count <= Self.maximumRecordBytes,
              let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              let version = object["version"] as? NSNumber,
              CFGetTypeID(version) != CFBooleanGetTypeID(), version == 1,
              let kind = object["kind"] as? String, let generation = object["generation"] as? String,
              Self.isGeneration(generation) else { throw SoeMemberVaultError.unavailable }
        let record: Record
        if kind == "ready" {
            guard Set(object.keys) == ["version", "kind", "generation", "slots", "emailBinding"],
                  let values = object["slots"] as? [String: String], Set(values.keys).isSubset(of: Self.normalSlots)
            else { throw SoeMemberVaultError.unavailable }
            var slots: [String: String] = [:]
            for (slot, value) in values { slots[slot] = try decodeValue(value, maximum: 65_536) }
            let email: String?
            if object["emailBinding"] is NSNull { email = nil }
            else if let value = object["emailBinding"] as? String { email = try decodeValue(value, maximum: 8192) }
            else { throw SoeMemberVaultError.unavailable }
            record = .ready(Ready(generation: generation, slots: slots, emailBinding: email))
        } else if kind == "reset" {
            guard Set(object.keys) == ["version", "kind", "previousGeneration", "generation"],
                  let previous = object["previousGeneration"] as? String,
                  Self.isGeneration(previous), previous != generation else { throw SoeMemberVaultError.unavailable }
            record = .reset(previous: previous, next: generation)
        } else { throw SoeMemberVaultError.unavailable }
        // Reject duplicate keys, added fields, invalid encodings, or any form
        // this writer could not have produced; never silently repair corruption.
        guard try encode(record) == bytes else { throw SoeMemberVaultError.unavailable }
        return record
    }

    private func decodeValue(_ encoded: String, maximum: Int) throws -> String {
        guard let bytes = Data(base64Encoded: encoded), bytes.count <= maximum,
              bytes.base64EncodedString() == encoded, let value = String(data: bytes, encoding: .utf8)
        else { throw SoeMemberVaultError.unavailable }
        return value
    }
}
