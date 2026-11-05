#if os(iOS)
import Expo
import Network
import React
import UIKit

@available(iOSApplicationExtension, unavailable)
open class SoeMemberAppDelegate: ExpoAppDelegate {
    private var memberHost: SoeMemberIOSHost?
    private var pathMonitor: NWPathMonitor?

    open override func application(
        _ application: UIApplication,
        willFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        super.application(application, willFinishLaunchingWithOptions: publicOptions(launchOptions, capture: false))
    }

    open override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        let host = SoeMemberIOSHost.install(bundle: .main,
            sceneDelegate: NSStringFromClass(SoeMemberSceneDelegate.self),
            protectedDataAvailable: application.isProtectedDataAvailable)
        memberHost = host
        if let host, pathMonitor == nil {
            let monitor = NWPathMonitor()
            monitor.pathUpdateHandler = { [weak host] path in
                let connectivity: SoeMemberConnectivity
                switch path.status {
                case .satisfied: connectivity = .online
                case .unsatisfied, .requiresConnection: connectivity = .offline
                @unknown default: connectivity = .unknown
                }
                MainActor.assumeIsolated { host?.update(connectivity: connectivity) }
            }
            pathMonitor = monitor
            monitor.start(queue: .main)
        }
        return super.application(application, didFinishLaunchingWithOptions: publicOptions(launchOptions, capture: true))
    }

    open override func application(
        _ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any]
    ) -> Bool {
        if SoeMemberIOSHost.consumeEmailLink(url) { return true }
        return super.application(app, open: url, options: options)
    }

    open override func application(
        _ application: UIApplication, continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        if let url = userActivity.webpageURL, SoeMemberIOSHost.consumeEmailLink(url) { return true }
        return super.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    open override func application(_ application: UIApplication, didUpdate userActivity: NSUserActivity) {
        if let url = userActivity.webpageURL, SoeMemberIOSHost.consumeEmailLink(url, capture: false) { return }
        super.application(application, didUpdate: userActivity)
    }

    open override func applicationDidBecomeActive(_ application: UIApplication) {
        memberHost?.update(appActive: true)
        super.applicationDidBecomeActive(application)
    }

    open override func applicationWillResignActive(_ application: UIApplication) {
        memberHost?.update(appActive: false)
        super.applicationWillResignActive(application)
    }

    open override func applicationDidEnterBackground(_ application: UIApplication) {
        memberHost?.update(appActive: false)
        super.applicationDidEnterBackground(application)
    }

    @objc public func applicationProtectedDataWillBecomeUnavailable(_ application: UIApplication) {
        memberHost?.update(protectedDataAvailable: false)
    }

    @objc public func applicationProtectedDataDidBecomeAvailable(_ application: UIApplication) {
        memberHost?.update(protectedDataAvailable: application.isProtectedDataAvailable)
    }

    open override func applicationWillTerminate(_ application: UIApplication) {
        memberHost?.close()
        pathMonitor?.cancel()
        super.applicationWillTerminate(application)
    }

    fileprivate func memberSceneDidDisconnect() {
        memberHost?.update(appActive: false)
    }

    private func publicOptions(_ launchOptions: [UIApplication.LaunchOptionsKey: Any]?,
                               capture: Bool) -> [UIApplication.LaunchOptionsKey: Any]? {
        guard var options = launchOptions else { return nil }
        if let url = options[Self.urlKey] as? URL, SoeMemberIOSHost.consumeEmailLink(url, capture: capture) {
            options.removeValue(forKey: Self.urlKey)
        }
        if let activity = options[Self.activityKey] as? [String: Any],
           let url = (activity[Self.userActivityKey] as? NSUserActivity)?.webpageURL,
           SoeMemberIOSHost.consumeEmailLink(url, capture: capture) {
            options.removeValue(forKey: Self.activityKey)
        }
        return options.isEmpty ? nil : options
    }

    fileprivate static let urlKey = UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsURLKey")
    fileprivate static let activityKey = UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsUserActivityDictionaryKey")
    fileprivate static let userActivityKey = "UIApplicationLaunchOptionsUserActivityKey"
}

@available(iOSApplicationExtension, unavailable)
@objc(SoeMemberSceneDelegate)
public final class SoeMemberSceneDelegate: ExpoAppSceneDelegate {
    public override func scene(
        _ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let publicURLs = connectionOptions.urlContexts.filter { !SoeMemberIOSHost.consumeEmailLink($0.url) }
        let publicActivities = connectionOptions.userActivities.filter { activity in
            guard let url = activity.webpageURL else { return true }
            return !SoeMemberIOSHost.consumeEmailLink(url)
        }
        if publicURLs.count == connectionOptions.urlContexts.count,
           publicActivities.count == connectionOptions.userActivities.count {
            super.scene(scene, willConnectTo: session, options: connectionOptions)
            return
        }

        // UIKit's connection options are read-only. Start the Expo factory with
        // only the public inputs before anything can reach React's Linking.
        guard let provider = UIApplication.shared.delegate as? ExpoReactNativeFactoryProvider,
              let factory = provider.reactNativeFactory else { return }
        let window = UIWindow(windowScene: windowScene)
        self.window = window
        provider.window = window
        var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
        if let url = publicURLs.first?.url { launchOptions[SoeMemberAppDelegate.urlKey] = url }
        if let activity = publicActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb }) {
            launchOptions[SoeMemberAppDelegate.activityKey] = [
                "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
                SoeMemberAppDelegate.userActivityKey: activity,
            ]
        }
        factory.startReactNative(withModuleName: provider.reactNativeFactoryModuleName, in: window,
                                 initialProperties: initialProperties,
                                 launchOptions: launchOptions.isEmpty ? nil : launchOptions)
        if !publicURLs.isEmpty { super.scene(scene, openURLContexts: publicURLs) }
        publicActivities.forEach { super.scene(scene, continue: $0) }
        if let shortcut = connectionOptions.shortcutItem {
            super.windowScene(windowScene, performActionFor: shortcut) { _ in }
        }
    }

    public override func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        let publicURLs = URLContexts.filter { !SoeMemberIOSHost.consumeEmailLink($0.url) }
        if !publicURLs.isEmpty { super.scene(scene, openURLContexts: publicURLs) }
    }

    public override func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if let url = userActivity.webpageURL, SoeMemberIOSHost.consumeEmailLink(url) { return }
        super.scene(scene, continue: userActivity)
    }

    public override func scene(_ scene: UIScene, didUpdate userActivity: NSUserActivity) {
        if let url = userActivity.webpageURL, SoeMemberIOSHost.consumeEmailLink(url, capture: false) { return }
        super.scene(scene, didUpdate: userActivity)
    }

    public override func sceneDidDisconnect(_ scene: UIScene) {
        (UIApplication.shared.delegate as? SoeMemberAppDelegate)?.memberSceneDidDisconnect()
        super.sceneDidDisconnect(scene)
    }
}
#endif
