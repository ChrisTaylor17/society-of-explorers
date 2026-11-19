import Foundation

enum SoeMemberCoreError: Error, Equatable {
    case unavailable
}

struct SoeMemberWireInput: Sendable {
    let url: String
    let method: String
    let bearer: String?
    let body: String?
}

struct SoeMemberWireResponse: Sendable {
    static let maximumBytes = 1_048_576

    let status: Int
    let url: String
    let body: String
    let redirected: Bool

    func check(expectedURL: String) throws {
        guard !redirected, url.utf8.elementsEqual(expectedURL.utf8),
              (200...599).contains(status), !(300..<400).contains(status),
              body.utf8.count <= Self.maximumBytes else {
            throw SoeMemberCoreError.unavailable
        }
    }
}
