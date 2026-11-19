# Circle participation HTTP contract

This candidate replaces sequential Circle creation, membership and RSVP writes with service-only PostgreSQL functions. Ordinary book salons retain their existing endpoints. Native and portable modules have not been changed.

## Reads

- `GET /api/circles/start`: authenticated hosting eligibility, including the active-host limit and the rolling creation budget. The response is `{canCreate,activeHosted,maxActiveHosted:3}`; a paginated list is not a quota count.
- `GET /api/circles/:id`: one consistent snapshot, parsed by `parseCircleDetail`. It exposes `revision`, caller-only `viewer`, authoritative `capabilities`, `ended`, public Circle fields, up to four remaining dates from the fixed twelve-week schedule, and `online_url` only for a current member of a visible online/hybrid Circle. It never returns a roster or creator/member identifiers.
- `GET /api/circles/:id/membership`: authenticated current member/creator management snapshot, independent of calendar or private-link configuration. `parseCircleManagement` returns `{kind:'management',circle:{id,title,hidden},revision,viewer,capabilities:{canLeave,canComplete}}`. Invalid legacy titles can be null. This response contains no schedule, ended claim or meeting URL. It supports a fresh confirmation before leave/completion even when full details correctly return 503. An unrelated actor receives 404.
- `GET /api/circles/mine?after=:uuid&limit=25`: authenticated current memberships and hosted Circles, ordered by UUID. The limit is 1–25. Use the returned `nextCursor`; hidden and ended owned records remain available, without a meeting URL or roster. Items are explicitly discriminated: `kind:'circle'` for a valid full header or `kind:'management'` for the minimal snapshot when legacy configuration prevents a full header. A damaged row cannot silently disappear or poison the entire page. Duplicate/invalid pagination parameters are refused.

Hidden detail is available only to a current member or creator. It contains no meeting dates or private URL, but permits leaving and creator completion where applicable. Hidden outsiders receive 404. A completed or date-ended Circle refuses joins and RSVP; current members retain conversation and leaving access when the Circle is visible. Creator authority survives leaving. Completion does not delete the conversation or members.

## Writes and explicit retry

All Circle writes require canonical authentication, same-origin browser requests, JSON within the actual 12,000-byte stream limit, and a UUID `requestId`. No body member ID, wallet, role or creator field supplies authority; unknown fields are refused. Bearer-only requests without browser Origin are supported; cross-site Origin or Fetch Metadata is refused.

- `POST /api/circles`: canonical `CircleInput` fields plus `requestId`. The database atomically creates the listing, creator membership and private URL. Three active hosted Circles and three new creations in a rolling 24 hours are enforced in SQL.
- `POST /api/circles/:id/join`, `/leave`, `/complete`: `{requestId,expectedRevision}`.
- `POST /api/circles/:id/rsvp`: `{requestId,expectedRevision,date,status}`, where status is `going` or `not_going` and date is one of the remaining twelve scheduled dates.
- Legacy `POST /api/book-salons/join` targeting a Circle additionally accepts matching `cohortId` and delegates to exactly the same protected join function. An unkeyed legacy Circle mutation returns 400. There is no sequential fallback. Ordinary salon joining remains unkeyed.

Obtain a fresh detail snapshot before showing an action confirmation. Keep one request key and the exact normalized payload for that operation. A delayed request with a stale revision receives 409, including a delayed leave after a later rejoin. An exact explicit retry uses the same key, payload and expected revision; it retrieves the original receipt without reapplying the action. Changing payload under the same key is a conflict.

Success is `{requestId,circleId,receipt,state,replayed}`. `receipt` is the immutable original event (`action,joined,completed,date,status`); `state` is the current revision, own membership/creator flags, visibility/completion/end flags and capabilities. A replayed old join can truthfully have `receipt.joined:true` and `state.isMember:false`. Refresh detail after any receipt before claiming current participation or showing a private link.

Dedicated Circle write errors with status 400/401/403/404/409/413/429 carry `outcome:not_attempted`. Known SQL refusals, missing function/schema/configuration and permission failures use a generic 503 without database details. A failed transport or malformed success confirmation after dispatch returns 503 with `outcome:unknown`; preserve the operation key and require a fresh read plus explicit same-request retry. Never automatically generate a new key or resend on an ambiguous result. The legacy shared bridge can retain its earlier generic error shape before classification/authentication. All responses are private and `no-store`.

The existing client/session/native modules are unchanged. Their Circle adapters must adopt this keyed revision contract before using these write endpoints. Public discovery remains bounded to the first 200 stable inventory rows, with explicit scope metadata; ended records within that set are excluded without claiming a full inventory search.

The existing lazy-client static inventory now checks these delegating routes and the membership helper, including canonical actor, origin/body/revision/key guards and the absence of a sequential REST fallback. G17 keeps its creation/private-link/RSVP invariants through a narrow RPC-boundary fixture; PostgreSQL integration tests provide the actual transaction and authorization proof.
