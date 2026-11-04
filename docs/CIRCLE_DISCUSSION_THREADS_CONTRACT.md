# Circle discussion archive and replies

This local web candidate adds older-message access, message permalinks and durable nested replies to existing free Circles. It uses canonical account authority and the current Circle membership boundary. It does not provision accounts, grant membership, change native session ownership, send notifications, generate commentary or call a paid provider.

`docs/sql/circle-discussion-threads.sql` is an **unapplied candidate delta**. Its prerequisite stack is the reviewed Circle migration, Circle moderation, message moderation, participation, reading-program and passage-post SQL. Only disposable local fixtures have applied it. Production restore/preflight, migration review and application require separate authorization.

## Identity and retained content

Existing `seminar_messages` remain the immutable retained posts. A new immutable link records each reply's immediate parent and canonical root, all in the same genuine Circle. A reply may target another reply; this is not limited to one nesting level. Existing messages without a link are their own thread roots. The insert boundary checks same-Circle relationships, the parent's established root and acyclicity. Once a message has served as a parent/root, it cannot later be reclassified as a reply. Existing message identities, timestamps, bodies, moderation SQL and portable controllers are not rewritten.

The new post body is a trimmed human comment. Replies append a generated local parent locator:

```text
In reply to message:
/circles/{circleId}/discussion?message={parentMessageId}
```

No parent quotation, byline, private report, profile ID or historical safety excerpt is copied into a child. A visible reply remains an independently authored post if its parent is later hidden or withdrawn; the parent's current tombstone remains visible in context. The existing whole-Circle hold still denies every ordinary thread/archive read. Each post retains its own existing reporting, human review and irreversible author-withdrawal controls.

The full body, including reply locator, fits within 2,000 UTF-16 units. The server derives the locator and computes the available comment length; it never accepts a caller destination URL or truncates a reviewed body. Forbidden controls, malformed Unicode and unknown caller fields are rejected. Plaintext links can be forged by a member, so the database relation is authoritative; a raw locator alone does not prove a parent relationship.

## Current reads and stable pagination

Every archive, thread, target and receipt read checks the current canonical actor's current membership in a currently visible Circle. Completion permits member wrap-up discussion. Departed members and outsiders cannot use a known message, parent, cursor or operation UUID as authority. Author contribution/withdrawal controls remain their separate existing surface; they do not grant after-leave archive access.

All responses are private and no-store. The new projection contains only message ID, posted display name, body or null, timestamp or null, caller-relative `is_mine`, current visibility, immediate parent ID and canonical root ID. It contains no member roster, author/member IDs, roles, meeting links, reports or reviewer identity.

- Archive pages return at most 25 messages, newest first by database `(created_at, id)`, with an explicit next cursor when more exist.
- A message permalink resolves its actual root and returns the current root, selected message and at most 25 descendants ordered oldest first. The selected message remains available even when it lies outside that bounded descendant page.
- Descendant pages retain immediate parent/root IDs. Following a parent permalink opens that exact parent's context instead of inventing a copied excerpt or silently changing the target.
- Cursors are message UUIDs resolved inside the same Circle, and inside the same canonical root for a thread. PostgreSQL compares the original microsecond timestamp and UUID; no browser millisecond conversion, offset or private timestamp payload is required. A thread cursor equal to the root starts the descendant list.
- Null legacy timestamps use a deterministic database sort key while remaining null in the response; no date is invented. Non-finite legacy dates, blank/overlong/control-containing legacy bodies become an explicit unavailable projection without exposing raw body or poisoning the rest of the page. Existing hidden/withdrawn precedence remains intact. Unavailable targets cannot receive a new reply.
- Each page is a fresh checked read, not a frozen inventory snapshot or an unread counter. New posts and moderation changes can occur between reads. An empty page or missing item is not proof that an earlier write was unsaved.

## HTTP contract

`GET /api/circles/{circleId}/discussion` accepts exactly one mode:

