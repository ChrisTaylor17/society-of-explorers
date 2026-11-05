# Saved reading across web and native

This local milestone extends `88bf1b663cc5d49dbffd3e1560256f41c9baa04f`. Production release remains on hold. The new database candidates have not been applied. [Verification receipt](saved-reading-verification.json) records current source and evidence bindings.

## Member experience

After verified sign-in and a canonical member check, native **Saved reading** opens without fetching. **Load my saved reading** explicitly retrieves the eight canonical books, including absent or removed places. A current saved place opens only after a fresh owner-bound check. Text is then fetched anonymously at its exact pinned edition and block. The reader begins at that block and can navigate the full edition. This grants no Circle membership or discussion authority.

Circle reading preserves its agreed source range. Its saved-place controls can explicitly load the current saved state, review saving the exact displayed position, choose whether the edition is finished, and review removing an existing place. Each write needs confirmation. The web reader and library use the same owner-bound contract. The web reader retains its separate AI controls and consent behavior.

Successful writes require an exact receipt and a separate matching fresh GET. Cancellation sends no new write. Reading or opening a place never saves automatically. A legacy numeric location, malformed location or location from another edition remains visible without guessed remapping; it can be explicitly replaced or removed.

Lost replies remain uncertain. A fresh unchanged revision cannot prove that an earlier request completed. A newer revision prevents the old request from overwriting it without claiming the old request's success. Retrying requires a new review and confirmation of the identical action, values, owner and original revision. A refused retry does not erase uncertainty about the original request.

Native temporary navigation and blur/background/offline retire visible private data and callbacks while retaining uncertain actions in the same open owned-account connection. Explicit provider/member verification and a fresh load are required for recovery. Closing or replacing that connection destroys local pending recovery; already-sent requests may still finish. Recovery is in memory, not durable across app termination. The web view similarly retires visible data on owner/lifecycle changes while retaining unresolved attempts only in its current mounted context.

Only one native component manages each saved-reading session's lifecycle. Nested reader controls subscribe to that session. Refreshing their saved-place state does not close the reader. Close retires the owning member view. Stale callbacks cannot submit a newer review or navigate a newer context; captured open intent is also invalidated by a subsequent action.

## Shared API and database

`GET /api/great-books/progress` returns the canonical owner and all eight states in catalog order. `?bookId=<slug>` returns exactly one state. Query keys are strict. Every state contains its revision, absent/saved/removed status, current edition metadata and interpreted saved locator.

`POST` accepts only a complete reviewed mutation: expected member, expected revision, canonical book and save/remove action. Save also requires the pinned edition, exact block index and explicit completion boolean. The route bounds the streamed UTF-8 body to 4 KiB and a five-second body deadline, verifies the current actor and edition, and calls the service-only atomic RPC. No unrevisioned compatibility write remains.

The SQL candidate adds a nonnegative revision and removal marker. Changes advance the revision once; exact no-ops preserve revision and timestamp. Removing an absent place creates revision-one state so a held first save at revision zero cannot restore it. Removal clears the locator and completion fields but retains the member/book key and revision. Insert-on-conflict followed by row locking serializes the absent-row path before comparing the reviewed revision.

Removing a saved place also requires current verified source metadata; unavailable source assets temporarily block removal rather than returning an unverifiable receipt.

The migration revokes direct service-role writes and browser access to the table, retaining only service SELECT and execution of the reviewed function. This deliberately stops an older server from bypassing revision checks through raw upsert. Preflight requires the reviewed table, ownership, constraints, grants and zero-policy baseline; drift is rejected. Disable-only rollback removes the new function while retaining the columns, revision history and raw-write barrier. It cannot safely restore the old endpoint. Apply this stage after the older Great Books private-data candidate and coordinate SQL, server and client rollout. See [migration stage 9](production-migration-plan.md).

The optional [native transport capability](native-saved-reading-transport.md) keeps private progress separate from anonymous passages and other member channels. Kotlin source enforces its own route/body bounds; exact current edition pins and block limits are checked by JavaScript and the canonical server.

## Verification and limits

- 27 backend contract/API/SQL checks and 23 existing reading regressions pass.
- 90 portable checks pass: 54 saved-reading controller cases, 31 existing reader cases and 5 starting-position cases.
- 19 actual web component/browser stories and 19 native App/browser composition stories pass. They exercise current handlers and additive SQL in disposable PGlite, including persisted reopening/removal, late writes, conflicts, no-op uncertainty, fresh-readback requirements and account isolation.
- 84 native transport checks pass, including 13 new executable cases and one new Kotlin static check. Prior profile26, directory15, reading18, actual SDK24 and broader platform105 checks pass against current sources. Counts overlap and must not be summed as unique tests.
- Portable TypeScript, scoped lint and the guarded offline web build pass. The web build binds 1,002 unchanged inputs and generates all 238 pages.
- Root inspected the native 320px review/list screenshots; the web reviewer inspected both web screenshots. Browser primitives do not establish native rendering, keyboard, screen-reader or headset acceptance.

The legacy Node DOM suite could not run because its cached jsdom input is offloaded; it was not read or hydrated. Actual component Chromium coverage is recorded separately rather than called a pass for that suite. PGlite uses one database connection: independent-session production contention, schema-cache refresh, live grants and hosted integration remain unverified. Native Codegen/Kotlin compilation, physical devices, real provider execution, iOS and Quest acceptance remain open. The clean environment/network guard is application-level protection, not OS isolation. No installation, provider credentials, API spending, push, deployment or production SQL occurred.

The prior native-profile receipt and 40 evidence files remain archived under `verification/web/evidence/checkpoint-88bf1b6/`. Evidence files are local and ignored by Git; committed receipts/runners are not a portable export of those artifacts.
