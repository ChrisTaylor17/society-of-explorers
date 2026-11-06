# iOS member bridge and Expo host

The registered app selects its member adapter from the installed operating system. Both adapters use the same `NativeSoeMember` JavaScript contract. Unsupported platforms, missing modules and invalid or incomplete capabilities leave the member account closed. The iOS registration adds no credential or origin input from React.

The iOS app owns one Swift account authority. Its current React attachment can be replaced without reopening the vault or replacing the native recovery callback lifetime. Swift captures the applicable lifetime before queueing work. It rechecks it before delivering private results and binds reset replies to the exact successor. Inactive or locked state reports unknown connectivity; expired, cancelled or retired transfers cannot release a queued reply. The earlier [account core](ios-member-core.md) provides the protected vault, route policy and email proof.

The Expo SDK 58 plugin patches the scene based host and registers a dedicated email scheme only when the installed provider is configured. The app and scene delegates consume reserved links before Expo or React Linking can see them, including cold launch and activity updates. Other links continue through Expo. The local module declares both iOS pods. The plugin packages the exact public reader catalog inside its resource bundle; the reader can be configured independently. The source configuration uses a synthetic bundle identifier. Distribution identity and credentials are unset.

[Verification receipt](ios-member-bridge-verification.json) binds the Mac suites, Swift compatibility header audit, JavaScript checks, and host configuration and syntax checks. The Swift run uses fake protected storage and provider replies with OS network denial. It does exercise an actual cancelled Foundation task. The source audit checks the 19-method React Native contract against the Objective-C++ adapter and the actual Mac-generated Swift header. The host fixture invokes the configuration transforms and verifies byte-for-byte reader packaging. The iOS delegate was parsed for the iOS target without SDK type checking.

The host plugin now puts the Expo factory conformance on Swift’s main actor and upgrades the earlier generated declaration when it encounters it. The pinned Expo scene still forwards activation and background events into the app delegate. The Mac Catalyst check emitted the account module against UIKit and type-checked the patched Expo 58.0.12 template in Swift 5 and Swift 6, using declaration fixtures for React Native and the remaining Expo dependencies. The template configuration check packaged the reader catalog and four reviewed videos. The refreshed audit matches the lockfile, the Mac-generated Swift header and both iOS view registrations. [Current iOS preflight](ios-host-release-verification.json) · [Expo scene forwarding](https://github.com/expo/expo/blob/1fe7733a076cc7448f2728a764436307fe440cfa/packages/expo/ios/Expo/SceneEventForwarder.swift) · [Swift isolated conformances](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0470-isolated-conformances.md)

Run the full Mac suite from a resident verification checkout. The runner refuses offloaded source and compiles with network access disabled.

```sh
mkdir -p verification/web/evidence
python3 -B verification/native-ios/run-swift-tests.py --run member-release-local --objc-header \
  --suite runSoeMemberFenceTests --suite runSoeMemberVaultTests \
  --suite runSoeMemberRequestPolicyTests --suite runSoeMemberEmailFlowTests \
  --async-suite runSoeMemberAuthorityTests --async-suite runSoeMemberBridgeTests \
  --async-suite runSoeMemberIOSHostTests \
  platforms/native/ios-member/*.swift verification/native-ios/*Tests.swift
```

Next, generate the iOS project with the pinned Expo version in an isolated checkout and verify pod discovery, RN Codegen and a simulator build. A real phone must prove Keychain behavior, installed links in each lifecycle state, transfer cancellation, accessibility and actual sign-in/recovery before release. The checked Mac paths lack Xcode and both iOS SDK platforms, and the named cached Expo and Codegen entry points are offloaded. The standard Android SDK path lacks the declared platform 37 and build tools. See the [native acquisition plan](native-toolchain-unblock.md) for the separate build prerequisites and test identities.
