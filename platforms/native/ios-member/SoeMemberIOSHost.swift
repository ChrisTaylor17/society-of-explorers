import Foundation

enum SoeMemberInstalledPolicy {
    static let callbackType = "org.soe.member.email"

    static func callbackScheme(applicationID: String) -> String {
        applicationID.lowercased() + ".email"
    }

    static func ownsEmailLink(_ url: URL, applicationID: String) -> Bool {
        url.scheme?.lowercased() == callbackScheme(applicationID: applicationID)
    }

    static func configuration(applicationID: String, info: [String: Any],
                              sceneDelegate: String) throws -> SoeMemberConfiguration? {
        let keys = ["SoeMemberOrigin", "SoeMemberStorageKey", "SoeProviderOrigin", "SoePublishableKey"]
        let settings = try keys.map { key in
            guard let value = info[key] else { return "" }
            guard let text = value as? String else { throw SoeMemberCoreError.unavailable }
            return text
        }
        guard settings.contains(where: { !$0.isEmpty }) else { return nil }
        guard let configuration = try? SoeMemberConfiguration(
            applicationID: applicationID, memberOrigin: settings[0], storageKey: settings[1],
            providerOrigin: settings[2].isEmpty ? nil : settings[2],
            publishableKey: settings[3].isEmpty ? nil : settings[3]
        ) else { throw SoeMemberCoreError.unavailable }

        guard let manifest = info["UIApplicationSceneManifest"] as? [String: Any],
              manifest["UIApplicationSupportsMultipleScenes"] as? Bool == false,
              let configurations = manifest["UISceneConfigurations"] as? [String: Any],
              configurations.count == 1,
              let scenes = configurations["UIWindowSceneSessionRoleApplication"] as? [[String: Any]],
              scenes.count == 1,
              scenes[0]["UISceneDelegateClassName"] as? String == sceneDelegate else {
            throw SoeMemberCoreError.unavailable
        }

        if configuration.providerOrigin != nil {
            let scheme = callbackScheme(applicationID: applicationID)
            let types = info["CFBundleURLTypes"] as? [[String: Any]] ?? []
            let matching = types.filter {
                ($0["CFBundleURLSchemes"] as? [String])?.contains { $0.lowercased() == scheme } == true
            }
            guard matching.count == 1,
                  matching[0]["CFBundleURLName"] as? String == callbackType,
                  matching[0]["CFBundleURLSchemes"] as? [String] == [scheme] else {
                throw SoeMemberCoreError.unavailable
            }
        }
        return configuration
    }
}

/// One app-owned authority survives React instance replacement. Native links
/// can arrive before any module attaches or while the interface is inactive.
@MainActor
@objc(SoeMemberIOSHost)
public final class SoeMemberIOSHost: NSObject {
    private static var installed: SoeMemberIOSHost?
    private let configuration: SoeMemberConfiguration
    private let authority: SoeMemberAuthority
    private var bridge: SoeMemberBridge?
    private var closed = false

    init(configuration: SoeMemberConfiguration, authority: SoeMemberAuthority) {
        self.configuration = configuration
        self.authority = authority
        super.init()
    }

    static func install(bundle: Bundle, sceneDelegate: String,
                        protectedDataAvailable: Bool) -> SoeMemberIOSHost? {
        if let installed { return installed }
        guard let applicationID = bundle.bundleIdentifier,
              let configuration = try? SoeMemberInstalledPolicy.configuration(
                applicationID: applicationID, info: bundle.infoDictionary ?? [:], sceneDelegate: sceneDelegate
              ),
              let authority = try? SoeMemberAuthority(configuration: configuration) else {
            return nil
        }
        let host = SoeMemberIOSHost(configuration: configuration, authority: authority)
        host.update(protectedDataAvailable: protectedDataAvailable)
        installed = host
        return host
    }

    @objc(attachBridge)
    public nonisolated static func attachBridge() -> SoeMemberBridge? {
        guard Thread.isMainThread else { return nil }
        return MainActor.assumeIsolated { installed?.attach() }
    }

    @objc(detachBridge:)
    public nonisolated static func detachBridge(_ candidate: SoeMemberBridge) {
        candidate.invalidate()
    }

    func attach() -> SoeMemberBridge? {
        guard !closed, bridge?.isInvalidated != false else { return nil }
        let next = SoeMemberBridge(configuration: configuration, authority: authority)
        bridge = next
        return next
    }

    func update(appActive: Bool? = nil, protectedDataAvailable: Bool? = nil,
                connectivity: SoeMemberConnectivity? = nil) {
        let before = authority.fence.interactiveConnectivitySnapshot()
        authority.fence.update(appActive: appActive, protectedDataAvailable: protectedDataAvailable,
                               connectivity: connectivity)
        if before != authority.fence.interactiveConnectivitySnapshot() {
            bridge?.hostConnectivityDidChange()
        }
    }

    @discardableResult
    static func consumeEmailLink(_ url: URL, capture: Bool = true) -> Bool {
        guard let applicationID = Bundle.main.bundleIdentifier,
              SoeMemberInstalledPolicy.ownsEmailLink(url, applicationID: applicationID) else {
            return false
        }
        if capture { installed?.captureEmailLink(url) }
        return true
    }

    func captureEmailLink(_ url: URL) {
        guard configuration.providerOrigin != nil,
              let stamp = try? authority.fence.stamp(for: .callback) else { return }
        let raw = url.absoluteString
        let authority = authority
        Task { try? await authority.captureEmailLink(raw, stamp: stamp) }
    }

    func close() {
        guard !closed else { return }
        closed = true
        authority.fence.close()
        bridge?.invalidate()
        bridge = nil
        let authority = authority
        Task { await authority.close() }
    }
}
