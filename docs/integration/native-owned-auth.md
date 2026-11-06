# Native application-owned account entry

The registered iOS and Android app paths share the account screen for email and password sign-in, protected session restoration and sign-out. Members can set up their account and find their own contributions from that screen. Native builds, installed-device behavior and live provider acceptance remain release gates.

## Account behavior

`App` opens `OwnedAccountScreen`. The user first connects the account service, then chooses password sign-in or restoration. Public configuration is read from the installed native module. No provider credentials, launch-link tokens, environment secrets or default Circle are selected. Missing native configuration or unsupported platforms fail closed.

Sign-in and restore use the pinned `@supabase/auth-js` 2.99.3 behind the protected provider connection. The controller owns serialization, deadlines and protected persistence. Each operation has its own request permission. Member credential acquisition uses a fresh `getUser` call with the exact access token.

Passwords and email input are cleared on submission, background/blur, offline/unknown connectivity and closure. Provider errors, tokens and passwords are excluded from public models. Returning to the foreground or reconnecting does not restore private authority or replay a request. A deliberate restore is required.

After verified sign-in, the existing member gate checks the canonical member API. Missing member setup remains an explicit, acknowledged operation followed by a fresh matching readback. It grants no Circle membership and publishes no profile. Contribution history retains its separate fresh-author checks and explicit withdrawal.

**Sign out of this device** appears for a verified phone session with a valid session ID. The app immediately closes private access and sends one current-session request. It reports provider acceptance and protected storage clearing separately when either outcome is uncertain. The app still attempts to clear saved sign-in after a connection failure. **Clear sign-in from this device** only clears the local copy and also works offline. Closing the account screen can leave the saved sign-in available for explicit restore.

The controller and its JavaScript transport require a valid session ID for online sign-out. The controller also matches the token subject to the account verified with that token. Supabase can fall back to ending all sessions when the token lacks a session ID. A matching HTTP 204 confirms provider acceptance. Supabase documents that an already issued access token can remain valid until its expiry. [Supabase sign-out scopes](https://supabase.com/docs/guides/auth/signout) · [Provider logout handler](https://github.com/supabase/auth/blob/master/internal/api/logout.go)

## Native boundary

The existing application API allowlist remains separate from provider authentication. Optional trusted build policy supplies an exact HTTPS provider origin and a publishable public key. Secret/service-role keys and legacy JWT keys are refused. The native namespace includes provider policy, and the current durable generation binds storage and allocated requests.

The auth channel accepts password and refresh exchanges, exact user lookup and local-scope logout. The current token and native storage generation bind the sign-out request and the reset. Backgrounding, connection loss or a changed generation retires an in-flight provider request. On iOS, an inactive or locked phone can also prevent protected storage clearing. The screen reports that outcome as unconfirmed so the member can reopen the account and clear it.

## Verification boundary

The browser checks exercise the shared registered App screen with simulated Android and iOS lifecycle events, provider responses and native storage. The focused checks cover a wrong or missing acknowledgement, a stale session, and a reset whose receipt was lost. Physical acceptance requires two independent test sign-ins, a check that the other sign-in remains usable, and a repeat with the phone offline or locked. [Sign-out verification](native-device-sign-out-verification.json)

The preceding contribution milestone's 39 evidence files were archived byte-for-byte under `verification/web/evidence/checkpoint-6723453/` before new checks. Its historical receipt identifies checkpoint `6723453d0cd1304de277906c7c00b82d5b9c5d01`; historical hashes do not verify this changed source.

## Remaining account parity and acceptance

This historical milestone exposed no PKCE operation. The later [native email account milestone](native-email-auth.md) adds signup, confirmation/resend and password recovery using native secure randomness/SHA-256 and an independently scoped callback. It avoids the SDK's insecure-crypto fallback. Native discovery, profile and reading composition also have later local proofs. Google/system-browser sign-in, real provider and installed-device acceptance remain open; historical counts here do not verify those later changes.

The pending toolchain request covers Android dependencies, Codegen, build and device testing. The [iOS bridge and host](ios-member-bridge.md) still need a generated project, an iOS build, signing and device acceptance. Provider configuration, live sign-in and revocation, protected storage during interruption, TLS, accessibility and signing remain release gates.

Official references checked for this work: [React Native auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react-native), [native deep links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), and [Supabase changelog](https://supabase.com/changelog). The announced [November 10 CBC cipher removal](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) belongs in real native TLS acceptance; no provider setting was changed here.
