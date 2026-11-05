# Native reviewed Circle attendance

The optional native capability `attendancePolicy: 'circle-rsvp-v1'` exposes
`attendanceTransport` through the native member ports, owned-auth composition and
`ExistingMemberAccountConfig`. An older bridge without this exact capability
keeps its existing routes and does not offer attendance writes. The Android
adapter forwards the capability through the existing generation-bound `send`
method; it does not create a second account or storage lifetime.

The attendance lane accepts only `POST /api/circles/<lowercase UUID>/rsvp` without
a query. It requires a single explicit bearer, JSON content type, omitted
credentials, rejected redirects and no caching. Its body is at most 256 UTF-8
bytes and is the exact compact serialization of the canonical membership parser:

```json
{"expectedMemberId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","requestId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","expectedRevision":0,"date":"2028-02-29","status":"going"}
```

Both IDs must be canonical lowercase UUIDs. The revision is a nonnegative safe
integer; the date must be a real calendar day. `going` and `not_going` are the
only responses. Not going is an explicit response, not deletion or a record of
actual attendance. Missing or extra fields, reordered or noncanonical JSON,
duplicate keys, query parameters, other methods and alternate destinations are
rejected before native request allocation. The ordinary member, profile,
saved-reading and anonymous transports do not accept this route. Public Circle
discovery and source passage requests retain their separate anonymous lanes.

`createCircleDirectory` requires both the optional lane and a canonical current
`memberId` before offering attendance. Selecting a response performs a fresh
private detail read and reviews that meeting's date, response, prior response
and current revision. The Circle title, time and timezone are presentation
snapshots from that same read. They grant no authority. A membership-only
fallback does not expose attendance. Ordinary navigation and other intentions
pause during review; Cancel returns to the checked detail without sending.

Confirmation pins the full body and one native request ID. An unconfirmed reply
retains only that exact request for deliberate retry; it never sends again
automatically. A refusal of a retry does not prove the original failed. The
owner-aware receipt must match the Circle, request, member, meeting and response
and advance beyond the reviewed revision. After acceptance, a separate fresh
detail read establishes current state. A replay's historical response cannot
override a later response in the displayed current state.

Every new accepted RSVP request ID consumes a revision, even when the selected
response is already current. An exact replay consumes no further revision. This
server rule prevents a delayed older request from changing a later explicitly
confirmed response. The portable controller tests use a synthetic CAS oracle;
the backend and composed proofs separately exercise the actual route and SQL.

Account change, background, offline, disconnect and explicit Close retire the
Directory's private detail, review and local retry information. They abort local
delivery but cannot cancel an already accepted server request. Resuming requires
fresh explicit checks. No durable retry recovery across those boundaries is
claimed. Native account generation reset additionally retires queued requests
and retained response readers; the owned-auth wrapper retires the optional lane
with the other account ports.

Verification is recorded in `platforms/evidence/native-attendance-policy.json`
and `platforms/evidence/native-attendance-controller.json`. The focused native
policy suite has 13 executable JavaScript tests using synthetic native primitives
and one explicitly static Kotlin source test. Prior transport assertions remain
unchanged. The controller suite adds 35 focused cases alongside the existing 26
Directory cases. All commands use the cached runtime with an empty environment
and network denial at process startup. Kotlin compilation, device behavior,
provider acceptance and production migration execution remain unverified by
these local checks.
