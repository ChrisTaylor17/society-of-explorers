# Native existing-account setup

This milestone connects the app's existing verified provider account to canonical member setup and readback. It does not add provider sign-in, create an auth client or claim a compiled native app. The default registered application still reports that sign-in is not connected until trusted application composition supplies its real account client and approved transport.

`MemberCircleScreen` now opens an account gate first. Existing provider verification does not trigger a member GET or setup POST. The member explicitly checks the current account. Only the canonical unconfirmed-account response permits a setup acknowledgement and an explicit setup action. Setup sends `{}` to the canonical endpoint using the owner's freshly verified exact bearer; the server chooses its own subject, looks up that subject and reuses an existing member record. The unconfirmed-account response is not proof that no row exists. An accepted setup response must be followed by a fresh matching member GET. The member then chooses **Continue to Circle** before the Circle subtree mounts and requests its conversation.

The gate does not display member IDs, provider subjects, email or profile fields. It clears ready state and unmounts the private Circle on account changes, app inactivity, Android blur, offline/unknown connectivity and closure. Returning active/online does not fetch or retry. The existing verified owner and Circle host retain independent lifetime fences. An uncertain setup may have committed: an explicit current-account check comes next. A fresh canonical unconfirmed-account response permits a separately acknowledged **Retry member setup** for the same account and `{}` body, while retaining the may-have-completed warning. There is no automatic retry or exactly-once creation claim.

Native transport adds only exact `GET /api/auth/member` and `POST /api/auth/ensure-member`. Both JavaScript and Kotlin policy reject query strings and suffixes; cookie-free requests retain the existing generation, cancellation, deadline, body/response bounds and redirect rejection. Kotlin remains uncompiled source.

## Local verification and limits

The new `native-account-setup` browser fixture executes actual `MemberCircleScreen`, the verified owner and account controller against canonical account handlers and the actual identity uniqueness SQL in a disposable PGlite database. Provider identity, delivery, React Native DOM primitives, AppState and connectivity are explicit synthetic doubles. A synthetic Circle conversation is used only to prove entry gating and privacy retirement; this fixture does not substitute for the separately verified canonical Circle APIs/SQL.

The browser proof passes **9/9 stories**, with **37 unchanged source bindings** and **27 intercepted requests**. It covers existing/new setup, conflicting cookie identity, explicit confirmation/readback, a committed lost reply with manual GET, a separately acknowledged same-body retry after a fresh canonical unconfirmed-account response, malformed proof, held-response retirement, entered-Circle unmount and unknown connectivity. Owned browser/database cleanup completed with no unexpected requests or page errors. The 320px keyboard/control check uses DOM primitives, not native layout/accessibility acceptance.

The original 35-source account checkpoint is archived. Its unchanged nine-story runner was rerun after the separate contributions entry was added; the current account receipt binds 37 sources. The browser receipt records each story, exact source hashes, intercepted requests and prior attempt receipts. It is local evidence, not native OS/device acceptance. The policy suite passes **4/4**: three executable JavaScript cases and one explicitly static Kotlin source check. Scoped `MemberCircleScreen` lint passes. No SDK/dependency download, provider sign-in, issued credential, production SQL or deployment is performed.

Run from the canonical checkout with cached runtimes and startup external-network denial:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor verification/web/tooling/node_modules/@oven/bun-darwin-aarch64/bin/bun --no-env-file --no-install --preload ./verification/web/scripts/deny-build-network.cjs platforms/tests/bundle-native-account-setup.mjs
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./verification/web/scripts/deny-build-network.cjs platforms/tests/browser-native-account-setup.mjs
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./verification/web/scripts/deny-build-network.cjs --test platforms/tests/native-account-setup-policy.test.mjs
```

Evidence: `verification/web/evidence/native-account-setup-browser.json`, browser log and 320px screenshot; `platforms/evidence/native-account-setup-{bundle,policy,lint}.log`. These ignored local outputs accompany committed runners and source. Earlier fixture sources and archived checkpoint evidence remain unchanged; their historical counts do not verify the new account gate.

Open release requirements include app-owned auth SDK construction/network policy, real sign-in and sign-out/reset, unique-subject production enforcement, native compilation/Codegen, secure OS storage/transport and actual iOS/Android device acceptance. A current member DTO proves current setup for one verified account; it is not a grant of Circle membership.
