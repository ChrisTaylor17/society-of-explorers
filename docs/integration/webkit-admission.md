# Local WebKit invitation verification

The compiled web admission page and regular Quest view passed eight local journeys in resident macOS WKWebView. This strengthens browser and cookie coverage for the existing invitation implementation. No product code changed. First release remains HOLD.

The test uses three nonpersistent WebKit cookie stores and random throwaway wallets. The local nonce, SIWE signature, wallet session and logout handlers execute from the current source. The browser uses the compiled frontend and real browser SDK. The current invitation routes run against the existing SQL chain in disposable PGlite. Provider identity, PostgREST delivery, API dispatch, injected wallet transport and focus/visibility are explicit adapters. The test is not a deployed application or provider acceptance check.

The eight journeys establish:

1. A signed-out visitor loads the compiled form and receives no private fields.
2. Three isolated cookie stores complete nonce/signature sign-in as distinct synthetic members.
3. The form fits at 100%, 200% and 400% zoom. Recipient sharing requires consent, grants no membership and clears on controlled blur.
4. Host review focuses the intended recipient; separate confirmation issues approval. A different signed-in member cannot use the forwarded approval.
5. A lost reply after a committed join stays uncertain. A token-free read-only check recovers the result without a second join.
6. A lost revocation reply requires deliberate review and retries the exact request. The revision advances once and existing members remain.
7. The compiled Quest view connects through the wallet cookie, clears private code on controlled blur and keeps regular controls usable when WebXR is unsupported.
8. All three sessions revoke through the local logout handler. A reloaded signed-out recipient receives no invitation fields.

Final SQL contains only the host and approved recipient, invitation revision 2, three used wallet challenges and three revoked sessions. The browser trace contains one join, one token-free receipt check and two identical revocation bodies. There were no recorded fixture errors, external fetch attempts or Node guard denials.

The test pins one ephemeral TLS certificate within its WebKit delegate. It does not alter operating-system trust. Each WebKit view has a nonpersistent data store, same-origin navigation checks and content/fetch restrictions. The server starts under the existing Node API network guard with a clean environment and no issued credentials. These are local test controls, not an OS-wide firewall. The parent owns and stops only its child server.

The runner compiles its Swift source using the resident command-line compiler and Mac SDK, binds the binary and inputs, and checks source, compiled build and loaded runtime hashes after shutdown. Its deliberate failure mode stops after SQL startup and compiled-page hydration. That run returned FAIL/exit 1 while the owned server closed cleanly; database cleanup did not turn the failure into a pass.

Twenty-six existing public-profile fixture regressions and scoped lint with zero warnings also passed. The helper's admission support is opt-in; existing defaults remain covered. The full webpack build/type check used a nonissued synthetic public configuration so the regular Quest SDK path could execute locally. That configuration must not be mistaken for production configuration.

To reproduce in a disposable, fully resident checkout with the pinned dependencies already available, build with `python3 verification/web/scripts/build-offline.py --webpack --fixture-browser-auth-config --evidence-prefix=webkit-admission-`, then run `python3 verification/web/scripts/verify-webkit-admission.py --output /private/tmp/soe-webkit-admission-evidence`. Use a new output folder per run. `--calibrate-failure` intentionally returns a failed result after startup. The runner uses no downloads or native tool installation.

This covers macOS WKWebView, not Safari UI, an installed iOS or Android app, physical phones, deployed middleware, hosted authentication/recovery or a physical Quest. Focus and visibility are controlled adapters rather than OS application switching. WebXR is unsupported on this host engine; earlier simulated Chromium checks cover permission-pending and active immersive paths. Real device and hosted acceptance remain open. See the [source-bound receipt](webkit-admission-verification.json) for local evidence paths, hashes and scope.
