import Foundation

internal enum SoeMemberLane: Sendable, Equatable { case member, messageReview, circleReview, auth, publicRead }
internal enum SoeMemberRequestPolicyError: Error, Sendable { case rejected }

/// Stateless request construction only. Authority, lifetime, transport and email
/// link state belong to separate owners. No caller can supply a header or cookie.
internal struct SoeMemberRequestPolicy: Sendable {
    private let memberOrigin: String
    private let providerOrigin: String?
    private let publishableKey: String?
    private static let uuidPattern = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
    private static let books: Set<String> = ["apology", "divine-comedy", "genealogy-of-morals", "hamlet", "meditations", "odyssey", "relativity", "republic"]
    private static let philemonEdition = "web-classic-b2bc6316f4217a8c97637d44786a4cd6b9b9a83b88cd4880b5aacdf67cae4e19"
    private static let editionPattern = "pg-[1-9][0-9]{0,9}-[a-f0-9]{64}"

    init(memberOrigin: String, providerOrigin: String?, publishableKey: String?) throws {
        self.memberOrigin = try Self.checkedOrigin(memberOrigin)
        if providerOrigin == nil && publishableKey == nil {
            self.providerOrigin = nil; self.publishableKey = nil
        } else {
            guard let providerOrigin, let publishableKey,
                  Self.matches(publishableKey, "sb_publishable_[A-Za-z0-9_-]{20,200}") else { throw SoeMemberRequestPolicyError.rejected }
            self.providerOrigin = try Self.checkedOrigin(providerOrigin)
            self.publishableKey = publishableKey
        }
    }

    static func checkedOrigin(_ value: String) throws -> String {
        try check(value.utf8.count <= 300 && matches(value, "https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?"))
        guard let c = URLComponents(string: value), let host = c.host else { throw SoeMemberRequestPolicyError.rejected }
        try check(c.scheme == "https" && c.user == nil && c.password == nil && c.path.isEmpty && c.query == nil && c.fragment == nil)
        try check(c.port == nil || (1...65535).contains(c.port!) && c.port != 443)
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        try check(labels.allSatisfy { !$0.isEmpty && $0.utf8.count <= 63 && !$0.hasPrefix("-") && !$0.hasSuffix("-") })
        // WHATWG/OkHttp normalize numeric IPv4 shorthand and octal/hex forms.
        // Foundation does not, so reject them rather than create a second origin.
        if let last = labels.last, matches(String(last), "[0-9]+|0x[0-9a-f]+") {
            try check(labels.count == 4 && labels.allSatisfy {
                matches(String($0), "0|[1-9][0-9]{0,2}") && Int($0).map { $0 <= 255 } == true
            })
        }
        try check(c.string == value && c.url?.absoluteString == value)
        return value
    }

