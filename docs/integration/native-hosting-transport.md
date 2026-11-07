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


## Member-bound salon admission candidate — 2026-11-07

The separate optional capability
`circleAdmissionPolicy: 'member-bound-circle-admission-v1'` now exposes
`admissionTransport` through the native ports, owned-auth wrapper and registered
account configuration. Older and unknown capabilities expose no admission port.
Other JavaScript lanes reject these routes before a native request is allocated.
The existing native member send method and generation/cancellation engine are
reused; there is no added credential, bridge method or storage namespace.

This port permits only compact canonical POST JSON, with no query or fragment,
to `/api/circles/<lowercase UUID>/` followed by `admission-access`,
`recipient-code`, `invitation-review`, `invitations`, `invitation-check`,
`join-invited`, `invitation-receipt` or `invitations/revoke`. The maximum body is
4,096 UTF-8 bytes. Canonical parsers bind the exact account, request, revision,
sharing consent and opaque code fields for the selected operation. Swift and
Kotlin independently validate the request shape and encoding. A shaped code
never establishes permission: current accounts, signatures, expiry, host role,
revisions, capacity and receipts remain server checks.

The native creation screen offers “Host approval required” only with this
capability. It explains that the listing stays public and that the host manages
video-room entry separately. Open creation omits the new optional field for
older bridges; private creation includes `admissionMode: 'host_approval'`.
The shared controller now retains that choice in review, known creation and
exact retry. Background/account/offline retirement clears unsent private
presentation, while an uncertain sent creation retains its original body under
the same controller and owner. No automatic resend is added.

Local verification passed 96 selected native policy/controller/auth/storage
regressions, one canonical route/SQL integration, the registered native app type
contract without emitting files, scoped lint, and the full web build/type check.
Three browser stories run the actual native creation component/controller with
explicit React Native, owner, bridge and HTTP doubles; iOS and Android platform
selections both cover private review, background retirement, stale callbacks and
one creation after a lost reply and deliberate exact retry. The third story
verifies older capability behavior. The database handlers and SQL are actual
candidate code. All fixture requests are synthetic and no provider is contacted.

All resident production Swift member sources compile together for an arm64 Mac
and execute 101 policy checks under an operating-system rule denying all network
access. This is not an iOS build, native network or Keychain acceptance test.
Kotlin is source-reviewed with static assertions only; no Android compiler,
SDK or JDK was installed. See `native-admission-verification.json` for source
bindings, exact commands and private receipt locations.

Incoming-code, sharing-consent, host approval, recipient review/join and receipt
recovery **screens/controllers remain unfinished on native and Quest**. The port
and creation UI are foundations for those flows, not evidence of a complete phone
invitation experience. Native signing/build/device checks, a physical Quest,
matching hosted backup/restore, privacy repairs and real provider sign-in/recovery
remain open. No migration, release, deployment or production access change occurred.
