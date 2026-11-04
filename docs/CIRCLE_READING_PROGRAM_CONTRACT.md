# Circle reading programs

This is an unapplied local implementation candidate, built on the complete
`soe-participation` source. It does not establish deployment, production schema,
real account/session acceptance, mobile support, adoption or revenue.

## A Circle remains a Circle

`book_cohorts.book_id` stays `soe-circles-path`. That sentinel protects the
existing listing, membership, discussion and moderation boundaries. A book
program never changes a Circle into an ordinary salon. Existing auth, session,
portable discussion controllers, author withdrawal and human moderation stay
unchanged.

Apply `docs/sql/circle-reading-programs.sql` only after the reviewed participation
and both earlier moderation SQL candidates in an authorized isolated restore.
The new file is a transaction, not an automatically applied migration. No browser
grants or policies are added. New functions are service-only SECURITY INVOKER.

## Optional creation input

`POST /api/circles` keeps its canonical actor, same-origin/body bounds, UUID
`requestId`, atomic transaction, quotas and exact-request receipt. It accepts
one additional optional field:

```json
{
  "readingProgram": {
    "version": 1,
    "bookId": "hamlet",
    "editionId": "pg-1524-6bcc78cc0b21d3130b1a267990dd41b78f17785eeb089da3c5c9aa4eaac82825",
    "sessions": [{ "from": 35, "to": 150 }, { "from": 151, "to": 300 }]
  }
}
```

This illustrates a range, not an editorial chapter assignment. Positions are
inclusive and zero-based in the exact source document's reading index. The UI
shows one-based reading positions and actual source heading labels. Only the
eight pinned book/edition pairs and their real block bounds are accepted.
Objects accept exactly their declared keys; integer ranges satisfy
`0 <= from <= to < blockCount`; plans contain 1–12 sessions. Hosts can choose
excerpts, leave gaps and revisit earlier sections. No full-book coverage claim
is inferred. The plan and path cannot be changed or cleared after creation.

Omit `readingProgram` entirely to retain the existing `starter-12` program and
the original receipt payload. Explicit JSON null is rejected. New book programs
store `circle_path_id='book-v1'` and `circle_reading_program` atomically with the
Circle, host membership, private meeting link and receipt. Unknown paths,
malformed programs and changed edition pins never fall back to starter12.

Before a new book request reaches the RPC, the server verifies the actual local
edition document and its pinned contents metadata. If the source is unavailable,
the request refuses; it does not use a cached partial book or fetch a new edition.
An exact SQL replay returns the original event and current state without another
creation. If source verification prevents a browser retry, My Circles and the
known Circle ID remain the ways to check a possibly committed earlier request.

## Public projections and calendar

Public listings, detail and normal My Circles items add two fields inside
`circle`: `reading_program` (validated program or null for starter12) and
`program_length` (its session count or12 for starter12). Existing starter
`reading` fields remain; book programs use `reading:null`, preventing a misleading
starter-week link. Every planned reading is available in the explicit program.

The first meeting is still the configured weekday on or after startDate. The
calendar has exactly program_length weekly dates. Join/RSVP and hosted limits
use the actual final date. A one-meeting program does not advertise eleven
invented future meetings. Completion remains terminal for new admission; current
members can wrap up discussion, leave and withdraw their own posts. Management
reads still permit departure/completion when full configuration is unavailable.

No program includes a private video link, member identifier, quotation, draft,
bookmark, attendance record or arbitrary URL. Existing private access checks
remain authoritative for participation and discussion.

## Public links and reader agreement

Discovery/start context uses `book`, `edition`, `from`, `to`. Discovery also
accepts just a valid book+edition pair. Ranges are a public host-planning hint:
results match the book and edition, not necessarily the hinted range. Partial,
duplicate, forged or changed context is rejected explicitly, without silently
broadening results. Filters, manual retry, reload, history and start links retain
valid context. The existing bounded first200-listing scope remains explicit.

Reader links use `/great-books/:bookId?edition=...&from=...&to=...&circle=UUID`.
The Circle ID is optional. A Circle-linked range is described as agreed and
opened only after a fresh actual Circle read verifies that exact edition and
one of its exact stored sessions. The read omits browser credentials and stores
only the public title and agreement status. Unavailable, hidden, mismatched or
late replies cannot supply agreement or a reading jump. The complete source,
credits and license remain available; no excerpt replaces the full document.

Reader and creation sign-in/signup destinations retain this validated public
context through the unchanged safe-next helper. This is return-path validation,
not proof of a real provider login or mobile member-session integration.

Only starter weeks2 and5 have explicit local bindings: Jowett's Apology and
Casaubon's Meditations Books1–2. Their boundaries come from the actual pinned
headings. Other starter readings keep their external source links and are not
claimed to be locally available. The path pages no longer assert that the eight
edition assessments clear all external sources or worldwide rights.

## User control and remaining work

Creation still requires a current hosting check, explicit edition verification,
an editable plan, fresh review, confirmation and manual exact retry after an
uncertain reply. Identity/lifecycle retirement clears the program draft with the
other private creation state; no request automatically resends. Reading or
following a context link creates no membership, RSVP, post, bookmark or generation.

The eight source archives, documents, assets, notices, credits and US-specific
rights assessments are unchanged. Rights outside the US remain unassessed.
Distributed rate limits, reviewer coverage, retention policy, live auth/backend
clearance, native iOS/Android/Quest acceptance, deployment and a verified
sustainable paid offer remain separate unfinished work.
