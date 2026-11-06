# Shared Reel links on phones

People share the existing HTTPS Reel address. On an associated phone, a cold launch opens that public Reel and its transcript. The native host supplies the public website from its signed configuration. The Reel opens from packaged resources before any account access. While the app is open, the shared Reel waits for an explicit Open or Dismiss on the account screen. The chosen Reel leads into the existing online Circle flow. It requires the same sign-in, current membership and post review as a Reel opened from Clips. The address contains only the reviewed Reel ID. The public page serves the same clip in a browser, including Quest Browser. [Verification](native-reel-links-verification.json)

## Release configuration

Use the exact HTTPS origin already configured for the installed member app and its public Reel links. The same hostname must serve both association files without a redirect or sign-in. Use the approved release website and app identities for this step. [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains) · [Android website associations](https://developer.android.com/training/app-links/configure-assetlinks)

- On iOS, set `SoeReelLinksEnabled` to the boolean `true` in the release `ios.infoPlist`. Include the exact `applinks:<host>` in `ios.associatedDomains`. The Expo plugin checks it against `SoeMemberOrigin`. Verify the associated-domains entitlement on the signed app.
- On Android, use the approved release build with `-PsoeEnableReelLinks=true` and the same `soeMemberOrigin`. The release manifest lists the three supported Reel paths. Debug and synthetic builds have no Reel App Link filter.
- On the website, set `SOE_REEL_LINK_ORIGIN` to that origin. Set `SOE_REEL_IOS_APP_ID` to the exact signed application identifier, including its Apple prefix. For Android, set `SOE_REEL_ANDROID_PACKAGE` to the signed app ID and `SOE_REEL_ANDROID_CERT_SHA256` to the uppercase, colon-delimited SHA-256 fingerprint of the distribution signing certificate. Use the Play signing certificate for a Play-signed app. These are public identifiers.

The two website routes are `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`. Each returns 404 until its required settings match the requested origin. Keep each platform’s bundled Reel list, Android manifest and website association paths in step when adding another linked Reel.

## Device acceptance

After the domain and signing identities are approved, check that an uninstalled phone opens the web page and an associated signed installation opens each of the three public Reels. Check a terminated app and an app already showing a member view. Verify the transcript, explicit playback, the online Circle handoff and the separate recovery email callback. The current evidence includes simulated phone journeys, executable Swift link checks, an iOS Catalyst compiler check and the local web build. Signed builds, OS association and physical phones still need acceptance. [React Native link delivery](https://reactnative.dev/docs/linking)
