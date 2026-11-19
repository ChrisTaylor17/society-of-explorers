# Ordinary book-salon discovery

8 November 2026. Local work based on `36c7458f77ff18e1d24fbf823913881e89e87ec3`; no deployment or hosted database change.

## Product finding

The public book-salon page previously waited for a private account/token lookup before fetching an anonymous-readable list. It ignored failed responses and displayed missing data as “No salons yet.” Cards could invent eight seats, zero members, a forming status or Socrates as the leader. A UTC timestamp could display the previous calendar day in a western time zone. Populated cards also had a rigid horizontal layout that had not been covered by the prior empty-list phone checks.

These are consequential distinctions for SoE's first offer. Ordinary book-salon discussions are public; the newer Circle discussion has a separate current-member contract. Neither an optional historical AI perspective nor a listing proves that a human host or meeting is confirmed. The page now names those distinctions and links to online Circle discovery and the separate four-week fellowship plan. It preserves the ordinary public book groups as part of the broader site.

## Local behavior

Discovery now makes cookie-free public requests without waiting for private sign-in. The endpoint selects an explicit public projection and documented embedded membership counts, orders by creation time and ID, and returns 50 rows per page with exact count and next-offset metadata. It no longer retrieves individual membership IDs just to count them. Invalid page input is rejected before creating a database client. Query failures, unavailable counts, invalid records and exceptions produce a generic private/no-store error, not an empty success.

The browser validates the page envelope, row fields, identifiers and pagination. It distinguishes loading, failure and confirmed emptiness; it can load more pages and retry the same failed page. A later-page failure keeps the earlier rows with an explicit notice. Refresh replaces the result; duplicate IDs across pages are merged. Offset pagination is not a snapshot: intervening inserts, deletions or updates can move rows between requests, so refresh is the way to obtain a new current listing. The number shown describes the displayed rows, not membership or market traction.

Reads abort after ten seconds. A generation guard prevents delayed completion from replacing a newer result or updating an unmounted page. Unknown capacity, date, status and AI perspective stay unknown. Start dates display their recorded calendar day and include the year. Cards wrap on narrow screens, allow long titles to break, and give discussion links a minimum 44-pixel touch target. Without JavaScript, the public invitation and plan/library links remain readable, and the listing limitation is explicit.

The current [Supabase select guidance](https://supabase.com/docs/reference/javascript/select) documents the referenced-table `count` form used here; [range](https://supabase.com/docs/reference/javascript/using-modifiers-range) is inclusive and follows the query order. [PostgREST's aggregate reference](https://docs.postgrest.org/en/stable/references/api/aggregate_functions.html) distinguishes this supported legacy `count` syntax from newer aggregate functions and warns that it may be deprecated in the future. No dependency upgrade, aggregate setting, schema or grant was changed. Actual hosted gateway/version/configuration acceptance remains required.

## Verification and preservation

See [the exact local verification](book-salon-discovery-verification.json). The fixture uses the actual GET handler and locked Supabase client over the existing disposable PostgreSQL schema and service role. A bounded transport adapter models only this query; it is not hosted PostgREST/RLS acceptance. Cases cover ordinary-versus-Circle classification, a 61-group pagination boundary, valid zero/empty results, missing counts, malformed rows, exceptions, invalid offsets, safe projection, unknown metadata and envelope consistency.

The final 1,241-input build/type check and scoped lint pass. Six route/SDK/disposable-SQL cases and nine compiled discovery stories pass; four actual compiled loopback requests verify unavailable/invalid-page refusals and private/no-store headers. Six existing creation stories, eight salon journeys and five matching-navigation stories also pass, including nine existing matching HTTP refusals. The three older browser listing fixtures now use the paging envelope. All owned servers stopped, ports closed and source/build/runtime checks match. The lowest sampled free storage was 15.65 GB; no installation, cleanup or spending was required.

The compiled browser checks use fictional groups and actual source/SDK/disposable-SQL reads, with explicit account-refusal and malformed/held-response fixtures. Existing creation regression still exercises its actual handler and transactional SQL with synthetic identity and a documented listing adapter. No browser creation/join request reaches a hosted service. Retained initial failures are identified in the verification receipt; none is presented as a passing run.

The creation POST handler, join endpoint, account-auth helper and creation SQL are unchanged. Page creation/join function bodies are also preserved. Their broader browser account/draft retirement and join-result behavior still need a separate review; this is discovery acceptance only. In particular, public-list success does not confirm the current person's membership, and the old join UI still needs an owned receipt/error contract. Hosted recovery, private-data repair, real sign-in, the actual host and device acceptance remain release gates.

## Rollback

Subsequent [account-lifecycle work](book-salon-account-lifecycle.md) corrects the private form and join-result limitations above. It preserves this public discovery implementation and the creation/join POST bodies, while adding an authenticated current-membership GET. Its verification and remaining browser-reload limitations are recorded separately.

This is a source-only change. Revert the page, GET handler and two discovery modules together, preserving the existing POST/SQL work and all stored groups. No data migration or backfill was introduced. Restoring the old discovery path restores its misleading failure/metadata behavior; it is not a recommended release fallback. Unknown future clients must be checked against the new paging envelope before deployment. The reviewed app/native/Quest source has only this page as a collection-list consumer; discussion and Circle clients use separate endpoints.