    func request(for lane: SoeMemberLane, input: SoeMemberWireInput) throws -> URLRequest {
        let origin: String
        if case .auth = lane {
            guard let providerOrigin else { throw SoeMemberRequestPolicyError.rejected }; origin = providerOrigin
        } else { origin = memberOrigin }
        let (url, path, query) = try Self.checkedURL(input.url, origin: origin)
        var headers = ["Cache-Control": "no-store", "Pragma": "no-cache"]
        switch lane {
        case .member:
            try Self.bearer(input.bearer)
            try Self.member(input, path: path, query: query)
            headers["Authorization"] = "Bearer " + input.bearer!
        case .messageReview, .circleReview:
            try Self.bearer(input.bearer)
            try Self.review(input, path: path, query: query, listing: lane == .circleReview)
            headers["Authorization"] = "Bearer " + input.bearer!
        case .publicRead:
            try Self.check(input.bearer == nil && input.body == nil && input.method == "GET")
            try Self.publicRead(path: path, query: query)
        case .auth:
            guard let publishableKey else { throw SoeMemberRequestPolicyError.rejected }
            try Self.auth(input, endpoint: path + (query.map { "?" + $0 } ?? ""), key: publishableKey)
            headers["apikey"] = publishableKey
            headers["Authorization"] = "Bearer " + (input.bearer ?? publishableKey)
            headers["X-Supabase-Api-Version"] = "2024-01-01"
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.httpMethod = input.method
        request.httpShouldHandleCookies = false
        if input.method != "GET" {
            request.httpBody = Data((input.body ?? "").utf8)
            headers["Content-Type"] = "application/json"
        }
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        return request
    }

    private static func checkedURL(_ value: String, origin: String) throws -> (URL, String, String?) {
        try check(value.utf8.count <= 16384 && value.hasPrefix(origin + "/") && value.utf8.allSatisfy { $0 >= 33 && $0 <= 126 && $0 != 92 && $0 != 35 })
        guard let c = URLComponents(string: value), let url = c.url else { throw SoeMemberRequestPolicyError.rejected }
        try check(c.scheme == "https" && c.user == nil && c.password == nil && c.fragment == nil && c.string == value && url.absoluteString == value)
        let suffix = String(value.dropFirst(origin.count)), parts = suffix.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        let path = String(parts[0]), query = parts.count == 2 ? String(parts[1]) : nil
        try check(c.percentEncodedPath == path && c.percentEncodedQuery == query)
        return (url, path, query)
    }

    private static func member(_ i: SoeMemberWireInput, path: String, query: String?) throws {
        try check(i.method == "GET" || i.method == "POST")
        let get = i.method == "GET", u = "([0-9a-fA-F-]{36})", lower = "([0-9a-f-]{36})"
        if path == "/api/auth/member" || path == "/api/circles/start" { try check(get && query == nil) }
        else if path == "/api/auth/ensure-member" { try check(!get && query == nil) }
        else if path == "/api/circles" { try check(!get && query == nil); try creation(try body(i, maximum: 12000)) }
        else if path == "/api/members/profile" { try check(query == nil); if !get { try profile(try body(i, maximum: 65536)) } }
        else if path == "/api/members/blocks" {
            if get {
                if let query { try check(query.hasPrefix("after=") && uuid(String(query.dropFirst(6)))) }
            } else {
                try check(query == nil)
                let raw = try body(i, maximum: 256)
                let fields = ["expectedMemberId", "blockId", "expectedRevision", "requestId"]
                let o = try object(raw, keys: fields)
                try check(uuid(try string(o, "expectedMemberId")) && uuid(try string(o, "blockId")) && uuid(try string(o, "requestId")))
                _ = try integer(o, "expectedRevision", minimum: 1, maximum: 9007199254740990)
                try canonical(raw, o, order: fields)
            }
        }
        else if path == "/api/great-books/progress" {
            if get { if let query { try check(query.hasPrefix("bookId=") && books.contains(String(query.dropFirst(7)))) } }
            else { try check(query == nil); try savedReading(try body(i, maximum: 4096)) }
        } else if path == "/api/circles/contributions" || path == "/api/circles/mine" {
            try check(get)
            if let query { try check(query.hasPrefix("after=") && uuid(String(query.dropFirst(6)), lowercase: false)) }
        } else if let m = captures(path, "/api/circles/" + u + "(?:/membership)?") {
            try check(uuid(m[0], lowercase: false) && get && query == nil)
        } else if let m = captures(path, "/api/circles/" + u + "/(join|leave)") {
            try check(uuid(m[0], lowercase: false) && !get && query == nil)
            let raw = try body(i, maximum: 256), object = try object(raw, keys: ["requestId", "expectedRevision"])
            let key = try string(object, "requestId"), revision = try integer(object, "expectedRevision")
            try check(uuid(key, lowercase: false))
            let fields: [(String, SoePolicyJSON)] = [("requestId", .string(key)), ("expectedRevision", .number(String(revision)))]
            try check(equalBytes(raw, encode(fields)) || equalBytes(raw, encode(fields.reversed())))
        } else if let m = captures(path, "/api/circles/" + lower + "/rsvp") {
            try check(uuid(m[0]) && !get && query == nil); try attendance(try body(i, maximum: 256))
        } else if let m = captures(path, "/api/circles/" + lower + "/complete") {
            try check(uuid(m[0]) && !get && query == nil)
            let raw = try body(i, maximum: 160), o = try object(raw, keys: ["expectedMemberId", "requestId", "expectedRevision"])
            try check(uuid(try string(o, "expectedMemberId")) && uuid(try string(o, "requestId"))); _ = try integer(o, "expectedRevision")
            try canonical(raw, o, order: ["expectedMemberId", "requestId", "expectedRevision"])
        } else if let m = captures(path, "/api/book-salons/" + u) { try check(uuid(m[0], lowercase: false) && query == nil) }
        else if let m = captures(path, "/api/circles/" + u + "/discussion/preview") { try check(uuid(m[0], lowercase: false) && !get && query == nil) }
        else if let m = captures(path, "/api/circles/" + u + "/messages/" + u) { try check(m.allSatisfy { uuid($0, lowercase: false) } && query == nil) }
        else if let m = captures(path, "/api/circles/" + lower + "/messages/" + lower + "/ai-consent") {
            try check(m.allSatisfy { uuid($0) } && query == nil); if !get { try consent(try body(i, maximum: 512)) }
        } else if let m = captures(path, "/api/circles/" + u + "/discussion") {
            try check(uuid(m[0], lowercase: false))
            if !get { try check(query == nil) }
            else {
                let pairs = try queryPairs(query), q = Dictionary(uniqueKeysWithValues: pairs)
                let allowed: Set<String> = q["requestId"] != nil ? ["requestId"] : q["message"] != nil ? ["message", "after", "limit"] : ["before", "limit"]
                try check(q.keys.allSatisfy { allowed.contains($0) })
                if q["requestId"] != nil { try check(q.count == 1) }
                for (key, value) in q { if key == "limit" { try decimal(value, maximum: 25) } else { try check(uuid(value, lowercase: false)) } }
            }
        } else { throw SoeMemberRequestPolicyError.rejected }
        if get { try check(i.body == nil) }
        else { _ = try body(i, maximum: path == "/api/members/profile" ? 65536 : path == "/api/great-books/progress" ? 4096 : 16384) }
    }

    private static func review(_ i: SoeMemberWireInput, path: String, query: String?, listing: Bool) throws {
        try check(i.method == "GET" || i.method == "POST")
        let get = i.method == "GET", queue = listing ? "/api/admin/circles/reports" : "/api/admin/circles/messages"
        if path == queue {
            try check(get && i.body == nil)
            if let query { try check(query.hasPrefix("after=") && uuid(String(query.dropFirst(6)))) }; return
        }
        let pattern = listing ? "/api/admin/circles/reports/([0-9a-f-]{36})(/coverage/decision|/coverage)?" : "/api/admin/circles/([0-9a-f-]{36})/messages/([0-9a-f-]{36})(/coverage/decision|/coverage|/advice)?"
        guard let m = captures(path, pattern) else { throw SoeMemberRequestPolicyError.rejected }
        try check(uuid(m[0]) && (listing || uuid(m[1])))
        let suffix = m[listing ? 1 : 2]
        if get {
            try check(i.body == nil)
            if suffix.isEmpty { try check(query == nil) }
            else {
                guard suffix == "/coverage", let query, let q = captures(query, "sessionId=([0-9a-f-]{36})(?:&page=([1-9][0-9]{0,7}))?") else { throw SoeMemberRequestPolicyError.rejected }
                try check(uuid(q[0])); if !q[1].isEmpty { try decimal(q[1], maximum: 42949673) }
            }
        } else {
            try check(query == nil); try reviewBody(try body(i, maximum: 12000), suffix: suffix, listing: listing)
        }
    }

    private static func reviewBody(_ raw: String, suffix: String, listing: Bool) throws {
        let o = try parsedObject(raw)
        if suffix == "/coverage", o["action"] == .string("ack") {
            try keys(o, ["action", "sessionId", "pageToken"])
            try check(uuid(try string(o, "sessionId")) && uuid(try string(o, "pageToken")))
            try canonical(raw, o, order: ["action", "sessionId", "pageToken"]); return
        }
        _ = try integer(o, "expectedRevision")
        if !listing { try check(matches(try string(o, "contentHash"), "[a-f0-9]{64}")) }
        if suffix == "/advice" {
            try check(!listing); try keys(o, ["expectedRevision", "contentHash"])
            try canonical(raw, o, order: ["expectedRevision", "contentHash"]); return
        }
        if suffix == "/coverage" {
            try keys(o, ["action", "expectedRevision", "contentHash"]); try check(o["action"] == .string("start"))
            if listing { try check(o["contentHash"] == .null) }
            try canonical(raw, o, order: ["action", "expectedRevision", "contentHash"]); return
        }
        try check(suffix.isEmpty || suffix == "/coverage/decision")
        var order = ["expectedRevision"] + (listing ? [] : ["contentHash"]) + ["requestId", "action", "reason", "summary", "evidenceReportId", "evidenceExcerpt"]
        if !suffix.isEmpty { order.append("sessionId"); try check(uuid(try string(o, "sessionId"))) }
        try keys(o, order); try check(uuid(try string(o, "requestId")))
        try text(try string(o, "summary"), minimum: 20, maximum: 1000)
        try check(o["evidenceReportId"] == .null || uuid(try string(o, "evidenceReportId")))
        let action = try string(o, "action"), reason = try string(o, "reason")
        if action == "hide" {
            try check((listing ? ["safety", "harassment", "spam", "misleading"] : ["safety", "harassment", "spam", "misleading", "inappropriate"]).contains(reason))
            try text(try string(o, "evidenceExcerpt"), minimum: 5, maximum: 500)
        } else {
            try check(action == "restore" && ["no_violation", "insufficient_evidence", "resolved"].contains(reason) && o["evidenceReportId"] == .null && o["evidenceExcerpt"] == .null)
        }
        try canonical(raw, o, order: order)
    }

    private static func auth(_ i: SoeMemberWireInput, endpoint: String, key: String) throws {
        if (endpoint == "/auth/v1/user" && i.method == "GET") || (endpoint == "/auth/v1/logout?scope=local" && i.method == "POST") {
            try bearer(i.bearer); try check(i.bearer != key && i.body == nil); return
        }
        try check(i.method == "POST" && i.bearer == nil)
        let o = try parsedObject(body(i, maximum: 16384))
        if endpoint == "/auth/v1/token?grant_type=password" {
            try keys(o, o["gotrue_meta_security"] == nil ? ["email", "password"] : ["email", "password", "gotrue_meta_security"])
            let email = try string(o, "email"), password = try string(o, "password")
            try authText(email, maximum: 320); try authText(password, maximum: 4096)
            try check(matches(email, "[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
            if let metadata = o["gotrue_meta_security"] { try check(metadata == .object([])) }
        } else if endpoint == "/auth/v1/token?grant_type=refresh_token" {
            try keys(o, ["refresh_token"]); try bearer(string(o, "refresh_token"))
        } else { throw SoeMemberRequestPolicyError.rejected }
    }

    private static func readingEdition(_ book: String, _ edition: String) -> Bool {
        book == "philemon" ? edition == philemonEdition : matches(edition, editionPattern)
    }

    private static func publicRead(path: String, query: String?) throws {
        if path == "/api/great-books/passage" {
            guard let query else { throw SoeMemberRequestPolicyError.rejected }; try check(query.utf16.count <= 400)
            let pairs = try formQuery(query); try check(pairs.map(\.0) == ["book", "edition", "block"])
            let q = Dictionary(uniqueKeysWithValues: pairs)
            try check(matches(q["book"]!, "[a-z0-9][a-z0-9-]{0,159}") && matches(q["edition"]!, editionPattern))
            try decimal(q["block"]!, maximum: 100000, allowZero: true, digits: 6); return
        }
        if let m = captures(path, "/api/great-books/text/([a-z-]+)") { try check((books.contains(m[0]) || m[0] == "philemon") && query == nil); return }
        if matches(path, "/api/explorer/" + uuidPattern) { try check(query == nil); return }
        if matches(path, "/api/circles/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}") {
            try check(query == "view=listing"); return
        }
        try check(path == "/api/circles")
        let order = ["book", "edition", "from", "to", "q", "city", "format", "open", "sort", "limit", "cursor"]
        let pairs = try formQuery(query), q = Dictionary(uniqueKeysWithValues: pairs)
        try check(pairs.map(\.0) == order.filter { q[$0] != nil })
        for name in ["q", "city"] { if let value = q[name] { try text(value, minimum: 1, maximum: name == "q" ? 160 : 80, singleLine: true); try collapsed(value) } }
        if let value = q["format"] { try check(["in_person", "online"].contains(value)) }
        if let value = q["open"] { try check(value == "1") }
        if let value = q["sort"] { try check(value == "title") }
        if let value = q["limit"] { try decimal(value, maximum: 24) }
        if let value = q["cursor"] { try check(matches(value, "[A-Za-z0-9_-]{1,4096}")) }
        if ["book", "edition", "from", "to"].contains(where: { q[$0] != nil }) {
            let book = q["book"] ?? ""
            try check(matches(book, "[a-z0-9][a-z0-9-]{0,159}") && readingEdition(book, q["edition"] ?? ""))
            if q["from"] != nil || q["to"] != nil {
                try decimal(q["from"] ?? "", maximum: 999999, allowZero: true, digits: 6)
                try decimal(q["to"] ?? "", maximum: 999999, allowZero: true, digits: 6)
                try check(Int(q["from"]!)! <= Int(q["to"]!)! && (book != "philemon" || q["to"] == "0"))
            }
        }
    }

    private static func consent(_ raw: String) throws {
        let order = ["expectedConsentRevision", "contentHash", "policy", "allowed"], o = try object(raw, keys: order)
        _ = try integer(o, "expectedConsentRevision"); try check(matches(try string(o, "contentHash"), "[a-f0-9]{64}"))
        try check(o["policy"] == .string("anthropic-message-review-v1")); _ = try boolean(o, "allowed")
        try canonical(raw, o, order: order)
    }
    private static func attendance(_ raw: String) throws {
        let order = ["expectedMemberId", "requestId", "expectedRevision", "date", "status"], o = try object(raw, keys: order)
        try check(uuid(try string(o, "expectedMemberId")) && uuid(try string(o, "requestId")))
        _ = try integer(o, "expectedRevision"); try day(try string(o, "date"))
        try check(["going", "not_going"].contains(try string(o, "status"))); try canonical(raw, o, order: order)
    }
    private static func savedReading(_ raw: String) throws {
        let o = try parsedObject(raw), action = try string(o, "action")
        var order = ["expectedMemberId", "expectedRevision", "bookId", "action"]
        try check(uuid(try string(o, "expectedMemberId")) && books.contains(try string(o, "bookId")))
        _ = try integer(o, "expectedRevision")
        if action == "save" {
            order += ["editionId", "blockIndex", "completed"]
            try check(matches(try string(o, "editionId"), editionPattern)); _ = try integer(o, "blockIndex", maximum: 99999); _ = try boolean(o, "completed")
        } else { try check(action == "remove") }
        try keys(o, order); try canonical(raw, o, order: order)
    }
    private static func profile(_ raw: String) throws {
        let o = try object(raw, keys: ["expectedMemberId", "expectedRevision", "patch"])
        try check(uuid(try string(o, "expectedMemberId"))); _ = try integer(o, "expectedRevision")
        let order = ["displayName", "bio", "discipline", "skills", "projectDescription", "seeking", "philosophy", "visibility"]
        let patch = try dictionary(o["patch"]); try keys(patch, order)
        for key in order {
            if key == "skills" {
                guard case .array(let values) = patch[key] else { throw SoeMemberRequestPolicyError.rejected }; try check(values.count <= 40)
                for value in values { guard case .string(let value) = value else { throw SoeMemberRequestPolicyError.rejected }; try text(value, minimum: 1, maximum: 100, singleLine: true) }
            } else {
                let value = try string(patch, key)
                if key == "visibility" { try check(value == "private" || value == "public") }
                else { try text(value, minimum: key == "displayName" ? 1 : 0, maximum: key == "displayName" ? 200 : key == "discipline" ? 100 : key == "seeking" ? 1000 : 2000, singleLine: key == "displayName" || key == "discipline") }
            }
        }
        let wire = encode([("expectedMemberId", o["expectedMemberId"]!), ("expectedRevision", o["expectedRevision"]!), ("patch", .object(order.map { ($0, patch[$0]!) }))])
        try check(equalBytes(raw, wire))
    }
    private static func creation(_ raw: String) throws {
        let o = try parsedObject(raw)
        var order = ["expectedMemberId", "requestId", "title", "description", "format", "city", "region", "venueName", "venueType", "weekday", "time", "timezone", "startDate", "maxMembers", "onlineUrl"]
        if o["readingProgram"] != nil { order.append("readingProgram") }; try keys(o, order)
        try check(uuid(try string(o, "expectedMemberId")) && uuid(try string(o, "requestId")))
        func field(_ name: String, _ maximum: Int, nullable: Bool = false) throws -> String? {
            if nullable && o[name] == .null { return nil }; let value = try string(o, name)
            try text(value, minimum: 1, maximum: maximum, singleLine: true); try collapsed(value); return value
        }
        let title = try field("title", 120)!; try check(title.utf16.count >= 4)
        _ = try field("description", 600, nullable: true)
        let format = try field("format", 20)!; try check(["in_person", "online", "hybrid"].contains(format))
        let city = try field("city", 80, nullable: true); _ = try field("region", 40, nullable: true)
        let venue = try field("venueName", 120, nullable: true), venueType = try field("venueType", 30)!
        try check(["library", "cafe", "community_center", "campus", "place_of_worship", "other_public", "online"].contains(venueType))
        try check(format == "online" ? venueType == "online" && venue == nil : venueType != "online" && city != nil && venue != nil)
        _ = try integer(o, "weekday", maximum: 6); _ = try integer(o, "maxMembers", minimum: 3, maximum: 12)
        try check(matches(try field("time", 5)!, "([01][0-9]|2[0-3]):[0-5][0-9]"))
        try check(["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "UTC"].contains(try field("timezone", 40)!))
        try day(try field("startDate", 10)!)
        let online = try field("onlineUrl", 300, nullable: true)
        if format == "in_person" { try check(online == nil) }
        else {
            guard let online else { throw SoeMemberRequestPolicyError.rejected }; try meetingURL(online)
        }
        var fields = order.filter { $0 != "readingProgram" }.map { ($0, o[$0]!) }
        if let value = o["readingProgram"] {
            let p = try dictionary(value); try keys(p, ["version", "bookId", "editionId", "sessions"])
            try check(try integer(p, "version", minimum: 1, maximum: 1) == 1)
            let book = try string(p, "bookId")
            try check((books.contains(book) || book == "philemon") && readingEdition(book, try string(p, "editionId")))
            guard case .array(let sessions) = p["sessions"] else { throw SoeMemberRequestPolicyError.rejected }; try check((1...12).contains(sessions.count))
            var rows: [SoePolicyJSON] = []
            for row in sessions {
                let s = try dictionary(row); try keys(s, ["from", "to"])
                let from = try integer(s, "from", maximum: 99999), to = try integer(s, "to", maximum: 99999); try check(to >= from && (book != "philemon" || to == 0))
                rows.append(.object([("from", .number(String(from))), ("to", .number(String(to)))]))
            }
            fields.append(("readingProgram", .object([("version", .number("1")), ("bookId", p["bookId"]!), ("editionId", p["editionId"]!), ("sessions", .array(rows))])))
        }
        try check(equalBytes(raw, encode(fields)))
    }

    private static func check(_ value: Bool) throws { if !value { throw SoeMemberRequestPolicyError.rejected } }
    /// This field is data, never a transport target. Match the existing HTTPS
    /// data-link boundary without inheriting configured-origin label rules.
    private static func meetingURL(_ value: String) throws {
        guard let c = URLComponents(string: value), let host = c.host else { throw SoeMemberRequestPolicyError.rejected }
        try check(c.scheme == "https" && c.user == nil && c.password == nil && host.contains(".") && host == host.lowercased())
        try check(c.port == nil || (1...65535).contains(c.port!) && c.port != 443)
        let origin = "https://" + host + (c.port.map { ":" + String($0) } ?? "")
        try check(value.hasPrefix(origin + "/") && c.url?.absoluteString == value && !c.percentEncodedPath.isEmpty)
        try check(value.utf8.allSatisfy { $0 >= 33 && $0 <= 126 && $0 != 92 })
        let labels = host.split(separator: ".", omittingEmptySubsequences: true)
        if let last = labels.last, matches(String(last), "[0-9]+|0x[0-9a-f]+") {
            try check(!host.hasSuffix(".") && labels.count == 4 && labels.allSatisfy {
                matches(String($0), "0|[1-9][0-9]{0,2}") && Int($0).map { $0 <= 255 } == true
            })
        }
        for segment in c.percentEncodedPath.split(separator: "/", omittingEmptySubsequences: false) {
            guard let decoded = String(segment).removingPercentEncoding else { throw SoeMemberRequestPolicyError.rejected }
            try check(decoded != "." && decoded != "..")
        }
        if let query = c.percentEncodedQuery { try check(!query.contains("'")) }
    }
    private static func matches(_ value: String, _ pattern: String) -> Bool { captures(value, pattern) != nil }
    private static func captures(_ value: String, _ pattern: String) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: "\\A(?:" + pattern + ")\\z"), let match = regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) else { return nil }
        return (1..<match.numberOfRanges).map { Range(match.range(at: $0), in: value).map { String(value[$0]) } ?? "" }
    }
    private static func uuid(_ value: String, lowercase: Bool = true) -> Bool { matches(lowercase ? value : value.lowercased(), uuidPattern) }
    private static func bearer(_ value: String?) throws { try check(value != nil && value!.utf16.count <= 16384 && matches(value!, "[A-Za-z0-9._~+/-]+=*")) }
    private static func body(_ i: SoeMemberWireInput, maximum: Int) throws -> String {
        guard let body = i.body else { throw SoeMemberRequestPolicyError.rejected }; try check(body.utf8.count <= maximum); return body
    }
    private static func equalBytes(_ a: String, _ b: String) -> Bool { a.utf8.elementsEqual(b.utf8) }
    private static func encode<S: Sequence>(_ fields: S) -> String where S.Element == (String, SoePolicyJSON) { SoePolicyJSON.object(Array(fields)).encoded }
    private static func parsedObject(_ value: String) throws -> [String: SoePolicyJSON] { var parser = SoePolicyJSONReader(value); return try dictionary(parser.parse()) }
    private static func dictionary(_ value: SoePolicyJSON?) throws -> [String: SoePolicyJSON] {
        guard case .object(let pairs) = value else { throw SoeMemberRequestPolicyError.rejected }; return Dictionary(uniqueKeysWithValues: pairs)
    }
    private static func object(_ value: String, keys expected: [String]) throws -> [String: SoePolicyJSON] { let result = try parsedObject(value); try keys(result, expected); return result }
    private static func keys(_ o: [String: SoePolicyJSON], _ expected: [String]) throws { try check(Set(o.keys) == Set(expected)) }
    private static func string(_ o: [String: SoePolicyJSON], _ key: String) throws -> String { guard case .string(let value) = o[key] else { throw SoeMemberRequestPolicyError.rejected }; return value }
    private static func boolean(_ o: [String: SoePolicyJSON], _ key: String) throws -> Bool { guard case .bool(let value) = o[key] else { throw SoeMemberRequestPolicyError.rejected }; return value }
    private static func integer(_ o: [String: SoePolicyJSON], _ key: String, minimum: Int64 = 0, maximum: Int64 = 9007199254740991) throws -> Int64 {
        guard case .number(let value) = o[key], matches(value, "0|[1-9][0-9]*"), let n = Int64(value), n >= minimum && n <= maximum else { throw SoeMemberRequestPolicyError.rejected }; return n
    }
    private static func canonical(_ raw: String, _ o: [String: SoePolicyJSON], order: [String]) throws { try check(equalBytes(raw, encode(order.map { ($0, o[$0]!) }))) }
    private static func authText(_ value: String, maximum: Int) throws { try check(!value.isEmpty && value.utf8.count <= maximum && value.unicodeScalars.allSatisfy { $0.value >= 32 && $0.value != 127 }) }
    private static func trimScalar(_ v: UInt32) -> Bool { (9...13).contains(v) || [0x20, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff].contains(v) || (0x2000...0x200a).contains(v) }
    private static func text(_ value: String, minimum: Int = 0, maximum: Int, singleLine: Bool = false) throws {
        try check((minimum...maximum).contains(value.utf16.count))
        if let first = value.unicodeScalars.first, let last = value.unicodeScalars.last { try check(!trimScalar(first.value) && !trimScalar(last.value)) }
        try check(value.unicodeScalars.allSatisfy { $0.value != 127 && ($0.value >= 32 || !singleLine && [9, 10, 13].contains($0.value)) })
    }
    private static func collapsed(_ value: String) throws {
        var space = false
        for s in value.unicodeScalars { if trimScalar(s.value) { try check(s.value == 32 && !space); space = true } else { space = false } }
    }
    private static func decimal(_ value: String, maximum: Int, allowZero: Bool = false, digits: Int? = nil) throws {
        try check(matches(value, allowZero ? "0|[1-9][0-9]*" : "[1-9][0-9]*"))
        if let digits { try check(value.utf8.count <= digits) }; try check(Int(value).map { $0 <= maximum } == true)
    }
    private static func day(_ value: String) throws {
        guard let parts = captures(value, "([0-9]{4})-([0-9]{2})-([0-9]{2})"), let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]), (1...12).contains(m) else { throw SoeMemberRequestPolicyError.rejected }
        let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0), days = m == 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].contains(m) ? 30 : 31
        try check((1...days).contains(d))
    }
    private static func queryPairs(_ raw: String?) throws -> [(String, String)] {
        guard let raw else { return [] }; var seen = Set<String>(), result: [(String, String)] = []
        for part in raw.split(separator: "&", omittingEmptySubsequences: false) {
            let p = part.split(separator: "=", omittingEmptySubsequences: false); try check(p.count == 2)
            let key = String(p[0]); try check(seen.insert(key).inserted); result.append((key, String(p[1])))
        }
        return result
    }
    private static func formQuery(_ raw: String?) throws -> [(String, String)] {
        try queryPairs(raw).map { key, rawValue in
            guard let value = rawValue.replacingOccurrences(of: "+", with: " ").removingPercentEncoding else { throw SoeMemberRequestPolicyError.rejected }
            var encoded = ""
            for byte in value.utf8 {
                if (65...90).contains(byte) || (97...122).contains(byte) || (48...57).contains(byte) || [45, 95, 46, 42].contains(byte) { encoded.append(Character(UnicodeScalar(byte))) }
                else if byte == 32 { encoded += "+" } else { encoded += String(format: "%%%02X", byte) }
            }
            try check(encoded == rawValue); return (key, value)
        }
    }
}

