import Foundation

@main
struct ScriptureEditionPolicyCheck {
    static func main() throws {
        let origin = "https://salons.fixture.test"
        let book = "luke-good-samaritan"
        let pin = "web-classic-08e329a5fdbf1c3516a4b59ca8add43b81c05b74e3807bb1c9211c269ba7507f"
        let policy = try SoeMemberRequestPolicy(memberOrigin: origin, providerOrigin: nil, publishableKey: nil)
        let metadata = origin + "/api/great-books/text/" + book
        let discovery = origin + "/api/circles?book=" + book + "&edition=" + pin + "&from=0&to=0"
        let bearer = "NONISSUED_SCRIPTURE_FIXTURE"
        let body = #"{"expectedMemberId":"77000000-0000-4000-8000-000000000301","requestId":"77000000-0000-4000-8000-000000000302","title":"Good Samaritan salon","description":null,"format":"online","city":null,"region":null,"venueName":null,"venueType":"online","weekday":4,"time":"19:00","timezone":"UTC","startDate":"2030-02-14","maxMembers":8,"onlineUrl":"https://meeting.fixture.test/good-samaritan","readingProgram":{"version":1,"bookId":"\#(book)","editionId":"\#(pin)","sessions":[{"from":0,"to":0}]}}"#
        func publicGet(_ url: String) -> SoeMemberWireInput {
            SoeMemberWireInput(url: url, method: "GET", bearer: nil, body: nil)
        }
        func create(_ wire: String) -> SoeMemberWireInput {
            SoeMemberWireInput(url: origin + "/api/circles", method: "POST", bearer: bearer, body: wire)
        }
        for url in [metadata, discovery] {
            let request = try policy.request(for: .publicRead, input: publicGet(url))
            precondition(request.url?.absoluteString == url && request.httpMethod == "GET" && !request.httpShouldHandleCookies)
            for header in ["Authorization", "Cookie", "apikey"] { precondition(request.value(forHTTPHeaderField: header) == nil) }
        }
        let accepted = try policy.request(for: .member, input: create(body))
        precondition(accepted.httpMethod == "POST" && accepted.httpBody == Data(body.utf8))
        precondition(accepted.value(forHTTPHeaderField: "Authorization") == "Bearer " + bearer)
        let altered = String(pin.dropLast()) + "0"
        let invalid: [(SoeMemberLane, SoeMemberWireInput)] = [
            (.publicRead, publicGet(metadata + "?version=1")),
            (.publicRead, publicGet(discovery.replacingOccurrences(of: pin, with: altered))),
            (.publicRead, publicGet(discovery.replacingOccurrences(of: "to=0", with: "to=1"))),
            (.member, create(body.replacingOccurrences(of: pin, with: altered))),
            (.member, create(body.replacingOccurrences(of: #""to":0"#, with: #""to":1"#))),
        ]
        for (lane, input) in invalid {
            do {
                _ = try policy.request(for: lane, input: input)
                preconditionFailure("Accepted a modified Scripture request")
            } catch SoeMemberRequestPolicyError.rejected {}
        }
        print("Swift Scripture edition policy passed two anonymous reads, one signed create, and \(invalid.count) refusals.")
    }
}
