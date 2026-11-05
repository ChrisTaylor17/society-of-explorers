import CryptoKit
import Foundation

/// Inputs come from the installed application, before a bridge accepts JS calls.
struct SoeMemberConfiguration: Sendable {
    let memberOrigin: String
    let storageKey: String
    let providerOrigin: String?
    let publishableKey: String?
    let emailCallbackURL: String
    let namespace: String
    let requestPolicy: SoeMemberRequestPolicy

    init(applicationID: String, memberOrigin: String, storageKey: String,
         providerOrigin: String?, publishableKey: String?) throws {
        guard applicationID.utf8.count <= 255,
              applicationID.range(of: #"\A[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+\z"#, options: .regularExpression) != nil,
              storageKey.range(of: #"\A[A-Za-z0-9._-]{1,160}\z"#, options: .regularExpression) != nil else {
            throw SoeMemberCoreError.unavailable
        }
        let policy = try SoeMemberRequestPolicy(memberOrigin: memberOrigin, providerOrigin: providerOrigin,
                                                publishableKey: publishableKey)
        self.memberOrigin = memberOrigin
        self.storageKey = storageKey
        self.providerOrigin = providerOrigin
        self.publishableKey = publishableKey
        self.emailCallbackURL = applicationID.lowercased() + ".email://auth/callback"
        self.requestPolicy = policy
        let scope = [applicationID, memberOrigin, storageKey, providerOrigin ?? "", publishableKey ?? ""].joined(separator: "|")
        let digest = SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
        self.namespace = "org.soe.member.ios.v2." + digest
    }
}
