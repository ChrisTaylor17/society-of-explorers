# Circle discovery integration

Updated 2026-11-04. The canonical source is the linked worktree `/Users/christaylor/Documents/Codex/soe-release`, branch `codex/soe-first-release`, backed by the existing Society of Explorers Git repository. This note verifies discovery integration only. It does not clear the combined product for production.

## Provenance and canonical changes

Discovery was imported from `/Users/christaylor/Documents/Codex/2026-11-03/soe-discovery-search/candidate`, an unsealed descendant of the sealed 1,233-file discussions candidate. The discussions parent manifest is `a9475d857e76c0423b882f8da3bd1dc070e2dcc54f19ce58f74676297b254248`; the account-authority contract is a separate security model, not this application.

Both new SQL files and the six frozen SQL/generator/database verification files were independently compared with the draft freeze. Their bytes match. The discovery route, browser, page and pure metadata/page contracts also matched at import. [Import comparisons](../../verification/web/evidence/discovery-canonical-import.json) record the complete sampled hashes.

| Unapplied SQL | SHA256 |
|---|---|
| `docs/sql/circle-discovery-unicode.sql` | `a0d3ff3996dc59e92adf879006de1abf8d56713d705a181975f344aa390d6550` |
| `docs/sql/circle-discovery-search.sql` | `aa665d3f8afa2212efc468931d43df2fe8e297fb5d94970f0dda3fc79c83233a` |

One canonical product fix intentionally differs from the preserved draft: `discovery-server.ts` now preserves a leading UTF-8 BOM during cursor decoding, so JSON parsing rejects those noncanonical bytes. The actual HTTP regression verifies ordinary continuation succeeds, BOM-prefixed continuation returns 400, and the rejected request does not reach SQL. The draft remains untouched.

The canonical verification harness also has explicit test-only `server-only` shims in its module loader and security fakes. These let the offline runners import actual server modules; they do not disable production module boundaries.

## Public search contract

`GET /api/circles` uses one service-only `soe_circle_discovery_search` statement. It no longer takes 200 arbitrary rows and filters that subset. Eligibility, matching, current membership counts, ordering and a page of at most 25 results share a statement snapshot. The read creates no member, membership, message, receipt, cached directory or profile update. POST creation retains its existing keyed participation transaction.

Accepted query parameters are unique `q` (at most 160 UTF-16 units), `city` (80), `format` (`in_person` or `online`, or empty), `open` (`0`/`1`), `sort` (`next`/`title`), exact `book`/`edition`, optional valid `from`/`to` reading hints, `limit` (1–25, default 25), and `cursor` (at most 4,096 base64url characters). Duplicate, unknown, partial or malformed parameters return 400; they do not silently broaden the search.

All normalized keyword terms must match literally across the public title, description, masked host label, current starter reading or exact edition metadata and current session label. City terms search city/region separately. Unicode normalization is NFKD, removal of all General Category M marks, then en-US whole-string lowercase, including contextual Greek Sigma. Wildcards, regular expressions and SQL syntax are ordinary text. Hybrid Circles match either participation format. Open seats use current membership counts; joining still rechecks current authority and capacity.

Only visible, well-configured forming/active Circles with finite supported calendars are eligible. Completed, ended, hidden, malformed, missing-start and incomplete online configurations are excluded. A book program has its actual 1–12 sessions; a starter path has twelve. The final local calendar day remains eligible all day, matching the existing participation contract. No date is inferred from creation time. Source-range hints preserve intent for the next action; they do not assert that a Circle covers that passage.

Results expose a whitelist of public display fields. They omit creator/member identifiers, private meeting links, rosters, reporter identities and moderation payloads. A host email, control-character name or empty label becomes `An explorer`; otherwise the public label is clipped without splitting a surrogate pair to 40 UTF-16 units. Search uses that same masked label, never its omitted suffix. Book metadata comes from the existing reading catalog; this work imports no clips or additional book text and grants no new content rights.

## Ordering, continuation and consistency

Ascending order is `(next meeting, folded title, UUID)` or `(folded title, UUID)`. SQL uses explicit UTF-16 ordering to match JavaScript for astral characters. Continuation contains the last actual tuple, so it does not require an anchor row to remain present or unchanged.

The unsigned public cursor binds canonical filters, page limit, catalog identity, generated Unicode-data identity and the local dates in all nine supported timezones. It is a consistency hint, not an identity credential or membership grant. Filter/limit mismatch returns 400; changed catalog/profile/calendar requires explicit 409 restart. No total inventory count is claimed.

