# First release migration rehearsal

The local rehearsal runs up to 42 ordered SQL files in a disposable PostgreSQL engine. It starts with tracked schema and bounded catalog projections, then exercises containment, account identity, profiles, Circles, saved reading, discussion, consent, moderation and reward accounting. Four composed scenarios passed and all four databases closed. They record 179 SQL executions and 21 observations, including the two preserved failure controls. Hosted restore, caller and access gates still govern rollout. [Verification receipt](full-chain-migration-verification.json) · [Production migration plan](production-migration-plan.md)

There are two saved-reading starting states. The tracked legacy schema has `Progress open` and `Highlights open` policies. A preserved run reached the saved-reading preflight and got `PT409` because core containment retained those policies. The successful legacy branch runs the reviewed Great Books cleanup before core containment. The November 4 catalog had no policies on those tables, so the captured-state branch skips the cleanup and still reaches saved-reading revision checks. Recheck policy definitions and grants before selecting a branch. Replaying the older cleanup after saved-reading installation would reopen raw service writes.

The same catalog showed broad raw privileges on `exp_events` for both browser roles, including `TRUNCATE`. The local baseline reproduced truncation under each role before accounting and rolled both probes back. After accounting, the roles retained the grant and the receipt foreign key prevented truncation. That was a database-role probe with synthetic data. PostgreSQL row policies do not cover whole-table operations such as `TRUNCATE`. [PostgreSQL row security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

The separate `exp-events-containment` draft closes table and column access for PUBLIC and the two browser roles before accounting. It preserves existing rows, the captured owner policy, explicit service grants, effective service CRUD, and the legacy reward function bodies. Sixteen focused cases pass. A private catalog receipt makes repeat apply and reversal conditional on an exact recognized state. Accounting adds foreign-key triggers, so the earlier preflight, apply and reversal refuse that later state. The member foreign key name and actions were not captured, so the tests verify its endpoints and preserve the actual definition they receive. Source review traced the remaining literal event-table uses in 12 canonical application files to server-side service clients. Deployed callers and other legacy accounting paths still need review.

An independent server path also needed correction. The previous `/api/exp/award` handler accepted a client-chosen award without a verified reading event. With a synthetic signed-in identity, the actual handler returned 200 and raised a disposable balance from 7 to 57 even though the event insert failed with `42703`. The canonical source search found no caller for that endpoint. It now returns private HTTP 410 before request-body parsing or account or database access. The final built-server check and route regression passed. This is a prospective retirement. A deployed-caller and historical-balance audit remains separate work.

The database cases run on a single cached PGlite backend. Catalog projections, identity, fixture rows and provider ports are synthetic or explicitly bounded. Production restore, independent PostgreSQL-session contention, hosted schema-cache behavior and live grants remain acceptance gates. The app build and endpoint proof use the guarded local Next runtime.

Run the local tests from `verification/web` with the cached runtime and network guard.

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node \
  --require ./scripts/deny-build-network.cjs --test --test-concurrency=1 \
  tests/full-chain-migration.test.mjs tests/exp-events-containment-db.test.mjs \
  tests/retired-reading-award.test.mjs
```
