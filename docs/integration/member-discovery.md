# Published-profile people finder

The member page previously sent a free-text query and the signed-in member's profile to `/api/match`, which expects a different projection structure. The server rejected that request, and the page could describe the failure as no matches. The first-release page now offers **Find people**: a local keyword search over freshly retrieved, explicitly published community profiles. It never sends the query or an owner profile to a model or matching endpoint.

This is a deliberate first-release scope decision, not proof that the other matching prototypes work. The owner was offered a choice between published-profile discovery and a separately reviewed optional questionnaire. No reply had arrived when this reversible implementation proceeded with the recommended published-profile approach. The broader matching vision remains in the research plan.

## Product and authority

- The existing directory route verifies the actual signed-in member and community membership before reading other profiles. It filters publication before selecting the 50 newest community members. Private profiles do not consume those 50 places.
- The finder supplies its displayed member ID as a comparison only. A different authenticated account receives a refusal before the community is read. The response binds the confirmed account; the page validates that binding and the exact eight-field public DTO before using results. The optional request header preserves existing directory callers; it does not authorize them.
- Search words remain in browser memory. Case and accent folding, skill punctuation and word prefixes support simple searches. Results explain the fields and words found, ordered by distinct query words matched and then name. They are not personality, faith, trust or compatibility assessments.
- No matching words, no other published profiles and an unavailable directory are distinct states. A ten-second whole-operation timer retires unfinished work. Query changes, backgrounding, unmounting and account-change notifications retire stale results. A late response cannot replace a new search or revive a timed-out operation.
- A full published-profile navigation rechecks publication. The finder itself refreshes publication on each search; it does not provide continuous revocation of information already displayed. Opening a conversation selects the existing member chat; it does not send a message. Existing messaging eligibility/block rules remain separate.
- The limit of 50 profiles is disclosed in the expandable explanation. This is a bounded pilot finder, not a search of the entire community or a semantic/recommendation service.

## Four retained matching families

| Existing implementation | Observed mechanism | Unresolved issue |
| --- | --- | --- |
| `app/api/match/route.ts`, `20260517_consented_match_projections.sql` | Fixed weighted projection/vector comparisons; no model call | The inspected app/lib/docs/scripts contain no complete member review, publication and withdrawal flow for those projections. A table name containing “consented” is not consent evidence. |
| `lib/matching/index.ts` | Community vector matching includes answer string length modulo seven | No evidence found validating those values as ideology or interpersonal compatibility. |
| `app/api/match/generate/route.ts`, `app/match/page.tsx` | A separate shared-question/response workflow | Consent, access boundaries and the value of the conversation invitation need their own review. |
| `lib/world/frequency.ts`, `app/api/world/match/route.ts` | Biometric/activity-derived focus, coherence and participation measures | No evidence found validating these inputs or labels as personal compatibility; sensitive-data handling is a separate gate. |

These are bounded code observations, not an exhaustive historical search or scientific validation. The older endpoints, tables and separate interfaces are preserved. This change does not certify or enable them for the pilot. The retained November 8 hosted catalog also shows unresolved direct-table access; a safe directory DTO cannot repair that database boundary.

## Verification

The [verification receipt](member-discovery-verification.json) binds the changed product and test files to the exact starting source archive. Twenty-six focused Node tests cover keyword/DTO behavior, actual publication/directory handlers and direct-message HTTP regression. Thirteen mutation-based guard tests and all 73 static checks pass. The full offline Next build/type check passes with 1,229 product inputs; scoped lint passes.

Eight compiled-browser stories cover keyboard search, 390/320-pixel layouts and enlarged text, disclosed limits, valid empty states, publication withdrawal, failure/malformed/mismatched-account responses, stale query replies, stalled directory and sign-in requests, backgrounding, account changes and the conversation handoff. Final screenshots were inspected. Both owned app previews and browsers were stopped; no external browser request or paid provider call occurred.

The browser uses real compiled page code, actual auth/directory handlers and synthetic signed identities. FakeDb and an explicit relation-join adapter supply database transport; wallet-session access is mocked and the account-erasure gate is disabled in that fixture. The unread/thread fixture does not demonstrate DM delivery. These tests do not establish hosted PostgREST/RLS, a real provider login, a physical phone or user demand. An initial browser setup omitted the proxy's cookie hint; that failed run is retained. The setup was corrected without weakening the application gate.

## Release and rollback

No schema, credential, permission, deployment or paid service changed. The work is local. Preserve the coherent hosted backup/restore and access-remediation requirements before real-member acceptance. Test the actual publication controls, both supported sign-in methods, community membership, withdrawal and messaging eligibility through the hosted stack after those gates are cleared.

Roll back the scoped finder/page/route changes together to the prior application revision if necessary. There are no finder database records to remove. The prior member matching UI was already broken; restoring it is not an acceptable release outcome. Keep deeper scored matching outside the pilot until its specific consent, withdrawal, validation and access requirements are reviewed.
