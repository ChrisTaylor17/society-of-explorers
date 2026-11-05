# Native Circle creation and host completion

The optional capability `hostingPolicy: 'circle-host-v1'` exposes two independent
ports through `createNativeMemberPorts`, owned-auth composition and
`ExistingMemberAccountConfig`. Older bridges keep their existing routes and
receive neither port. No native bridge method, account or storage namespace is
added.

| Port | Exact requests | Credentials and bounds |
| --- | --- | --- |
| `hostingTransport` | `GET /api/circles/start`; `POST /api/circles`; `POST /api/circles/<lowercase UUID>/complete` | One explicit bearer; JSON for POST; no query. Create body at most 12,000 UTF-8 bytes, completion at most 160. |
| `editionTransport` | `GET /api/great-books/text/<catalog slug>` for the eight pinned books | No headers, bearer, cookies, body or query. Requires native `sendPublic`. |

Both ports require omitted credentials, rejected redirects and no caching.
The member, profile, attendance, saved-reading, discovery and passage lanes
continue to reject these new requests. Native generation, bounded response,
request-handle allocation, cancellation and single-transmission rules are shared
with the existing native engine. Auth retirement also retires responses already
returned from both optional ports. There is no automatic retry.

Private POST bodies are the exact compact serialization of the canonical
`lib/circles/hosting.ts` parsers. Creation binds a lowercase `expectedMemberId`
and `requestId` to the full normalized listing: title, description, format, city,
region, venue name/type, weekday, time, timezone, start date, maximum members,
private online URL, and optional pinned reading program. The program contains
1–12 inclusive zero-based ranges. Completion binds the same owner and request
key to a safe nonnegative `expectedRevision`. Extra or missing fields,
coercions, duplicate keys, alternate field order/JSON encoding, unknown books,
changed edition pins and out-of-range reading positions are refused before
native allocation. Historical normalized dates remain wire-valid for deliberate
exact replay; current eligibility and first-attempt date rules are checked by
product review and the canonical server.

The Android Kotlin source independently checks the bounded canonical wire,
known catalog slugs and structural edition/range bounds. Exact current edition
pins and real block counts are checked by shared JavaScript and server parsers.
Kotlin policy checks here are source assertions only; they are not compilation,
device or native HTTP execution evidence.

`createCircleHosting` starts inert. A verified provider subject and owner-aware
hosting-access response are checked before preparing a review, sending a first
creation, or recovering a sent request. Current quota can block a new creation;
it cannot establish whether an earlier request failed. Custom programs require
a fresh anonymous metadata response matching the local pinned edition and
contents. The normalized listing and checkbox are reviewed before one native
request key is allocated and sent.

A lost, malformed or unconfirmed creation reply retains the exact body, owner
and key privately. Ordinary navigation and new drafts are paused. Explicit
retry first checks the same owner, presents the original listing again and
requires confirmation. It uses the original date and key even if the current
quota or calendar changed. A refused retry remains uncertain. A successful
owner-bound receipt is distinct from current detail: another private GET must
verify current host access at or beyond the receipt revision. A failed readback
keeps the creation known but does not enable another draft. `checkCreated()` can
manually repeat that read; `startAnother()` requires known creation and verified
current access and performs no request itself.

Temporary inactivity, offline state, account notification or disconnect hides
all private presentation and aborts local delivery. A sent creation and its
exact retry remain only in the same retained controller. Recovery requires
fresh subject/member checks. A proven different subject/member or terminal
Close discards recovery with a may-have-created notice. No durable recovery
across app termination, device reset or a new controller is claimed; cancellation
of local delivery never proves server cancellation.

Directory completion uses the optional hosting port and canonical member ID.
It first reads fresh detail, or self-only management controls when a Circle is
hidden or its meeting details are unavailable. A host can complete after leaving.
Review freezes ordinary navigation; confirmation pins the exact owner/key/CAS
body. Unknown completion uses deliberate exact retry; refusal of a retry does
not settle the original. A matching receipt is followed by fresh current state.
Completion permits a receipt at the reviewed revision; join, leave and RSVP
require a greater revision under the current server intent contract. Completion
closes new joins and RSVPs while preserving permitted discussion and leaving;
it does not transfer hosting responsibility. Directory lifecycle retirement
continues to discard its local pending change with an explicit uncertainty
notice, unlike the retained creation controller.

Focused controller and policy results, commands, selected source hashes and
limits are recorded in `platforms/evidence/native-hosting-controller.json` and
`platforms/evidence/native-hosting-policy.json`. These local tests use synthetic
transport/native primitives and the cached runtime with an empty environment and
network denial at startup. Actual canonical HTTP/SQL and composed browser
proofs are separate. No provider acceptance, production migration, Android/iOS
build or physical-device verification is asserted here.
