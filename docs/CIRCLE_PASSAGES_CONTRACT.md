# Circle passage posts: local candidate contract

This milestone adds an explicit way to post a human comment with a source passage or source-block link to an existing free Circle. It does not grant membership, create an account, generate commentary, call a provider, or establish native account authority. Reading the library remains public and free. Any currently visible Circle may reference any of the eight pinned editions; the reference does not claim that the Circle agreed that passage as a weekly assignment.

The SQL is an **unapplied draft**. No production database, grants, provider account, payment or deployment was changed. An authorized operator must review and apply `docs/sql/circle-passage-posts.sql` after the existing Circle migration and the reviewed Circle moderation, message moderation, participation and reading-program SQL. Missing prerequisites fail closed. Current SQL SHA256: `ba98df2276b22b8c69aa1f7a8471efb87b62ee3828c840299813de1ce3d566e9`.

## Source authority and integrity

The original ZIP archives, complete sanitized reader documents, assets, credits and full licenses in `content/great-books/` remain the reviewed source editions. Their manifests retain original archive hashes, reader hashes, edition identity and block-index version. This milestone does not rewrite those documents or derive text from a remote mutable database.

`scripts/index-passages.mjs` creates an offline derivative, `content/great-books/{bookId}/passages.json`, for each edition. It verifies the reader bytes/hash, exact edition ID and block count against the manifest and `lib/circles/reading-program-editions.json`, and checks that `data-reading-index` values are contiguous and zero-based. `lib/books/passage-indexes.json` pins each derivative's byte length and SHA256, document SHA256, metadata SHA256, exact edition ID and block count. The extraction version is `edition-block-text-v1`.

On every source resolution, `lib/books/passage-source.ts` verifies the current reader bytes, local index path containment, index byte length/hash, extraction version, exact edition and block inventory. It separately checks a hash of source title/author, translators, editors, illustrators, rights assessment, license URL/notice, edition notes and source URLs. A corrupt/unavailable file yields a generic 503; a requested changed edition yields 409. Positions from a different edition are never remapped.

The browser supplies coordinates, never authoritative quotation text, credits, source HTML or a destination URL. The server resolves those coordinates from the verified local index and formats the retained message itself. SQL defensively validates reference shape, exact known edition IDs and block bounds; it cannot read or verify filesystem source text. The server verification step is therefore mandatory even though the RPC is service-only.

## Exact text and reference rules

The reference has exactly these fields:

```ts
{
  version: 1,
  bookId: string,
  editionId: string,
  blockIndex: number,
  start: number | null,
  end: number | null
}
```

`blockIndex` identifies one genuine reading block. Quotation offsets are zero-based UTF-16 units in its canonical extracted text: `start` is inclusive and `end` exclusive. They must satisfy `0 <= start < end <= blockText.length`, remain within one block, include at most 600 UTF-16 units, and not split a surrogate pair. The selected slice must be nonempty and have no leading or trailing whitespace. Caller-supplied or pasted wording cannot replace that slice.

Canonical extraction normalizes CRLF/CR to LF. Outside preformatted blocks it folds source wrapping whitespace into spaces, retains explicit `<br>` line breaks and removes spaces around those line breaks. Preformatted blocks preserve internal whitespace after line-ending normalization. Outer block whitespace is trimmed. Punctuation and non-whitespace Unicode are not rewritten; no OCR, translation, AI reconstruction, summary or invented speaker label is used.

Both offsets must be null for a link-only reference. Blocks within tables, or blocks containing an image, equation/MathML, SVG or other non-text content, are link-only. Their visual or tabular information is not silently omitted and labelled an exact quotation. An empty/nonquotable block can still have a source-block locator.

The complete retained message is the trimmed human comment, followed by the canonical source quotation or explicit no-quotation label, source edition credits, one-based display block number and a generated local reader URL. Its total limit is 2,000 UTF-16 units, including credits and locator. The available comment length is calculated from the exact suffix, rather than truncating attribution or the source. Forbidden controls and malformed Unicode are rejected. The server regenerates the full body at preview and submission.

## HTTP and explicit confirmation

- Public `GET /api/great-books/passage?book=…&edition=…&block=…[&start=…&end=…]` resolves public coordinates only.
- Private `GET /api/circles/{circleId}/passages` checks current access without provisioning or posting.
- Private `POST /api/circles/{circleId}/passages/preview` accepts `{requestId, reference, comment}` and returns the exact body, source, content hash and account/Circle/request-bound review key. It does not save a message.
- Private `POST /api/circles/{circleId}/passages` accepts that same input plus `contentHash` and `reviewKey`. Unknown fields and caller authority fields are rejected. It verifies the source again, binds the exact reviewed body, reacquires canonical authentication, then invokes one atomic SQL operation.
- Private `GET /api/circles/{circleId}/passages?requestId=…` looks up only the current actor's exact operation. It does not initialize state or post anything.

