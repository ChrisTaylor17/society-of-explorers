# Native and Quest thread participation

This local milestone connects the actual native Circle screen and Quest member page to the canonical discussion preview, post and receipt protocol. It does not establish a native binary, physical headset, hosted account or production database acceptance. The previous Android/Thinker checkpoint is `c1f4dd1`; its evidence is archived separately.

## Member flow

After an explicit current archive/thread read, a member can start a root or select a visible reply target. The server prepares the exact complete message and checks the current parent. Posting requires review and an explicit confirmation. Reply content links to the parent by ID without copying its author or words. The canonical 2,000 UTF-16-unit full-message limit determines the remaining comment allowance.

One exact serialized request stays in memory after an uncertain POST. A manual GET receipt check never posts; a manual retry sends the same bytes and key. An absent receipt does not prove that an earlier attempt cannot complete. Navigation is withheld while a send or unresolved request is active. A confirmed receipt requires an explicit fresh thread read. Hidden/withdrawn receipts retain their tombstones without an earlier body.

Account replacement, access denial, background/blur, unknown/offline connectivity, closure and disconnection retire private text, previews and request keys. Late replies cannot restore them. Activity or connectivity return does not automatically load messages or retry a write. Closing cannot recall a request already sent.

The existing flat conversation controller remains separate. Native writing now uses the keyed archive flow; older Quest markup can retain its existing flat flow. Reports and withdrawal continue through the member web experience. These controls do not grant author AI consent; the existing per-message opt-in policy remains separate, with legacy messages excluded and reporter notes never sent.

## Request authority

The shared writer requires an explicitly supplied asynchronous request-key factory. Quest supplies browser `crypto.randomUUID` only when available. Android exposes the optional `os-random-uuid` capability and generation-fenced `UUID.randomUUID()` method. Both the policy and method are required; older v2 modules remain readable without gaining a fallback key source. Host deadlines and account/lifetime checks cover asynchronous key acquisition. Native storage generation also fences a delayed key across account reset.

The transport allows only the existing narrow salon endpoints plus canonical discussion GET modes, POST `/discussion/preview`, POST `/discussion`, and GET `/discussion?requestId=…`. Receipt queries accept only their single key; preview/post paths accept no query. Existing bearer/origin, redirect, retry, deadline, body-bound and generation checks remain in place. Android source has not been generated or compiled.

## Evidence and limits

The current source-bound receipt is [platform-thread-verification.json](platform-thread-verification.json). Independent controller/host tests exercise the actual canonical API handlers and strict local SQL, including committed-response loss, exact replay, changed parent revision, membership loss and current tombstones. Browser composition separately exercises the actual Quest component through those handlers/SQL. Authentication, SDK delivery and transport are explicit synthetic doubles with nonissued credentials; the local database is one PGlite backend. This does not establish hosted PostgREST behavior or independent-session contention.

Native component browser tests execute actual TSX against explicit web primitive/lifecycle/connectivity doubles. Native bridge tests execute actual TypeScript against explicit OS doubles, while Kotlin checks are static. None proves Codegen, Kotlin, Hermes, Keystore, OS randomness, device callbacks or physical input. Portable typechecking excludes the React Native adapter/spec because the pinned native runtime remains offloaded.

All application/test execution uses cached runtimes, clean environments and startup external-network denial. No dependency acquisition, production SQL, deployment, issued credential, provider activation or spending is part of this milestone. The pending Android toolchain and tested-backup decisions remain unresolved.
