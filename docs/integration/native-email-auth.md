# Native email account onboarding and recovery

The registered Android app has a source implementation of account creation, confirmation resend and password recovery. It uses the existing protected account connection and keeps email confirmation/recovery separate from ordinary member sign-in. **Android compilation, installed-device behavior and real provider/email acceptance remain unverified. First release remains HOLD.**

## Member experience

After connecting, choose **Create account** or **Recover password**. Account creation asks for an email and matching passwords; resend has its own action and does not repeat signup. Supabase sends its standard email link. Open the latest email on the same device, return to the app, choose **Load email link**, then **Continue email link**. Loading and returning alone never exchange the code or choose an account.

Confirmation ends with deliberate ordinary sign-in. Recovery first verifies the recovery link and its identity, then accepts a matching new password twice. An accepted password update also ends with ordinary sign-in. Neither flow provisions a member, joins a Circle, publishes a profile or releases candidate credentials into the member session.

Fields clear when submitted, inactive, offline or closed. Mode changes retire the previous screen's callbacks and authority. A request already sent can finish after leaving; nothing retries automatically. A lost password-update reply retains an uncertainty warning within the current connection. There is no durable journal proving the outcome of a sent update after process termination.

## Protected native boundary

The optional `supabase-email-pkce-v1` capability adds typed operations to the existing native module. Older password-only bridges keep ordinary sign-in. The callback is derived from the installed application's ID: `<applicationId>.email://auth/callback`. This is a custom scheme, not a verified Android App Link; signing, interception behavior and the exact provider redirect allowlist require device/provider acceptance.

Native code generates the verifier with `SecureRandom`, hashes it with SHA-256 and stores one pending flow in the existing encrypted namespace. The reserved email slot is unavailable through the generic JavaScript storage API. It binds flow, purpose, email, challenge, callback and expiry to the current durable storage generation. The pending record may survive backgrounding and process restart. Device clearing also removes this record.

Intent handling captures only the exact callback with unambiguous bounded query fields and a matching pending flow. It initiates no network request. A second callback cannot replace a captured code. The initial pending period is one hour; a captured code has a shorter five-minute claim period. A claim commits durable erasure before returning code/verifier once. Claimed authority remains in memory, is bounded by link/token expiry, and retires on native lifecycle change, replacement, reset or closure.

The native email transport independently restricts the provider origin, paths, methods, exact bodies, flow, generation, lifecycle and request budgets. Signup, resend and recovery each need a new explicit prepared flow. Only a claimed flow can exchange its code. Exact-token user proof follows exchange; password updates additionally require the recovery purpose. Redirects, ambient cookies, retries and reuse of a request handle are rejected. The existing application API and ordinary password/refresh channels keep their separate policies.

## JavaScript and SDK boundary

The strict ports validate the optional capability, every native receipt and each request. The controller uses the pinned cached `@supabase/auth-js` 2.99.3 for code exchange, exact-token user proof and password update. It supplies an isolated in-memory store, disables automatic initialization/refresh and blocks requests outside the explicit operation. It never invokes the SDK's JavaScript PKCE fallback.

Typed signup/resend/recovery requests include the native S256 challenge. Resend deliberately uses `/resend`: repeating signup can change an unconfirmed user's password, and the pinned SDK resend method does not supply the required challenge. Provider authentication methods must match exactly: `email/signup` for confirmation and `recovery` for password recovery. Unfamiliar, mixed, stale or mismatched identities fail closed. Parsing a token alone is insufficient; the configured provider must verify that exact token through `/user`.

Public controller models omit email, passwords, flow IDs, codes, tokens and provider error text. Browser/native callbacks do not select an ordinary account. Only the separate existing sign-in flow can establish member authority and proceed to the canonical member API.

## Verification and remaining gates

See [the milestone receipt](native-email-auth-verification.json) for final counts, input hashes and preserved diagnostic runs. Local tests execute the actual SDK, controllers, JavaScript ports and registered App with explicit provider/native doubles. Canonical member handlers and disposable SQL check the separate normal sign-in boundary. React Native DOM primitives are browser test substitutes; they do not establish Kotlin, Codegen, Hermes, Keystore, native deep links or physical-device acceptance.

Required next acceptance includes the approved Android toolchain, dependency/Codegen/type/Kotlin build, signed installation, cold/warm/background callback handling, encrypted storage and interrupted reset, real email/redirect/SMTP configuration, provider rate/CAPTCHA behavior, TLS, accessibility and successful ordinary sign-in after a real password change. iOS still lacks the equivalent generated native project and protected email bridge. Google/system-browser account sign-in and native moderation parity remain separate work.

Official compatibility references: [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [native deep links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), and the [pinned provider authentication-method mapping](https://github.com/supabase/auth/blob/d7955e9eb54003c4abbd7808e774c810d5d3e6cc/internal/models/factor.go#L71-L92). No provider setting, email, issued credential, download, installation, production data or spending was part of this local milestone.
