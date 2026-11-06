# Live Council room privacy

The November 5 production catalog showed full table grants for both browser roles on `video_rooms`, `room_participants` and `room_transcripts`, with row-level security off on all three. The visible schema includes meeting URLs, attendance and transcript text. The review selected catalog metadata only. The full query and response are in the private local evidence directory. [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)

The release candidate keeps the Live Council schedule, event titles and calendar links public. It drops provider links and summary metadata from public responses and excludes Live Council from the older room list. A verified member can join an active Council in the Society of Explorers community. The app validates the Daily URL against the stored room name. PostgreSQL then locks the room and checks the same URL, room type and current state while recording attendance. A repeated join retains the original attendance time while the member is active. The iframe sends no app referrer and closes when the browser retires the account. Ending a Council closes the app join path. The old summary action returns 410, and existing transcript and summary records stay in the database. [Daily room URL format](https://docs.daily.co/guides/products/live-streaming-recording/storing-recordings-in-a-custom-s3-bucket)

The [SQL draft](../sql/live-room-containment-apply.sql) removes browser and PUBLIC table and column grants, enables row-level security and keeps the service role's reviewed privileges. It refuses inherited browser roles, readable dependent views, named table references in executable privileged public functions, existing policies or replication. It also checks effective privileges after revocation. The join function uses invoker privileges with service-only execution. A collision or failed check rolls back the whole transaction. [PostgreSQL grant removal](https://www.postgresql.org/docs/17/sql-revoke.html)

## Local verification

The PostgreSQL 17 rehearsal restored the three synthetic tables, kept their rows and service access, and blocked raw browser reads and writes. A join on a separate connection waited behind a concurrent close and then recorded no attendance. Seven API checks and five Chromium stories used the actual route code, Supabase SDK and disposable PostgreSQL. The browser ran the current React page with navigation and account adapters. Scoped TypeScript and lint passed. The current full build stopped on offloaded dependency inputs. [Verification receipt](live-room-containment-verification.json)

Run the three checks from `verification/web` using the existing offline runtimes. The built browser runner accepts the completed local server's `built-shell-live-room-<number>-` prefix in place of `--component 01`.

```sh
python3 -B scripts/test-live-room-containment.py
node --require ./scripts/deny-build-network.cjs --test tests/live-room-boundary.test.mjs
node --require ./scripts/deny-build-network.cjs scripts/browser-live-room.mjs --component 01
```

## Before a hosted cutover

Include all three room tables in the approved export and isolated restore. Recheck current permissions, dependent objects and the uploaded legacy route callers. Keep older deployments held while applying the reviewed SQL and the matching app, then verify schema cache, signed-out schedule, verified join, closed-session refusal and browser-role denial. If acceptance fails, keep the member alias held and retain the tighter grants while correcting the release.

Verify the owned Daily account and provider-side room admission with synthetic participants. A link issued by an earlier build may still work at Daily, depending on the room's access settings. The app join check governs link delivery and attendance. Provider admission and ejection need their own verification. [Daily room access settings](https://docs.daily.co/guides/configurations-and-settings/setting-up-calls)
