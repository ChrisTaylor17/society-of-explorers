# Native Circle discovery and membership

This source milestone extends `606f7126469974d145e79005490774d430dc8fd2`. Production clearance remains false. The canonical checkout is `/Users/christaylor/Documents/Codex/soe-release` on `codex/soe-first-release`.

After application-owned sign-in and member verification, **Discover Circles** and **My Circles** reach the directory. Search is deliberate, supports words, city, format, availability and ordering, and replaces bounded pages rather than silently truncating the catalogue. Public discovery uses a separate connection without credentials. My Circles includes joined and hosted groups, including hidden or unusable listings that still need membership controls.

Selecting a current result checks authenticated detail. It does not open discussion. Joining or leaving first refreshes current access, then presents a separate confirmation. Joining discloses display-name sharing and shows the canonical conduct and meeting-safety expectations. Leaving removes current RSVPs but retains authored messages and any hosting responsibility. Completing a hosted Circle remains a web action.

Each confirmed change has an OS-generated request ID and the reviewed revision. An uncertain reply pins the exact request and blocks ordinary navigation or a new direction. Manual retries preserve its bytes and ID; a refused retry cannot settle an earlier uncertain attempt. A matching receipt must be followed by fresh state at least as recent as the receipt. Historical membership cannot open a discussion after a later departure. A separate membership endpoint supports leaving even when full detail is unavailable. Its result never grants join or discussion access.

**Open discussion** explicitly mounts the existing discussion screen and starts its member read. Returning to Circle detail retires that screen and rechecks access. Discussion navigation respects unresolved post and message-action fences. Own contributions remain available independently after leaving. Global closure remains possible; it warns that requests already sent may finish.

Account replacement, blur/background, offline or unknown connectivity clear private detail and pending local intent, abort requests, and retire late responses. Foreground and reconnect perform no automatic request. Controller closure detaches ownership and cannot be reopened through a stale reference. The native public, member and provider channels share the existing native generation/cancellation engine while retaining separate route and credential policies.

The detail screen shows pinned source editions, exact session labels and the agreed schedule. It explicitly says full-text reading in the native app is unavailable. This milestone does not provide native reader, bookmark, profile, RSVP-editing, Circle-creation, host-completion or moderator parity.

## Verification and limits

[The verification receipt](native-circle-directory-verification.json) binds the final source, cached runtimes and local evidence. Controller tests cover current-page selection, paging beyond 100 matches, membership readback, uncertainty, lifecycle and deadline races. Native policy tests exercise separate anonymous/member channels, exact request envelopes, cancellation and reset. The composed browser fixture uses the actual App, cached official AuthClient, native JavaScript ports, canonical bearer resolution and current workflow SQL in disposable PGlite. It follows discovery, join, discussion preview/post, leave and contribution recovery, including lost replies and hidden listings.

React Native primitives, native OS services, provider delivery and server SDK identity responses are explicit test doubles. The real provider, Hermes, Codegen, Kotlin compilation, device storage/networking, iOS, native accessibility and Quest acceptance remain open. Kotlin checks inspect source only. No application server or SQL behavior changed; the earlier web build remains historical. Clean environments and startup network denial are application-level protections, not OS isolation.

The prior sign-in milestone's 26 evidence files and original receipt are preserved under `verification/web/evidence/checkpoint-606f712/`; its historical receipt now points to those preserved files. Evidence is local and ignored by Git. Source runners and hash receipts do not constitute a portable evidence export.

No push, deployment, production SQL, provider sign-in, issued credential, download, install or spending was performed. API credit linking remains unapproved. Existing production-backup and Android-toolchain questions remain pending; do not repeat them.
