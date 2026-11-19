# Native keyed discussion source

The native Circle screen now uses the shared keyed discussion writer for new root messages and replies. It does not import the web page or duplicate its data contract. The host still owns member identity, credential acquisition, activity/connectivity retirement, deadlines and transport policy. Complete archive/thread reads continue to retain only the current bounded page.

## User flow

After explicitly loading the current complete archive or thread, choose a new discussion message or reply to an actually loaded visible message. The older flat read alone does not enable this writer. Draft only your own comment; selecting another target clears prior review state. The preview checks the current parent again and returns the complete message with a stable parent link. Nothing posts until the user checks the exact-message confirmation and chooses Post.

An unconfirmed post keeps its original request key, byte-for-byte reviewed request and expected content/target binding in memory. The available actions are explicit receipt lookup or retry of that same request; no automatic lookup, resend or replacement key resolves uncertainty. A missing receipt does not prove that a prior attempt will never complete. Current saved messages open through a new thread read, without optimistically inserting a body into the archive. Restricted receipt bodies are not restored from the earlier preview.

Navigation is disabled while an unresolved request must retain its exact proof. Account change, background/blur, offline/unknown connectivity, closure and replacement still retire the entire private lifetime, including draft, preview, confirmation, receipt and pending key. A request already sent may still commit; closing the view cannot recall it. Reporting and withdrawal remain available in the member web app.

## Secure request keys

The native writer receives an explicit asynchronous key factory. No native runtime guarantee about `crypto.randomUUID()` is assumed. The app-local Android module adds the optional v2 capability `requestIdPolicy: 'os-random-uuid'` and method `newRequestId(generation)`. Actual native source calls `UUID.randomUUID()` inside the current ready storage generation check. The adapter forwards that method, and the member binding retires its late reply when closed. Older modules without both the exact policy and method can still read; they cannot acquire a replacement key factory.

## Narrow transport additions

The existing origin, epoch, body/response limits, cancellation, redirect rejection and single-exchange protections remain. New approved operations are:

- `POST /api/circles/{uuid}/discussion/preview`, with no query.
- `POST /api/circles/{uuid}/discussion`, with no query.
- `GET /api/circles/{uuid}/discussion?requestId={uuid}`, containing only that parameter.

Receipt reads reject mixed paging parameters. No broad proxy URL, arbitrary Circle subroute, new permission or new credential store is introduced.

## Verification boundaries

Focused JS tests use the actual adapter/binding/ports and explicit synthetic native doubles to check secure-key forwarding, absence of a fallback on older modules, and retirement of held keys. Kotlin endpoint and UUID assertions are explicitly static source checks. The actual native screen/controller browser fixture uses cached React/Chromium with explicit React Native primitives and lifecycle/identity/transport doubles. Separate composition evidence must identify whether it exercised real canonical APIs/SQL or DTO fixtures.

The focused run passed 16 cases: six actual JS key-source cases, three executable public-config/CLI cases, and seven AST/static checks. The native screen fixture passed 12 stories: ten lifecycle/connectivity checks plus root preview/confirmation/post/fresh-read and visible-parent reply/lost-reply/missing-receipt/exact-retry/fresh-read. The latter uses an explicitly synthetic DTO receipt store, not canonical APIs or SQL. It verifies no parent name/body is copied into the posted comment and that retries preserve identical JSON. Targeted lint reported no errors or warnings. Prior checkpoint receipt/log/bundle inputs are retained under `verification/web/evidence/checkpoint-c1f4dd1-native-connectivity/`; current browser evidence is `native-connectivity-browser.json` with `native-keyed-browser.log`, and focused source checks are in `native-keyed-bridge.log`.

The Android source remains unprocessed by Codegen, uncompiled against Android/RN/OkHttp and unexecuted on a device. OS entropy, native endpoint enforcement, lock state, cancellation and crash recovery still require the approved native toolchain/device gate. The registered default App still has no account/sign-in owner. No SDK acquisition, provider call, issued credential or production operation is part of this milestone.
