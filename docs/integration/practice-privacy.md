# Daily Practice privacy

On November 5, the production catalog showed effective SELECT, INSERT, UPDATE and DELETE for both browser roles on daily questions, practice answers, AI reflections and matched conversations. Each table had RLS enabled with one unrestricted policy applying to PUBLIC. The legacy reflection publication flag defaulted to true. Catalog evidence describes authority. The reproductions use synthetic records. [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api) · [Verification](practice-privacy-verification.json)

## Local release candidate

- Feed shows the latest stored question up through the current Eastern date, with links to Daily Practice, Clips and Circles. Public answer and reflection collections, member activity counts and the leaderboard were removed from this page. Its share preview uses static copy.
- Daily Practice saves under the verified current author and opens that author's saved answer and matching historical reflection. An old reflection with no recorded member can still be read through its verified parent answer and question. The legacy public answer APIs return HTTP 410.
- The browser includes the expected author with a save. A different current account causes the server to stop before storage access. An account change retires pending responses and clears the private view. An interrupted request may have committed, so the author can reopen Practice to check the saved entry.
- Saving skips automatic AI reflection. The generation endpoint is disabled by default. A missing daily prompt uses the local question bank. Matching uses shared question IDs and three general prompts, keeping answer text out of that flow. Members can separately share a thought in a Circle.

The SQL draft locks the four exact tables for a bounded transaction. It changes the four reviewed policies from PUBLIC to service_role, removes browser table and column grants and checks both effective browser denial and retained service CRUD. Unknown policy, ownership or role authority aborts the operation. It preserves existing records, constraints and defaults. [SQL draft](../sql/practice-data-containment-apply.sql)

## Deployment scope

The follow-up audit retrieved the full older file index, the active Practice implementation chunks and the exhibition’s route configuration. The member homepage answered signed-out requests on one alias. The other three aliases and all 40 generated URLs redirected to Vercel sign-in. The branded site separately holds Login, Dashboard, Feed and Movement. The reachable upload contains three service-backed answer readers, so the planned browser grant changes require the matching app replacement. [Route audit and combined rehearsal](production-route-closure-2026-11-05.md)

For an approved cutover, restore the owner-held production export on an isolated target and include all four Practice tables. Review legacy data integrity given the open write authority. Coordinate database containment with replacement or isolation of the old app routes and reachable deployment hosts. An old service-backed endpoint can still read rows after browser grants are removed. Verify direct browser denial, public prompt rendering, signed-out response behavior and an author's save and reload before opening traffic. A rollback decision must preserve the privacy boundary.

## Verification

Five disposable database cases and eight API cases passed. The API suite runs the actual handlers and Supabase SDK through a test adapter into disposable PostgreSQL. Six browser stories passed against the guarded built app with synthetic identity. The run checked both old answer endpoints, a save and reload, an account mismatch, a late save receipt and the 320px feed. The test recorded zero provider calls.

A separate native PostgreSQL 17.11 rehearsal restored the synthetic archive, reproduced an independent lock timeout, and verified unchanged rows and permissions after the timeout. Applying afterward denied both browser roles and preserved service reads on all four tables. That native fixture substitutes a numeric array for the vector column. The disposable database suite uses the tracked vector schema. Production restore, hosted auth and device acceptance remain open. [Verification receipt](practice-privacy-verification.json)
