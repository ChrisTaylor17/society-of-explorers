import Foundation

@main
struct MemberBlockRequestChecks {
    static func main() throws {
        let origin = "https://member-blocks.fixture.test"
        let url = origin + "/api/members/blocks"
        let member = "ab000000-0000-4000-8000-000000000001"
        let block = "ab000000-0000-4000-8000-000000000002"
        let request = "ab000000-0000-4000-8000-000000000003"
        let payload = #"{"expectedMemberId":"\#(member)","blockId":"\#(block)","expectedRevision":1,"requestId":"\#(request)"}"#
        let bearer = "NONISSUED_MEMBER_BLOCKS_FIXTURE"
        let policy = try SoeMemberRequestPolicy(memberOrigin: origin, providerOrigin: nil, publishableKey: nil)
        func input(_ address: String, _ method: String = "GET", _ body: String? = nil, _ key: String? = bearer) -> SoeMemberWireInput {
            SoeMemberWireInput(url: address, method: method, bearer: key, body: body)
        }

        let valid = [input(url), input(url + "?after=" + block), input(url, "POST", payload)]
        for value in valid {
            let constructed = try policy.request(for: .member, input: value)
            precondition(constructed.url?.absoluteString == value.url)
            precondition(constructed.httpMethod == value.method)
            precondition(constructed.value(forHTTPHeaderField: "Authorization") == "Bearer " + bearer)
            precondition(constructed.value(forHTTPHeaderField: "Cookie") == nil)
            precondition(constructed.httpBody == value.body?.data(using: .utf8))
        }

        let invalid: [(SoeMemberLane, SoeMemberWireInput)] = [
            (.member, input(url + "?")),
            (.member, input(url + "?after=" + block.uppercased())),
            (.member, input(url + "?after=" + block + "&after=" + request)),
            (.member, input(url + "?peerId=" + member)),
            (.member, input("https://sibling.fixture.test/api/members/blocks")),
            (.member, input(url, "GET", payload)),
            (.member, input(url, "GET", nil, nil)),
            (.member, input(url + "?after=" + block, "POST", payload)),
            (.member, input(url, "PUT", payload)),
            (.member, input(url, "POST", payload + " ")),
            (.member, input(url, "POST", payload.replacingOccurrences(of: #""expectedRevision":1"#, with: #""expectedRevision":0"#))),
            (.member, input(url, "POST", payload.replacingOccurrences(of: #""expectedRevision":1"#, with: #""expectedRevision":9007199254740991"#))),
            (.member, input(url, "POST", payload.replacingOccurrences(of: #""expectedRevision":1"#, with: #""expectedRevision":1,"blocked":false"#))),
            (.member, input(url, "POST", payload.replacingOccurrences(of: block, with: block.uppercased()))),
            (.publicRead, input(url, "GET", nil, nil)),
            (.messageReview, input(url)),
            (.circleReview, input(url)),
        ]
        for (lane, value) in invalid {
            do {
                _ = try policy.request(for: lane, input: value)
                preconditionFailure("An invalid blocked-members operation was accepted")
            } catch SoeMemberRequestPolicyError.rejected {}
        }
        print("Swift blocked-members policy passed \(valid.count) allowed and \(invalid.count) refused requests.")
    }
}
