# Native application-owned account entry

The registered Android app now has a source implementation of existing-account email/password sign-in and explicit restoration of a protected saved session. Account setup and own-contribution history no longer need a Circle ID. Existing trusted Circle composition is preserved. **Native compilation, installed-device behavior and real provider acceptance remain unverified; release remains HOLD.**

## Account behavior

`App` opens `OwnedAccountScreen`. The user first connects the account service, then chooses password sign-in or restoration. Public configuration is read from the installed native module. No provider credentials, launch-link tokens, environment secrets or default Circle are selected. Missing native configuration or unsupported platforms fail closed.

The official `@supabase/auth-js` SDK is pinned to 2.99.3. The controller uses only the SDK's auth surface behind a separate provider connection. It owns serialization, deadlines and protected persistence. Automatic initialization and refresh are disabled; each operation has its own request permission. The cached SDK can refresh through `getSession()` despite `autoRefreshToken: false`, so that setting alone is not the boundary. Member credential acquisition uses a fresh `getUser` call with the exact access token; cached identity and user metadata cannot authorize a member.

Passwords and email input are cleared on submission, background/blur, offline/unknown connectivity and closure. Provider errors, tokens and passwords are excluded from public models. Returning to the foreground or reconnecting does not restore private authority or replay a request. A deliberate restore is required.

After verified sign-in, the existing member gate checks the canonical member API. Missing member setup remains an explicit, acknowledged operation followed by a fresh matching readback. It grants no Circle membership and publishes no profile. Contribution history retains its separate fresh-author checks and explicit withdrawal.

The device-clear action retires local authority immediately and requests the native durable storage reset. A missing reset receipt is reported as unconfirmed. Closing a view only retires that view; a saved sign-in can remain. **Device clearing does not revoke the provider session.** An already dispatched storage write can finish after a background transition; durable reset fences stale writes, and an ordinary return requires fresh explicit verification. Clearing applies to the current configured storage namespace, not an audit of historical installations or changed provider configurations.

## Native boundary

The existing application API allowlist remains separate from provider authentication. Optional trusted build policy supplies an exact HTTPS provider origin and a publishable public key. Secret/service-role keys and legacy JWT keys are refused. The native namespace includes provider policy, and the current durable generation binds storage and allocated requests.

The separate auth channel accepts only password-token and refresh-token POSTs, exact user GET, and a reserved local-scope logout POST. The account UI currently exposes local device clearing only. Headers and JSON shapes are bounded; redirects, cookies, cache, transport retries and multiple transmissions of one native handle are rejected. JavaScript additionally limits SDK requests per explicit operation so an SDK retry cannot borrow permission from a later action.

## Verification boundary

The milestone verification receipt records fresh test counts, exact source/evidence hashes and review results. Tests use the actual cached auth SDK, application controllers and canonical server handlers/SQL with synthetic provider delivery, native storage/transport and React Native DOM primitives. They do not establish Hermes, Codegen, Kotlin, Android Keystore, operating-system transport, real Supabase configuration or physical-device acceptance.

The preceding contribution milestone's 39 evidence files were archived byte-for-byte under `verification/web/evidence/checkpoint-6723453/` before new checks. Its historical receipt identifies checkpoint `6723453d0cd1304de277906c7c00b82d5b9c5d01`; historical hashes do not verify this changed source.

## Remaining account parity and acceptance

This historical milestone exposed no PKCE operation. The later [native email account milestone](native-email-auth.md) adds signup, confirmation/resend and password recovery using native secure randomness/SHA-256 and an independently scoped callback. It avoids the SDK's insecure-crypto fallback. Native discovery, profile and reading composition also have later local proofs. Google/system-browser sign-in, real provider and installed-device acceptance remain open; historical counts here do not verify those later changes.

Native dependency acquisition, full lockfile installation, Codegen, Kotlin/Gradle build and Android device testing still need the pending bounded toolchain approval. iOS has no generated native project or equivalent protected implementation. Provider configuration, real email/password/refresh acceptance, remote session revocation, storage/reset interruption, TLS, lifecycle/input/accessibility and signing remain release gates. No provider account sign-in, issued credential, download, install, production change or spending is part of this local proof.

Official references checked for this work: [React Native auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react-native), [native deep links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), and [Supabase changelog](https://supabase.com/changelog). The announced [November 10 CBC cipher removal](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) belongs in real native TLS acceptance; no provider setting was changed here.