/// Preserve JSON types and lexemes; Foundation's NSNumber bridges booleans and
/// numbers, and ordinary dictionary parsing loses duplicate-key information.
private indirect enum SoePolicyJSON: Equatable {
    case object([(String, SoePolicyJSON)]), array([SoePolicyJSON]), string(String), number(String), bool(Bool), null
    static func == (a: Self, b: Self) -> Bool {
        switch (a, b) {
        case (.null, .null): return true
        case (.string(let a), .string(let b)), (.number(let a), .number(let b)): return a.utf8.elementsEqual(b.utf8)
        case (.bool(let a), .bool(let b)): return a == b
        case (.array(let a), .array(let b)): return a == b
        case (.object(let a), .object(let b)): return a.count == b.count && zip(a, b).allSatisfy { pair in pair.0.0 == pair.1.0 && pair.0.1 == pair.1.1 }
        default: return false
        }
    }
    var encoded: String {
        switch self {
        case .null: return "null"
        case .bool(let value): return value ? "true" : "false"
        case .number(let value): return value
        case .array(let values): return "[" + values.map(\.encoded).joined(separator: ",") + "]"
        case .object(let values): return "{" + values.map { Self.string($0.0).encoded + ":" + $0.1.encoded }.joined(separator: ",") + "}"
        case .string(let value):
            var out = "\""
            for s in value.unicodeScalars {
                switch s.value {
                case 34: out += "\\\""
                case 92: out += "\\\\"
                case 8: out += "\\b"
                case 9: out += "\\t"
                case 10: out += "\\n"
                case 12: out += "\\f"
                case 13: out += "\\r"
                case 0...31: out += String(format: "\\u%04x", s.value)
                default: out.unicodeScalars.append(s)
                }
            }
            return out + "\""
        }
    }
}
private struct SoePolicyJSONReader {
    private let bytes: [UInt8]
    private var position = 0
    private var nodes = 0
    init(_ value: String) { bytes = Array(value.utf8) }
    mutating func parse() throws -> SoePolicyJSON { let value = try value(depth: 0); whitespace(); guard position == bytes.count else { throw SoeMemberRequestPolicyError.rejected }; return value }
    private mutating func whitespace() { while position < bytes.count && [9, 10, 13, 32].contains(bytes[position]) { position += 1 } }
    private mutating func consume(_ b: UInt8) -> Bool { if position < bytes.count && bytes[position] == b { position += 1; return true }; return false }
    private mutating func string() throws -> String {
        let start = position; guard consume(34) else { throw SoeMemberRequestPolicyError.rejected }
        while position < bytes.count {
            let b = bytes[position]; position += 1
            if b == 34 {
                guard let value = (try? JSONSerialization.jsonObject(with: Data(bytes[start..<position]), options: [.fragmentsAllowed])) as? String else { throw SoeMemberRequestPolicyError.rejected }; return value
            }
            if b == 92 { guard position < bytes.count else { throw SoeMemberRequestPolicyError.rejected }; position += 1 }
            else if b < 32 { throw SoeMemberRequestPolicyError.rejected }
        }
        throw SoeMemberRequestPolicyError.rejected
    }
    private mutating func value(depth: Int) throws -> SoePolicyJSON {
        whitespace(); nodes += 1
        guard depth <= 32 && nodes <= 2048 && position < bytes.count else { throw SoeMemberRequestPolicyError.rejected }
        if bytes[position] == 34 { return .string(try string()) }
        if consume(123) {
            whitespace(); var pairs: [(String, SoePolicyJSON)] = [], names = Set<String>(); if consume(125) { return .object(pairs) }
            repeat {
                whitespace(); let key = try string(); guard names.insert(key).inserted else { throw SoeMemberRequestPolicyError.rejected }
                whitespace(); guard consume(58) else { throw SoeMemberRequestPolicyError.rejected }; pairs.append((key, try value(depth: depth + 1))); whitespace()
                if consume(125) { return .object(pairs) }
            } while consume(44)
            throw SoeMemberRequestPolicyError.rejected
        }
        if consume(91) {
            whitespace(); var values: [SoePolicyJSON] = []; if consume(93) { return .array(values) }
            repeat { values.append(try value(depth: depth + 1)); whitespace(); if consume(93) { return .array(values) } } while consume(44)
            throw SoeMemberRequestPolicyError.rejected
        }
        for (word, result) in [("true", SoePolicyJSON.bool(true)), ("false", .bool(false)), ("null", .null)] {
            let token = Array(word.utf8); if bytes[position...].starts(with: token) { position += token.count; return result }
        }
        let start = position
        while position < bytes.count && ![9, 10, 13, 32, 44, 93, 125].contains(bytes[position]) { position += 1 }
        let raw = String(decoding: bytes[start..<position], as: UTF8.self)
        guard raw.range(of: "\\A-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\\z", options: .regularExpression) != nil else { throw SoeMemberRequestPolicyError.rejected }
        return .number(raw)
    }
}
