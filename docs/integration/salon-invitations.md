# Share a salon invitation

On a public Circle page, choose **Share salon invitation**. The browser can share or copy the website address. If both actions are unavailable, a selectable address appears. The invitation carries only the salon ID. A browser follows it to the existing Circle page and uses that Circle as the sign-in destination. A hidden or unavailable Circle has no public preview or share control.

On an associated phone, a cold invitation opens a public preview screen. A warm invitation offers **Open shared salon invitation** on the account or member menu. The current screen stays open until the person chooses the invitation. **Check this salon invitation** reads just that public listing without account credentials. Choosing the result carries its ID through sign-in and current account verification. **Open selected Circle** checks current access. Membership changes after the person reviews and confirms the join.

The signed app accepts the exact configured HTTPS origin and a lowercase UUID in `/circles/invite/`. The Android host can canonicalize the same HTTP path to HTTPS. The public phone transport accepts only an anonymous `GET` for that Circle's `?view=listing` request. A preview held while the app loses focus is discarded. Returning to the app waits for an explicit check.

## Release acceptance

Use the [existing public link settings](native-reel-links.md#release-configuration) for the same app identities and domain. The association documents and release manifest cover the invitation namespace and the three Reel paths. On an approved website and signed builds, verify a cold launch, a warm tap and the browser fallback without an installation. Also check one hidden invitation, the private meeting boundary, a Reel link and the separate email callback. [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains) · [Android App Links](https://developer.android.com/training/app-links/add-applinks)

The local evidence covers the compiled website in Chromium, a browser with a Quest user agent, both phone app simulations through the current HTTP and Circle SQL, and an executable Swift link and request check on Mac. Signed iOS and Android builds, OS delivery and a physical Quest remain pending. [Verification](salon-invitation-verification.json)