Private responses use no-store headers and generic errors. Writes enforce same-origin browser requests, bounded streamed JSON and server budgets. The review key is a consistency binding, not authentication or authorization. The server derives the actor from the existing canonical authentication helper; body fields, local wallets, role metadata and public reader links confer no authority.

Reader passage links use `edition`, `passageBlock` and optional `passageStart`/`passageEnd`, separate from whole-session Circle reading context. A locator in an arbitrary plain-text message is only a hint. The UI must verify the canonical suffix against the public source resolver before labelling its quotation verified.

## Atomic receipts and current safety state

The service-only RPCs are:

```text
soe_circle_passage_access(p_actor, p_circle_id)
soe_circle_passage_receipt(p_actor, p_circle_id, p_request_id)
soe_circle_passage_post(p_actor, p_circle_id, p_request_id,
                        p_content, p_reference, p_member_name)
```

`circle_passage_post_receipts` has one immutable row per actor/request UUID across all Circles. It records the Circle, message ID, timestamp and canonical payload hash, without retaining a second raw body. Identity binds canonical content, reference and Circle; a later display-name change does not create another operation. A changed payload or Circle under the same key returns PT409. Different actors have independent keys.

Posting locks the cohort for update, then current membership, then the message. Read/access paths take the corresponding shared locks. This follows the existing leave, Circle hide, message review and withdrawal boundary. The existing text-post RPC performs the insert inside the same transaction. A late receipt failure, including a key race in another Circle, rolls back that new message. Completed Circles permit current-member wrap-up discussion.

All access, receipt reads and exact retries require the **current account's current membership in the currently visible Circle**. A departed actor is refused; a hidden Circle is unavailable. The original operation is not authorization to recover withheld raw text or bypass later access changes. No matching own receipt returns null only after a successful access check; null is not proof that a request still in flight cannot complete.

Confirmed responses contain the original message identity and current visibility. Hidden or withdrawn content is null, including for the author. The quote, credits and locator are inside immutable `seminar_messages.content`, so the existing content hash, assigned review evidence, fixed member tombstones, author contributions and irreversible author withdrawal already cover the entire post. No passage sidecar can remain visible after the message is withheld.

The new table has RLS, no browser grants, immutable receipt history and service-only `SECURITY INVOKER` functions. It adds no profile/member write privilege and no foreign key preventing member-account deletion. An actor UUID remains restricted receipt evidence after synthetic account deletion; deletion does not make the receipt accessible to another account.

## Lifecycle, rights and release limits

Posting requires separate source verification, current Circle access, human comment, full server preview and explicit confirmation. Drafts and pending request keys stay in page memory. Account/activity retirement clears private state. There is no background retry, automatic joining, message generation, credential storage or provider call. While an outcome is unknown, the view offers an exact-key receipt read or manual exact-payload retry. Reload clears local recovery state; the user must inspect the Circle before composing another message. Durable server receipts do not provide cross-device recovery of a key the client no longer has.

The inherited edition assessment is **public domain in the USA; outside-US rights not assessed**. Exact source/translation credits and the local full-reader link accompany the post. The full source notices and Project Gutenberg license remain in the retained reader and original archive; the parent reader exposes attribution and license links. This candidate adds no worldwide-rights clearance or finalized safety-evidence retention policy. Source policy references: <https://www.gutenberg.org/policy/license.html> and <https://www.gutenberg.org/policy/permission.html>.

The existing moderation SQL and text-only RPC definitions remain unchanged. Ordinary salon behavior is preserved; portable controllers, canonical auth and native/member-session sources are not edited. Local fixture results are not native-device acceptance, production migration approval, live use, payment or deployment proof. Any production application requires separate authorization, a reviewed restore/preflight, and release verification.

## Local verification

From the milestone root, run with provider credentials excluded from the process environment and external networking disabled from startup:

```sh
node --require ./scripts/deny-build-network.cjs --test tests/passage-post-db.test.mjs
node --require ./scripts/deny-build-network.cjs scripts/test-passage-postgres.mjs
```

The owned PGlite suite covers real SQL behavior and serialized outcomes. The independent PostgreSQL 17.11 runner uses only an already-cached official image, synthetic fixtures, no network, no published ports, a read-only root and tmpfs data; it observes actual backend lock waits and verifies owned-container removal. It does not pull images or call production/provider services. Raw logs, source hashes and teardown evidence are stored outside the candidate under `evidence/passage-post-db.*` and `evidence/passage-postgres.*`.