Each page is a fresh live snapshot. Changes to schedules, titles, visibility or seats between requests can change later pages; this is not a frozen multi-request export. Browser Next/First controls, share URLs and Back/Forward retain the result-page intent. Applying new filters clears old rows immediately and fences late responses. Errors offer an explicit retry; a changed calendar offers an explicit restart retaining filters.

## Fresh canonical verification

[Canonical targeted proof](../../verification/web/evidence/discovery-canonical-tests.json) records 24 pure contract cases and 13 actual-route/SQL HTTP cases. The HTTP cases execute the canonical route, adapter, projection and actual SQL in a disposable PGlite database. Identity and the PostgREST transport are synthetic. The network guard is installed before imports; only an explicit clean environment is passed.

Run from `verification/web` (the drivers resolve `../..` directly; no recursive app-root symlink is used):

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./scripts/deny-build-network.cjs --test tests/discovery-contract.test.mjs
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./scripts/deny-build-network.cjs --test tests/discovery-http.test.mjs
```

The canonical build and browser verification are tracked by the release owner. The historical results below do not substitute for those runs after authentication and platform reconciliation.

## Historical draft evidence, retained separately

[Imported report origins](../../verification/web/evidence/imported-discovery/ORIGIN.json) preserve source paths and copied report hashes. These reports describe the draft, not fresh canonical executions:

- [Offline Next webpack build](../../verification/web/evidence/imported-discovery/next-build.json): exit 0, 68.49 seconds, external network blocked, invalid public placeholders and no issued/provider credentials. This was a local build, not deployment.
- [Six Chromium browser stories](../../verification/web/evidence/imported-discovery/browser-discovery-qa.json), completed 2026-11-04 12:58 UTC: 34 eligible Circles beyond 205 ended rows; literal/accent-folded search and stable ties; reload/share/Back/Forward continuation; exact edition/range and Start/Clear intent; late-response fencing after filter changes; real SQL-backed 503 retry and 409 calendar restart with keyboard focus. The report binds the three UI/page source hashes, records build ID `H63N8HdhDHeGw3A1baGZa`, and verifies its owned server stopped. It does not prove canonical authentication or physical-device acceptance.
- [PGlite database suite](../../verification/web/evidence/imported-discovery/discovery-db-tests.json): 17/17 passed, including all 1,112,063 valid non-NUL Unicode scalars, contextual casing, UTF-16 order, malformed calendars, literal public search, seat counts, continuation, grants and inherited-function preservation. UTF-8 bytes avoid PGlite's scalar decoder dropping a leading BOM. The SQL profile was also [regenerated identically by Node and Bun](../../verification/web/evidence/imported-discovery/discovery-unicode-runtime-parity.json).
- [Actual PostgreSQL 17.11](../../verification/web/evidence/imported-discovery/discovery-postgres.json): 6/6 passed on the exact frozen SQL; all 1,000 live Circles were reached across 40 pages despite 205 stale groups. Reads changed no membership/message/receipt counts, uncommitted hide state did not leak or block readers, and browser/profile permissions remained denied. Query measurements were 185ms unfiltered, 688ms keyword, 241ms city and 8ms format rejection, below a 2-second local regression budget. The network-none, read-only-root container was removed and its cached image preserved. The shared Colima VM was resumed and left running.

These are bounded synthetic measurements, not concurrent-user capacity tests, larger-inventory guarantees, production-schema evidence or adoption. Search evaluates the eligible inventory before limiting output; growth beyond the measured cardinality requires representative query plans and load verification.

## Unopened production gates

No production SQL has been applied, remote grants/RLS changed, provider contacted or deployment performed by this integration. Missing discovery schema returns an explicit unavailable/opening-soon state, not a false empty directory.

Before release, review the complete existing production schema and ordered prerequisites, then obtain authorization for applying the two new SQL files and verify service-only execution plus the real PostgREST result. Validate the target server runtime: the application currently accepts only Unicode 17.0 with ICU 78.1 or 78.2, matching the fully compared profiles. A hosted runtime mismatch deliberately fails closed; changing the runtime requires regeneration and semantic comparison, not removal of that guard.

Complete canonical build/browser checks and the wider sign-in, moderation, rights/territory and available-device release gates separately. Existing discovery proof does not establish licensed clips, native account authority, Quest acceptance or a released unified product.
