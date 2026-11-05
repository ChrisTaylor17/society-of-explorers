import Foundation

private struct VaultTestFailure: Error, CustomStringConvertible {
    let description: String
}
private func vaultExpect(_ value: Bool, _ message: String) throws {
    if !value { throw VaultTestFailure(description: message) }
}
private func vaultRejects(_ expected: SoeMemberVaultError, _ operation: () throws -> Void) throws {
    do { try operation() }
    catch let actual as SoeMemberVaultError {
        switch (expected, actual) {
        case (.invalidInput, .invalidInput), (.staleGeneration, .staleGeneration), (.unavailable, .unavailable): return
        default: throw VaultTestFailure(description: "Unexpected vault failure kind")
        }
    }
    throw VaultTestFailure(description: "Vault operation unexpectedly succeeded")
}

/// Whole-record replacements are atomic within this fixture. No Security API is
/// called. Failure injection distinguishes refusal, commit-then-error and lost
/// readback; it does not model Keychain crash durability or cross-process CAS.
private final class VaultBackendFixture: SoeMemberVaultRecordBackend, @unchecked Sendable {
    private let lock = NSLock()
    private var records: [String: Data] = [:]
    private var readCount = 0, writeCount = 0
    private var readFailures: Set<Int> = [], beforeFailures: Set<Int> = [], afterFailures: Set<Int> = [], dropped: Set<Int> = []
    private var history: [Data] = []
    var counts: (reads: Int, writes: Int) { lock.lock(); defer { lock.unlock() }; return (readCount, writeCount) }
    var replacements: [Data] { lock.lock(); defer { lock.unlock() }; return history }
    func faults(reads: Set<Int> = [], before: Set<Int> = [], after: Set<Int> = [], drop: Set<Int> = []) {
        lock.lock(); defer { lock.unlock() }
        readFailures = reads; beforeFailures = before; afterFailures = after; dropped = drop
    }
    func seed(_ namespace: String, _ data: Data?) {
        lock.lock(); defer { lock.unlock() }; records[namespace] = data
    }
    func raw(_ namespace: String) -> Data? { lock.lock(); defer { lock.unlock() }; return records[namespace] }
    func readRecord(namespace: String) throws -> Data? {
        lock.lock(); defer { lock.unlock() }; readCount += 1
        if readFailures.contains(readCount) { throw SoeMemberVaultError.unavailable }
        return records[namespace]
    }
    func replaceRecord(namespace: String, data: Data) throws {
        lock.lock(); defer { lock.unlock() }; writeCount += 1
        if beforeFailures.contains(writeCount) { throw SoeMemberVaultError.unavailable }
        if !dropped.contains(writeCount) { records[namespace] = data; history.append(data) }
        if afterFailures.contains(writeCount) { throw SoeMemberVaultError.unavailable }
    }
}
private final class VaultGenerations: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String]
    init(_ values: [String]) { self.values = values }
    func next() throws -> String {
        lock.lock(); defer { lock.unlock() }
        guard !values.isEmpty else { throw SoeMemberVaultError.unavailable }
        return values.removeFirst()
    }
}
private func vaultJSON(_ object: [String: Any]) throws -> Data {
    try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
}

