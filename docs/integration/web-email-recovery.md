# Web email password recovery

This milestone adds `/auth/recovery` and the **Forgot your password?** link on `/login`. It is local source and synthetic acceptance work. It does not establish real email delivery, hosted redirect configuration, a production release or native recovery.

## Member journey

1. Enter an email and explicitly request a recovery message. The receipt is generic and does not reveal whether the address has an account. There is no automatic send or retry.
2. Open the latest standard provider email link in the same browser. Its one-time code is captured and removed from browser history before a recovery client is created. **Continue recovery** explicitly verifies the link.
3. Enter the new password twice and explicitly submit it. A matching provider response means **Password update accepted**. It does not prove that a subsequent password sign-in works.
4. **Sign in** opens `/login?recovery=1`, which skips the usual existing-member redirect. The member deliberately signs in with the new password using the normal account flow.

A lost password-update response remains uncertain. Looking up the user cannot establish which password is current. Inactivity, offline state or requesting a replacement email cannot cancel or settle an already dispatched update. The page provides explicit normal sign-in and a new recovery request as next actions.

## Credential isolation

The recovery client uses cached AuthClient 2.99.3, with initialization, URL detection and automatic refresh disabled. Its otherwise automatic BroadcastChannel is immediately closed. Session and user data stay in the operation's memory adapter. No recovery access token, refresh token or password is written to cookies, ordinary auth storage or a broadcast. Recovery does not select a provider, provision a member or enter the authenticated application.

One bounded pending record in `soe.email-recovery.v1` stores a random flow identifier, the PKCE verifier and a one-hour validity window. It contains no email, password, callback code or session token. Browser Web Locks serialize replacement and single-use claim. Claim removes the record before exchange; an uncertain exchange requires a newly requested link. Pending records can survive leaving the page to open email. Expiration removes their authority; physical storage cleanup is not a background guarantee.

Secure WebCrypto and S256 are required. The cached SDK's weak fallback has a different verifier shape and is rejected; the transport separately checks the exact challenge and `s256` method. Browsers without secure context, local storage or Web Locks fail closed with a browser-availability message.

The provider transport permits one call per allowed operation family, omits browser credentials and referrers, refuses redirects, caps response bytes and uses bounded cancellation. It permits only recovery initiation, PKCE exchange, exact-token identity lookup and password-only update. Refresh, logout, arbitrary user updates and member APIs are unavailable. Session identity, freshness and provider authentication method are checked. URL parsing rejects extra fields, duplicate fields, implicit tokens and error callbacks without echoing their contents.

## Normal callback defense

`/auth/callback` buffers all SSR cookie writes. The SDK's `SIGNED_IN` event is insufficient: it also occurs during explicit recovery exchanges. The handler rejects recovery verifier markers and admits only the provider's `oauth` or `email/signup` authentication methods. It verifies the exact returned token with the provider and requires matching subjects and fresh expiry before releasing cookies and selecting Supabase. Missing, malformed, recovery or unfamiliar methods return to deliberate sign-in without publishing the candidate cookies. The existing saved session is not claimed to be revoked.

The authentication-method parser is routing evidence, not a standalone JWT verifier. The exact-token provider lookup supplies verification. These method names follow the [official Auth definitions](https://github.com/supabase/auth/blob/d7955e9eb54003c4abbd7808e774c810d5d3e6cc/internal/models/factor.go#L71-L92) and [PKCE flow documentation](https://supabase.com/docs/guides/auth/sessions/pkce-flow); compatibility with this project's hosted Auth version remains unverified.

The recovery document receives `no-store`, `no-referrer` and no-index headers before client execution. The page has no account navigation component. Hosting access logs may still receive the initial callback URL and require deployment-level handling; client URL scrubbing is not a claim about provider or host logging.

## Remaining acceptance and follow-up

- Configure and verify the exact hosted recovery redirect allowlist, default confirmation/recovery email links, provider limits, delivery, secure password policy and ordinary sign-in with the changed password. No email template customization is assumed.
- Exercise actual Google/signup callback AMR compatibility and email links across browsers, new tabs, expiration, existing sessions and password managers. Local synthetic replies do not establish provider acceptance.
- Existing signup resend, ordinary login lifecycle hardening and complete native signup/recovery are separate unfinished work. This milestone does not certify those flows.
- Native recovery needs a secure S256 bridge, one protected pending flow, exact callback capture and explicit single-use claim. Recovery credentials must remain separate from ordinary native account acceptance. Android callback registration and iOS account integration still need implementation and device acceptance.
- Production privacy/access, tested restore evidence, coordinated SQL rollout, deployment provenance and native SDK/device gates remain open. No production SQL, provider email, credential issuance, spending, SDK acquisition or deployment is part of this milestone.

See the adjacent `web-email-recovery-verification.json` for the final source-bound local checks and exact limitations. The preceding consent checkpoint and its 31 evidence files are preserved under `verification/web/evidence/checkpoint-21e404e/`.
