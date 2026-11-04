# SoE mobile client

**Current reporting candidate:** [REPORT_UI_MILESTONE.md](../REPORT_UI_MILESTONE.md) documents the development-only authenticated local report form, receipt/retry behavior and draft-clearing contract. The external review evidence distinguishes its current native checks from the historical milestone text below.

TypeScript client and a small Expo shell for a synthetic adult journey. `native/` exports a static Android and iOS JavaScript bundle. This environment has no Android SDK and no Xcode, so that bundle was not launched on a device or simulator. The shell is not a store build, not a deployed preview, and it does not sign in to Meridian or post participant changes.

The adult journey, in order:

1. Discover a plan.
2. Review who may see what.
3. Request to join.
4. Mutual acceptance of the plan, then of contact.
5. Revoke future contact access.

People and the plan are fixtures. Every screen carries the label **Synthetic demo**. Revoking stops future contact access. It cannot erase information someone already saw.

The screens ask a `MeridianPort` for reads and writes. They do not decide contact visibility themselves. The fixture adapter applies `contactDisclosure` from `meridian/src/lib/consent.ts` and returns the result. The HTTP adapter names the current JSON routes and refuses writes. Its transport is not called.

Pending and ambiguous writes stay in that state for that endpoint and plan. The client does not mark them successful, does not send them again, and a later plan read does not erase them. Only a stored result for the same key confirms the outcome. A relay returned by an authorized read is held in memory only. It is cleared when the app is backgrounded or inactive, when the device goes offline, when a revoke is attempted, and when a refresh is rejected or stale. Clearing it does not delete a copy someone already saw. Background suppression stays in effect for a queued read and for the plan read that follows an in-flight write. Contact is held again only after an explicit foreground refresh. That refresh is a read: it does not send a pending or ambiguous write again, and it does not turn an unknown outcome into a success. Each shell write uses a new idempotency key. Checking an unresolved result uses the key already stored for that attempt.

## Run

From this directory:

```bash
npm install
npm test
npm run typecheck
npm run preview:build
```

Open `preview/index.html` in a browser. To serve it only on this machine:

```bash
npm run preview
```

That prints `http://127.0.0.1:4173`. Leave the process running and open that address. Do not deploy it.

The native shell uses the same fixture client. From `native/`:

```bash
npm install
npx tsc --noEmit
npx expo export --platform android --platform ios --output-dir /tmp/soe-native-export
```

`expo export` writes a static JavaScript bundle. It does not install an app on a phone. When a simulator or device is actually available, `npx expo start` then `a` or `i` opens it. Do not use a paid or cloud build.

Host buttons in the shell are fixture controls. They update the synthetic server stand-in and then refresh with a read. They do not mean another person accepted.

## Integration blockers

These are properties of the current Meridian server. This client does not paper over them.

- Plan lists are server-rendered. There is no `GET /api/plans`.
- `GET /api/plans/:id` and `GET /api/permissions` require the `meridian_session` cookie. Sign-in deletes every session for that person. There is no bearer session that can rotate without signing other devices out.
- Invite, respond, grant, and revoke are form server actions. Invite is host-only. There is no guest join route and no JSON write route.
- There is no idempotency store, no plan version or ETag column, and no transaction around check-then-insert invite.
- Idempotency hashes are pure JavaScript SHA-256 in `src/hash.ts`. Client and shell runtime files do not import Node modules. The hash tests compare that implementation with Node, and those tests are not part of the native bundle.
- `native/` is an Expo SDK 58 shell around this client. It talks to the fixture adapter only. The HTTP adapter stays disabled. There is no second sign-in and no push notification.
- A static export is not a device run. The Android SDK and Xcode were not installed for this check. Do not submit the shell to an app store.

`/verify` on the Meridian app is unchanged. This branch does not modify the exhibition homepage.