- No mode fields, optionally `before={messageUUID}` and `limit=1..25`: `{kind:'archive',circleId,items,nextCursor,limit}`.
- `message={messageUUID}`, optionally `after={messageUUID}` and `limit=1..25`: `{kind:'thread',circleId,root,focus,items,nextCursor,limit}`.
- Only `requestId={operationUUID}`: `{circleId,requestId,receipt:null|receipt}` for the current actor's operation.

Mixed modes, duplicate fields, unknown fields and malformed IDs are refused. Browser page URLs carry public Circle/message intent only; page cursors, comments, previews, confirmation and pending operation keys stay in memory. Pagination uses explicit checked page buttons. A sign-in return preserves validated Circle/message navigation intent, not private content or a posting authorization.

`POST .../discussion/preview` accepts exactly `{requestId,comment,parentMessageId}`, where the parent is null for a standalone post. It checks current access and, for a reply, the actual current visible parent. It returns the complete canonical body, content hash, target revision/hash, a consistency review key and comment allowance. It does not insert a message.

`POST .../discussion` accepts exactly `{requestId,comment,parentMessageId,expectedParentRevision,expectedParentHash,contentHash,reviewKey}`. Both expected-parent fields are null for a standalone post. The server regenerates the body, checks the account/Circle/request/body/parent-bound consistency key, reacquires canonical authentication, and invokes one atomic SQL operation. A review key is not a credential or proof of a human click. Canonical authentication and fresh SQL authorization remain mandatory.

Writes use the existing same-origin/Fetch-Metadata boundary, bounded streamed JSON and per-actor budgets. Known refusals describe the current attempt as not attempted; transport loss, malformed committed replies and unclassified post-dispatch errors remain unknown. Neither condition authorizes a new key automatically.

## Atomic posting and recovery

The new immutable receipt key is `(actor_member_id, request_id)` across Circles. Identity includes the Circle, canonical body, immediate parent and expected parent revision/hash. A changed display name does not create another operation; a changed identity under the same key conflicts. The receipt retains message/operation identity and payload hash, not another copy of raw content. It adds no member-account deletion foreign key.

Locks follow cohort, membership, target/message and safety-state order, consistent with existing leave, quarantine, review and withdrawal operations. New replies require a same-Circle visible parent with the exact reviewed revision/hash. A stale, held or unavailable parent refuses the new insert. Message insertion, immutable link and receipt commit together; a late failure rolls back all three.

Exact replay checks current Circle/member access, then the prior immutable receipt **before** requiring a fresh visible parent. This distinction allows recovery of a saved reply after its parent was withdrawn. The reply's own current visibility is projected on every receipt; hidden or withdrawn content is null even for its author. A current-attempt refusal never proves that an earlier lost-reply attempt failed to save.

The view keeps one immutable pending request and offers explicit receipt lookup or exact manual retry. Refused retries, failed/null receipt reads and malformed replies retain that key. There is no background retry, new-key retry, automatic post or restored private draft on focus. Account/activity retirement and unmount fence late replies and clear private page state. Reload loses the local recovery key; the user must inspect the Circle before composing another message.

## Review and release limits

The new tables have RLS, explicit browser/PUBLIC revocations and narrowly scoped service-role privileges. Functions use `SECURITY INVOKER`; user-editable metadata, local wallets, payment tier and body-supplied member IDs confer no authority. The design follows current [Supabase function security](https://supabase.com/docs/guides/database/functions), [Data API grants/RLS guidance](https://supabase.com/docs/guides/api/securing-your-api) and [PostgreSQL row-lock guidance](https://www.postgresql.org/docs/17/explicit-locking.html).

Local fixtures do not establish production PostgREST, real-account or native OS/device acceptance. iOS/Android/Quest may adopt the documented relation-aware contract after their separate account-authority integration; their source is not changed here. Existing plain clients retain readable reply text and the local parent locator. Retained safety evidence is not physical erasure, and the wider safety-retention policy remains unfinished.

The existing eight book editions, rights notices, passage verification, optional supporter billing and all production gates remain unchanged. No deploy, production data/security change, outreach, charge or live provider/account operation is part of this milestone.
