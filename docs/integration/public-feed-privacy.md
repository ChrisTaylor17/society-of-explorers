# Public activity without private event rows

Routine member actions now create private activity records. The logger rejects a public flag or a reserved publication payload. Joining a salon, creating a task or starting a room is not a decision to publish that activity.

The public feed reads a separately prepared, bounded copy in `metadata.public_feed`, requires `is_public=true`, and returns only five fields: event ID, public event type, public title, public description and creation time. The database selection excludes raw titles/descriptions, member and agent identities, and arbitrary metadata. Legacy records marked public by the old default are excluded unless they contain the exact reviewed-copy structure. No existing rows were modified or deleted.

The activity page and dashboard validate the versioned response. The activity page distinguishes an empty feed from a failed request, offers retry and retires stale requests after ten seconds. Published activity is fetched without account credentials and responses are not cached. A malformed or old server response is rejected by the display; this does not prevent an old server from exposing that response over the network.

The social-draft helper retains its existing authenticated own-event path. For another member's activity it can use only the bounded public copy, not the raw event. It checks the exact copy and review timestamp again after generation before saving a draft. Sequential validation cannot retract input already sent to a model or make withdrawal atomic. No provider was enabled or called by this verification.

## Authority and release limits

**A publication marker is not authorization.** The current hosted access findings include overly broad table access. A direct writer could forge a marker until write access is contained. There is no new trusted publication workflow in this change. Keep public publication disabled until the publisher's authority, exact-content confirmation, withdrawal, access controls and retention are separately reviewed and tested.

**Release HOLD.** This fixes local application code only. It does not repair hosted RLS/grants, public storage, an older deployed route, other service-backed routes or an already disclosed record. Coherent source backup/restore, a complete hosted access cutover, real sign-in/recovery and device acceptance remain open. Recovery inputs remain pinned to their existing procedure.

## Verification

- Eleven behavioral checks passed against the actual route/helper, installed Supabase client and disposable PGlite SQL. They cover exact projection, community/cursor bounds, invalid requests before client creation, errors, private logging, forbidden legacy-public model input, reviewed-copy input and post-generation withdrawal/ownership changes.
- Six journeys passed in the actual compiled Next activity page at 390px and 320px, including errors, retry, timeout, withdrawal and an old malformed reply. Its real API, without service credentials, also returned the expected generic no-store error.
- The full offline webpack/type build passed with 1,226 unchanged inputs. Scoped product and fixture lint passed with zero warnings. Source/build/runtime hashes matched after owned server shutdown; the port closed. No external browser request, provider call or denied server operation occurred in the successful browser run.
- Four broader static checks still fail identically on the untouched starting commit and the candidate: book-salon writes, the DM route, Great Books editions/bookmarks and core Thinker/Movement clients. They are recorded as unresolved, not accepted or dismissed as false positives.

SQL transport, identities and content are synthetic. The bounded PostgREST transport adapter is not a hosted PostgREST/RLS acceptance test. The nested projection uses documented [PostgREST column aliases and JSON selection](https://docs.postgrest.org/en/stable/references/api/tables_views.html). Browser imagery was inspected and uses fictional public copy. See the [machine-readable evidence](public-feed-privacy-verification.json) for hashes, scope and retained failed attempts.

## Preservation and rollback

Five product files and four verification files change; two evidence documents and the release status accompany them. No schema migration, credential, hosted permission, native app, publication or paid service changed. The exact starting source and failed test attempts are preserved privately.

A local source revert is possible after checking dependent work. Do not deploy a rollback that restores the old raw feed: that would reintroduce disclosure. A future cutover must contain direct access, review old clients/caches and keep a safe disabled route or forward fix available. No automatic legacy-public backfill is authorized.

## Later verification checkpoint

The four broad failures above record this change’s original result. A later [route-guard audit](route-guard-audit.md) traced them to outdated expectations, repaired the test setups and verified the current controls. Two separate product gaps were reproduced and remain open. The original feed receipt is preserved; hosted clearance is still false.