func runSoeMemberVaultTests() throws {
    let first = "00000000-0000-4000-8000-000000000001"
    let second = "00000000-0000-4000-8000-000000000002"
    let third = "00000000-0000-4000-8000-000000000003"
    let namespace = "org.soe.fixture|https://soe.invalid|public-policy"
    var count = 0
    func test(_ name: String, _ operation: () throws -> Void) throws {
        try operation(); count += 1; print("PASS vault \(count): \(name)")
    }
    func make(_ backend: VaultBackendFixture, _ generations: [String] = [], name: String? = nil) throws -> SoeMemberVault {
        let source = VaultGenerations(generations)
        return try SoeMemberVault(namespace: name ?? namespace, backend: backend, makeGeneration: { try source.next() })
    }
    func populated() throws -> (VaultBackendFixture, SoeMemberVault) {
        let backend = VaultBackendFixture(), vault = try make(backend, [first, second, third])
        try vaultExpect(vault.generation() == first, "Initial generation")
        for slot in ["session", "pkce", "user"] { try vault.write(slot: slot, value: "synthetic-\(slot)-secret", generation: first) }
        try vault.writeEmailBinding("synthetic-email-verifier", generation: first)
        return (backend, vault)
    }
    func assertClosed(_ vault: SoeMemberVault, _ backend: VaultBackendFixture) throws {
        let before = backend.counts
        try vaultRejects(.unavailable) { _ = try vault.generation() }
        try vaultRejects(.unavailable) { _ = try vault.read(slot: "session", generation: first) }
        try vaultRejects(.unavailable) { try vault.write(slot: "session", value: "late", generation: first) }
        try vaultRejects(.unavailable) { _ = try vault.reset(expectedGeneration: first) }
        try vaultExpect(backend.counts == before, "Poisoned instance accessed its backend")
    }
    func assertEmpty(_ vault: SoeMemberVault, _ generation: String) throws {
        try vaultExpect(vault.generation() == generation, "Wrong successor")
        for slot in ["session", "pkce", "user"] { try vaultExpect(vault.read(slot: slot, generation: generation) == nil, "Reset retained a slot") }
        try vaultExpect(vault.readEmailBinding(generation: generation) == nil, "Reset retained email binding")
    }

    try test("construction is lazy; fresh generation commits and survives reopening") {
        let backend = VaultBackendFixture(), vault = try make(backend, [first])
        try vaultExpect(backend.counts == (0, 0), "Initializer accessed backend")
        try vaultExpect(vault.generation() == first, "Fresh generation mismatch")
        try vaultExpect(backend.counts.writes == 1, "Initialization must replace once")
        let reopened = try make(backend)
        try vaultExpect(reopened.generation() == first, "Generation did not persist")
        try vaultExpect(backend.counts.writes == 1, "Read-only reopening wrote")
    }
    try test("normal slots preserve exact Unicode, empty values and independent removal") {
        let backend = VaultBackendFixture(), vault = try make(backend, [first])
        _ = try vault.generation()
        try vault.write(slot: "session", value: "🧭\u{0}e\u{301}", generation: first)
        try vault.write(slot: "pkce", value: "", generation: first)
        try vault.write(slot: "user", value: "public synthetic fixture", generation: first)
        let reopened = try make(backend)
        try vaultExpect(reopened.read(slot: "session", generation: first) == "🧭\u{0}e\u{301}", "Unicode changed")
        try vaultExpect(reopened.read(slot: "pkce", generation: first) == "", "Empty value became missing")
        try reopened.remove(slot: "session", generation: first)
        try vaultExpect(reopened.read(slot: "session", generation: first) == nil, "Remove failed")
        try vaultExpect(reopened.read(slot: "user", generation: first) == "public synthetic fixture", "Remove changed another slot")
    }
    try test("namespace is exact and independent") {
        let backend = VaultBackendFixture(), a = try make(backend, [first]), b = try make(backend, [second], name: namespace + "-other")
        _ = try a.generation(); _ = try b.generation()
        try a.write(slot: "session", value: "only-a", generation: first)
        try vaultExpect(b.read(slot: "session", generation: second) == nil, "Namespace crossed")
    }
    try test("invalid namespace, generation and generic slot fail before storage") {
        let backend = VaultBackendFixture()
        for value in ["", " leading", "trailing ", "line\nfeed", String(repeating: "a", count: 1025)] {
            try vaultRejects(.invalidInput) { _ = try make(backend, name: value) }
        }
        let vault = try make(backend, [first])
        for generation in ["", first.uppercased().replacingOccurrences(of: "000000000001", with: "abcdefabcdef"), first + "\n", "not-a-uuid"] {
            if SoeMemberVault.isGeneration(generation) { continue }
            try vaultRejects(.invalidInput) { _ = try vault.read(slot: "session", generation: generation) }
        }
        for slot in ["", "Session", "email-link-v1", "emailBinding", "generation", "session/../user"] {
            try vaultRejects(.invalidInput) { _ = try vault.read(slot: slot, generation: first) }
            try vaultRejects(.invalidInput) { try vault.write(slot: slot, value: "x", generation: first) }
            try vaultRejects(.invalidInput) { try vault.remove(slot: slot, generation: first) }
        }
        try vaultExpect(backend.counts == (0, 0), "Invalid input touched storage")
    }
    try test("normal bounds count UTF8 bytes; maximum complete record fits") {
        let backend = VaultBackendFixture(), vault = try make(backend, [first])
        _ = try vault.generation()
        let maximum = String(repeating: "🧭", count: 16_384)
        for slot in ["session", "pkce", "user"] { try vault.write(slot: slot, value: maximum, generation: first) }
        try vault.writeEmailBinding(String(repeating: "🧭", count: 2048), generation: first)
        try vaultExpect(vault.read(slot: "session", generation: first) == maximum, "Boundary value changed")
        try vaultExpect(backend.raw(namespace)!.count <= SoeMemberVault.maximumRecordBytes, "Record exceeds bound")
        let before = backend.counts
        try vaultRejects(.invalidInput) { try vault.write(slot: "session", value: maximum + "a", generation: first) }
        try vaultRejects(.invalidInput) { try vault.writeEmailBinding(String(repeating: "🧭", count: 2048) + "a", generation: first) }
        try vaultExpect(backend.counts == before, "Oversize input accessed storage")
    }
    try test("reserved email binding uses explicit API and nil removes it") {
        let backend = VaultBackendFixture(), vault = try make(backend, [first])
        _ = try vault.generation()
        try vault.writeEmailBinding("synthetic-verifier", generation: first)
        try vaultExpect(vault.readEmailBinding(generation: first) == "synthetic-verifier", "Email binding missing")
        try vault.writeEmailBinding(nil, generation: first)
        try vaultExpect(vault.readEmailBinding(generation: first) == nil, "Email binding removal failed")
    }
    try test("all operations reject stale generation without writing") {
        let (backend, vault) = try populated(), before = backend.counts.writes
        try vaultRejects(.staleGeneration) { _ = try vault.read(slot: "session", generation: second) }
        try vaultRejects(.staleGeneration) { try vault.write(slot: "session", value: "late", generation: second) }
        try vaultRejects(.staleGeneration) { try vault.remove(slot: "session", generation: second) }
        try vaultRejects(.staleGeneration) { _ = try vault.readEmailBinding(generation: second) }
        try vaultRejects(.staleGeneration) { try vault.writeEmailBinding(nil, generation: second) }
        try vaultRejects(.staleGeneration) { _ = try vault.reset(expectedGeneration: second) }
        try vaultExpect(backend.counts.writes == before, "Stale generation wrote")
    }
    try test("reset commits a secret-free marker then exact empty successor") {
        let (backend, vault) = try populated(), before = backend.replacements.count
        let receipt = try vault.reset(expectedGeneration: first)
        try vaultExpect(receipt == SoeMemberReset(previousGeneration: first, generation: second, cleared: true), "Reset receipt mismatch")
        let writes = Array(backend.replacements.dropFirst(before))
        try vaultExpect(writes.count == 2, "Reset stage count")
        let marker = try JSONSerialization.jsonObject(with: writes[0]) as! [String: Any]
        try vaultExpect(Set(marker.keys) == ["version", "kind", "previousGeneration", "generation"], "Marker contains fields other than metadata")
        try vaultExpect(marker["kind"] as? String == "reset", "Not a marker")
        try assertEmpty(vault, second)
        try vaultRejects(.staleGeneration) { try vault.write(slot: "session", value: "late", generation: first) }
        try vaultExpect(try make(backend).generation() == second, "Successor does not survive reopening")
    }
    try test("missing record after observation fails closed rather than inventing a clear") {
        let (backend, vault) = try populated(), before = backend.counts.writes
        backend.seed(namespace, nil)
        try vaultRejects(.unavailable) { _ = try vault.generation() }
        try vaultExpect(backend.counts.writes == before, "Unexpected reinitialization")
        try assertClosed(vault, backend)
    }
    try test("read failure closes the instance even after backend recovers") {
        let backend = VaultBackendFixture(), vault = try make(backend, [first])
        backend.faults(reads: [1])
        try vaultRejects(.unavailable) { _ = try vault.generation() }
        backend.faults(); try assertClosed(vault, backend)
    }
    for mode in ["before", "after", "drop", "readback"] {
        try test("ordinary write \(mode) ambiguity closes authority without guessing outcome") {
            let (backend, vault) = try populated(), calls = backend.counts
            switch mode {
            case "before": backend.faults(before: [calls.writes + 1])
            case "after": backend.faults(after: [calls.writes + 1])
            case "drop": backend.faults(drop: [calls.writes + 1])
            default: backend.faults(reads: [calls.reads + 2])
            }
            try vaultRejects(.unavailable) { try vault.write(slot: "session", value: "new-synthetic-secret", generation: first) }
            backend.faults(); try assertClosed(vault, backend)
            let reopened = try make(backend)
            let expected = mode == "before" || mode == "drop" ? "synthetic-session-secret" : "new-synthetic-secret"
            try vaultExpect(reopened.read(slot: "session", generation: first) == expected, "Fixture commit boundary mismatch")
        }
    }
    try test("unconfirmed removal also closes the instance") {
        let (backend, vault) = try populated(), calls = backend.counts
        backend.faults(after: [calls.writes + 1])
        try vaultRejects(.unavailable) { try vault.remove(slot: "session", generation: first) }
        backend.faults(); try assertClosed(vault, backend)
        try vaultExpect(try make(backend).read(slot: "session", generation: first) == nil, "Committed removal missing")
    }
    try test("pre-marker failure does NOT claim durable retirement of another owner") {
        let (backend, vault) = try populated(), calls = backend.counts, original = backend.raw(namespace)
        backend.faults(before: [calls.writes + 1])
        try vaultRejects(.unavailable) { _ = try vault.reset(expectedGeneration: first) }
        backend.faults(); try assertClosed(vault, backend)
        try vaultExpect(backend.raw(namespace) == original, "Pre-marker fixture changed storage")
        let reopened = try make(backend)
        try vaultExpect(reopened.generation() == first, "Pre-marker failure incorrectly claimed new durable epoch")
        try vaultExpect(reopened.read(slot: "session", generation: first) == "synthetic-session-secret", "Pre-marker limitation hidden")
    }
    for boundary in ["marker-after", "marker-readback", "empty-before", "empty-after", "empty-readback"] {
        try test("reset \(boundary) reopens only empty successor; failed instance stays closed") {
            let (backend, vault) = try populated(), calls = backend.counts
            switch boundary {
            case "marker-after": backend.faults(after: [calls.writes + 1])
            case "marker-readback": backend.faults(reads: [calls.reads + 2])
            case "empty-before": backend.faults(before: [calls.writes + 2])
            case "empty-after": backend.faults(after: [calls.writes + 2])
            default: backend.faults(reads: [calls.reads + 3])
            }
            try vaultRejects(.unavailable) { _ = try vault.reset(expectedGeneration: first) }
            backend.faults(); try assertClosed(vault, backend)
            let reopened = try make(backend)
            try assertEmpty(reopened, second)
            try vaultRejects(.staleGeneration) { _ = try reopened.read(slot: "session", generation: first) }
        }
    }
    try test("failed committed-marker recovery remains unavailable until a fresh open") {
        let (backend, vault) = try populated(), calls = backend.counts
        backend.faults(after: [calls.writes + 1])
        try vaultRejects(.unavailable) { _ = try vault.reset(expectedGeneration: first) }
        let nextWrite = backend.counts.writes + 1
        backend.faults(before: [nextWrite])
        let failedRecovery = try make(backend)
        try vaultRejects(.unavailable) { _ = try failedRecovery.generation() }
        backend.faults(); try assertClosed(failedRecovery, backend)
        try assertEmpty(make(backend), second)
    }
    try test("a sequential old instance cannot write after another owner reset") {
        let (backend, old) = try populated(), newer = try make(backend, [second])
        _ = try newer.reset(expectedGeneration: first)
        try vaultRejects(.staleGeneration) { try old.write(slot: "user", value: "late", generation: first) }
        try assertEmpty(newer, second)
        // This sequential test is deliberately not a claim of process-wide CAS.
    }
    for invalid in [first, "UPPERCASE-OR-NONUUID", "00000000-0000-4000-8000-abcdefABCDEF"] {
        try test("reset rejects repeated/noncanonical generated epoch \(invalid)") {
            let backend = VaultBackendFixture(), vault = try make(backend, [first, invalid])
            _ = try vault.generation(); let before = backend.counts.writes
            try vaultRejects(.unavailable) { _ = try vault.reset(expectedGeneration: first) }
            try vaultExpect(backend.counts.writes == before, "Invalid successor written")
            try assertClosed(vault, backend)
        }
    }

    let ready: [String: Any] = ["version": 1, "kind": "ready", "generation": first, "slots": [String: String](), "emailBinding": NSNull()]
    var corruptions: [(String, Data)] = [("invalid JSON", Data("{".utf8)), ("empty record", Data()), ("oversize record", Data(repeating: 0, count: SoeMemberVault.maximumRecordBytes + 1))]
    func changed(_ key: String, _ value: Any) throws -> Data { var copy = ready; copy[key] = value; return try vaultJSON(copy) }
    corruptions.append(("extra field", try changed("unexpected", "x")))
    corruptions.append(("boolean version", try changed("version", true)))
    corruptions.append(("wrong version", try changed("version", 2)))
    corruptions.append(("unknown kind", try changed("kind", "other")))
    corruptions.append(("uppercase generation", try changed("generation", "00000000-0000-4000-8000-abcdefABCDEF")))
    corruptions.append(("unknown slot", try changed("slots", ["email-link-v1": "eA=="])))
    corruptions.append(("invalid base64", try changed("slots", ["session": "!"])))
    corruptions.append(("invalid UTF8", try changed("slots", ["session": Data([0xff]).base64EncodedString()])))
    corruptions.append(("oversize normal slot", try changed("slots", ["session": Data(repeating: 65, count: 65_537).base64EncodedString()])))
    corruptions.append(("oversize email", try changed("emailBinding", Data(repeating: 65, count: 8193).base64EncodedString())))
    corruptions.append(("wrong email type", try changed("emailBinding", 3)))
    corruptions.append(("repeated marker generation", try vaultJSON(["version": 1, "kind": "reset", "generation": first, "previousGeneration": first])))
    corruptions.append(("marker with secret slot", try vaultJSON(["version": 1, "kind": "reset", "generation": second, "previousGeneration": first, "slots": ["session": "secret"]])))
    let canonical = String(data: try vaultJSON(ready), encoding: .utf8)!
    corruptions.append(("duplicate key", Data(canonical.replacingOccurrences(of: "\"version\":1", with: "\"version\":1,\"version\":1").utf8)))
    corruptions.append(("noncanonical bytes", Data((canonical + "\n").utf8)))
    for (label, bytes) in corruptions {
        try test("corrupt \(label) is not repaired or exposed") {
            let backend = VaultBackendFixture(); backend.seed(namespace, bytes)
            let vault = try make(backend, [first])
            try vaultRejects(.unavailable) { _ = try vault.generation() }
            try vaultExpect(backend.counts.writes == 0 && backend.raw(namespace) == bytes, "Corruption was overwritten")
            try assertClosed(vault, backend)
        }
    }
    print("SoeMemberVaultTests: \(count) passed; fake atomic backend only; zero Keychain operations")
}
