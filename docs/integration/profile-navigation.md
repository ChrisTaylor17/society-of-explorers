# Profile safety and navigation — local milestone

This milestone extends `26476e3`. The source integrates web owner review/recovery, publication-filtered Circle references, native published profiles and web/Quest links. Production clearance remains false. See `profile-navigation-verification.json` for exact current sources, evidence and counts, and `profile-intent-public-references.md` for the two unapplied SQL candidates and rollout order.

## Changes and verified behavior

- An unchanged private save now advances the profile revision once. A held earlier public save conflicts after the newer private confirmation. Raw revision bypass remains rejected. Rollback preserves guards, profiles and revisions while disabling profile writes.
- The web editor retains exact unresolved saves, requires a new review before retry, verifies the current canonical owner before reads/writes and checks fresh state after a matching receipt. A same-base GET or public-profile lookup cannot settle an uncertain private save. A newer revision fences its earlier compare-and-set without attributing the commit.
- Six current Circle reads project only published canonical host/visible-author references. Private, hidden, withdrawn, unavailable or quarantined cases expose no link. Current servers require the explicit wrapper projection and fail closed if it is unavailable. Original SQL functions and ordinary salon behavior remain intact.
- A shared web link validates the exact canonical ID, uses no referrer and performs full navigation without prefetch. The published page reads current publication again and renders only seven authored fields. Fresh message state with a null reference removes an older card link.
- Native host/author navigation uses the existing anonymous profile transport. All fields render as text; missing, malformed, mismatched and redirected results do not reveal a profile. Back returns through fresh authorization to the same archive/thread query, including its cursor. No private message body is retained for navigation recovery.
- Web review access now retires on offline events and fences late credential/reply work. Online/focus only permits a new manual read. Quest links also stay hidden while a legacy post is uncertain, retaining manual conversation review and explicit recovery.

## Verification and limits

Canonical HTTP handlers and real SQL run locally in cached PGlite. Chromium executes actual React components, the registered native App, cached AuthClient, generated Quest host and public-profile server component. Provider identities, delivery, native primitives/OS and cosmetic public navigation are explicit fixture ports. Public page delivery renders the actual server component with a synthetic Next notFound boundary; this is not hosted Next runtime acceptance. Three new browser groups cover 20 web owner, 11 web/Quest navigation and 12 native profile stories. Existing participation and reading journeys are refreshed in the milestone receipt.

The guarded full web build passes 238 pages with 1,009 unchanged inputs. Portable/web types do not cover native TSX as native source. Device compilation, real provider sign-in, live RLS/ACL/schema cache, production contention, restored backup, deployment and physical headset/native accessibility remain open. Existing account/body consent is unchanged; no provider receives member text from this work.

The eight-book reader audit is an inventory, not rendering acceptance. It found 342 table blocks, 94 nontext blocks, 225 indexed images and 150 outside-index images. 312 resident assets total 32,110,932 bytes were inspected by metadata only. Complete layout needs an appropriate native renderer and resource channel; the current passage JSON transport is insufficient. Avatar upload, storage, metadata removal and publication need a separate reviewed contract. No avatar or unlicensed media source was invented.

All historical hosting evidence was archived before reusable outputs changed. Root navigation failures were retained before retry: renderer/auth/cookie fixture-port issues, the actual offline-retirement defect and one legacy-status selector mismatch. The current sources and successful receipts, not those failed runs, define this milestone.
