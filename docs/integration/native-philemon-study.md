# Philemon in the phone app

**Read Philemon** opens from the registered phone app before account connection and from the verified member screen. The study bundles all 25 verses and both publisher footnotes. The reading, comparison notes and 45-minute guide use the same material as the web study. Exact source addresses are selectable in the phone view. The signed-out study runs offline and opens without a credential form. [Source and rights](root-kernel-philemon.md) · [Web salon guide](philemon-remote-salon.md)

**Find an online reading Circle** opens public online and hybrid listings for guests and presets Online for verified members. A guest's selection carries into sign-in and the member-account check. [Online Circle verification](native-online-circles-verification.json)

**Prepare a weekly online Circle** from the signed-out guide carries the Online choice into the existing sign-in flow in the current app session. The member still chooses to connect, signs in, checks the member account and requests hosting access. A verified member can reach the same draft directly from the guide. The preset leaves the name, schedule and private meeting link for the host to enter. Clearing the choice preserves the standard in-person entry.

The form uses the existing eligibility, review, confirmation and receipt checks. The failed-owner test cleared the private meeting link and restored a blank online draft on a fresh check. The fixture verified the member and hosting eligibility before creating one Circle. The authenticated host could read its meeting link and the public listing omitted it.

## Verification

The registered App ran in Chromium with explicit React Native, device and identity doubles, the cached AuthClient, the canonical route handlers and disposable PostgreSQL. The Android-path run passed 21 stories, including the prior hosting and recovery cases. The iOS-path run passed four focused stories. Both exercised the exact bundled verses, footnotes, two sourced readings, online choice, host confirmation, account rejection and cleanup. The web production build passed TypeScript and all seven existing study and host-guide browser checks. [Verification receipt](native-philemon-study-verification.json)

The Android embedded-bundle smoke test now opens the study, comparison and guide before connecting an account. It checks that the public reading screen keeps credential inputs closed. The Android instrumentation remains unrun. Native packaging, simulator and device acceptance for iOS and Android remain open. [Android device test](android-member-entry-smoke.md) · [Toolchain status](native-toolchain-unblock.md)
