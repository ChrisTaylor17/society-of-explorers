# Society of Explorers release status

Updated 2026-11-04. **First release remains HOLD. Production clearance is false.**

Canonical checkout: `/Users/christaylor/Documents/Codex/soe-release`, branch `codex/soe-first-release`. The original `/Users/christaylor/society-of-explorers` checkout was not edited; its current 681 status entries match the saved baseline exactly. A previous read briefly observed an additional `.claude/settings.local.json`; provenance is unknown and its contents were never read. Preserve all source candidates. The later account-authority folder is a security model, not the complete app.

Current milestone adds verified existing-account setup and a native account gate to checkpoint `46a53ff48731c592d4e81d1783d7055abf2b2783`. [Current verification](docs/integration/native-account-provisioning-verification.json) records scope and source/evidence hashes. No push, deployment, production SQL, provider activation, issued credential, SDK download or spending occurred.

## Product decisions and implemented behavior

- **Both clip formats:** `/clips` has three source-linked text selections and an original silent, captioned 24-second introduction with explicit media loading. Third-party audio/video proposals remain held. Twelve hero originals without usage receipts remain in a deployment-excluded provenance archive; six pages use first-party CSS backgrounds.
- **Per-message author AI opt-in:** legacy messages default excluded. Authors see the named Anthropic disclosure and can revoke consent. Only eligible message text can enter advice; reporter notes, profiles and conversation context are excluded. Current access/consent and exact quotations are checked. The provider is disabled; consent/allowance SQL is unapplied. Human decisions remain deliberate.
- Web integrates reading editions/passage context, Circle participation, threaded discussion/archive, receipts, Unicode discovery and moderation. Human review supports bounded pages beyond 100 reports with explicit acknowledgements and current server-held coverage. AI retains its separate 100-report limit. New SQL remains unapplied.
- Accounts include subject-only provisioning, explicit wallet/Supabase selection, signed wallet expiry/nonces, bounded sign-out with matching receipt and cookie readback, and retirement of private views. Profile changes bind owner/revision and fresh readback; publication is explicit and legacy profiles stay private. Public projections omit private identity, billing, activity and earnings.
- Ordinary salon reads use bounded published-profile projections; writes require an actor-bound receipt and matching fresh history. Hall uses a public text-only DTO. Public guide rankings are paused locally. Core/Circle/artifact/reward containment candidates preserve data but have not repaired live access.
- Quest has member-browser composition, archive paging, keyed root/reply writing and the new message actions, with same-Circle web fallbacks. Native screens use active lifecycle and trusted known-online connectivity; unknown/offline state clears private views/drafts. Reconnection alone performs no check or fetch. Native sign-in composition, compilation and physical-device acceptance remain open.

## Current account milestone

The canonical setup endpoint previously ignored an explicit bearer and could provision the browser cookie's account. It now verifies the exact bearer, gives it authority over other cookie identities, and refuses invalid bearer fallback. Browser sign-out remains a refusal. Subject-only lookup, creation and uniqueness-race recovery check the returned member's owner; email cannot reassign accounts.

Native entry now requires an explicit current-account check. An unconfirmed response permits a separate setup acknowledgement; it does not prove no member row exists. Setup sends exactly `{}` for the freshly verified subject and reuses an existing member. A matching fresh member readback must succeed before the user can choose Continue to Circle. The gate does not expose email, provider subject or profile fields. Account/lifecycle/connectivity changes unmount private content; reconnecting performs no automatic fetch.

Uncertain setup stays explicit: a manual current-account check can confirm the account, while a fresh unconfirmed response requires renewed acknowledgement before retrying the same `{}` setup. The verified subject and any known member receipt remain pinned across recovery. No exactly-once creation claim or automatic retry is made. Unicode names accepted by the canonical DTO remain compatible and controls are normalized for presentation.

JavaScript/Kotlin transport adds only exact account GET/setup POST paths, without queries or suffixes. Kotlin remains source-only. This accepts an existing injected provider account; it does **not** supply app-owned sign-in. The default native entry still says sign-in is not connected. See [native scope](docs/integration/native-account-setup.md).

The previous native/Quest report and withdrawal flows remain available. Report confirmation requires a matching POST receipt, not a state GET. Author withdrawal after leave/quarantine starts from an already-loaded contribution; new-session cross-Circle own-contribution discovery remains unfinished. Restricted retained evidence and its policy remain separate from member-visible withdrawal.

## Current verification

| Scope | Result and boundary |
| --- | --- |
| Account API/SQL | **68/68**: 19 bearer-provisioning, 37 existing account-security and 12 identity-SQL checks; 40 unchanged bindings. The old bearer/cookie bug was reproduced before the fix. |
| Account controller | **19/19** actual controller/verified owner to canonical HTTP/strict SQL cases; 35 unchanged bindings. Lost replies, explicit recovery, pinned subject/member, Unicode names and retirement pass. Synthetic provider identity; one PGlite backend. |
| Native screen | **9/9** actual TSX to canonical account handlers/SQL browser stories, 35 bindings and 27 requests. DOM/native/provider doubles and synthetic Circle DTO are explicit. **4/4** policy checks comprise three executable JavaScript cases and one static Kotlin check. |
| Quest regression | **8/8** message-action component/API/SQL stories after rebuilding the shared owner; 56 handler requests, 60 bindings and owned cleanup. SDK identity/delivery are synthetic; no physical headset. |
| Platform regression | **74/74** writer/platform/durable-port/adapter/connectivity/Quest-auth checks. Portable types and scoped product/test lint pass. |
| Web build/browser | Offline webpack build **PASS, 47.01s**, all **990** inputs unchanged; fingerprint `9e522ccefe05bcd0a803269469bb634d022e4c376c9c68ca8244680d9d668e95`, build `E7oT2NfurB6pR1lfV7hzP`. **13/13** built-site browser stories, 20 matching bindings and owned cleanup. This does not establish hosted account acceptance. |

Independent account/controller/UI/transport review findings were fixed and regression-tested. Small-screen control/keyboard checks use browser primitives; native rendering and headset accessibility still require devices. All application/test runs used clean environments, startup external-network denial and cached runtimes. This is not OS-level network isolation.

The previous message-safety milestone's 36 evidence files are preserved byte-for-byte under `verification/web/evidence/checkpoint-46a53ff/`; hashes match [its historical receipt](docs/integration/platform-message-safety-verification.json). The preceding 36 keyed-participation files remain under `checkpoint-5f93bc9/`. Earlier checkpoints retain source-bound receipts. Historical counts are not fresh proof of changed source. Evidence artifacts are local and ignored by Git; scoped runners and receipts are committed, not a portable evidence export.

## Time-sensitive API credit request

The user asked to use the Pro API benefit within 5–6 days. The official account preview on November 4 showed **$46 claimable now**, prorated from the advertised $200 monthly benefit, expiring **November 11 at 7:52pm Eastern** (`2026-11-12T00:52:40Z`). Personal was the available API organization. The required secure organization confirmation returned **not_approved**; linking was not attempted, no credits were activated or used, and no API key was inspected or issued. Do not bypass or repeat that decision without new user authorization.

After secure confirmation, finish the supported linking/key setup and use bounded credits for useful SoE public/synthetic evaluation before November 10. Verify the remaining grant and cost controls first; no paid overage or private member text is authorized. Existing Anthropic member consent does not cover OpenAI. These credits do not increase signed-in Codex limits or cover Codex usage through API keys. [Official benefit terms](https://developers.openai.com/api/docs/guides/chatgpt-api-credits).

## Remaining release gates and next actions

1. **Live privacy/access repair is the priority.** Recorded read-only Supabase metadata shows raw browser access to private member columns and private tables without RLS. Local DTOs do not close direct Data API access. Obtain tested backup/restore evidence and finish deployed caller/backend impact review before exact production changes. The backup question remains pending; no development branches found does not prove backup absence.
2. **Deployed source provenance is incomplete.** The Vercel CLI upload returned no Git commit. Connector listings are truncated; authenticated dashboard preview/clipboard attempts did not yield complete source bytes. No complete digest/control flow was verified. See [caller-impact evidence](docs/integration/deployed-caller-impact-2026-11-04.md).
3. **Coordinate SQL/server/client rollout.** Core seven-table, Circle three-table, artifact and reward containment plus additive workflow/accounting migrations are separately bounded and unapplied. New Thinker callers need UUIDs/new RPC; preserve receipts/audits, since the old server restores unsafe accounting. Hosted schema-cache, production data and independent-session contention still need acceptance. See [migration plan](docs/integration/production-migration-plan.md). The synthetic cross-stage proof is not a full production restore and excludes later workflows/accounting.
4. **Native/Quest acceptance remains open.** Bounded Android-first acquisition approval is pending; no runtime/SDK was downloaded. Complete Codegen/types/Kotlin build, application-owned sign-in, secure storage/transport/connectivity, interrupted-reset and physical-device checks. iOS has no generated native project. Both need owned identity/signing/backup acceptance; discovery/profile/reading and moderation parity are unfinished. Quest needs physical lifecycle/input/accessibility testing; immersive source remains a prototype.
5. **Provider/content/release acceptance:** keep AI disabled until approved provider/input/purpose/cost testing and real-model evaluation. Request ceilings do not establish dollar caps. Keep unlicensed assets excluded. Finish hosted auth/cookie/revocation, rights, security/accessibility and device checks. Other database settings/functions and the separate Prompt Atlas app remain outside clearance.

## Resume safely

Continue in this checkout; do not edit Mewest or the original dirty checkout. Stat exact source before reads and refuse symlinks/nonempty zero-block/offloaded inputs. Avoid recursive native dependency/candidate traversal and the aggregate archive verifier. Reuse cached runtimes with external application traffic denied from startup. No install, provider sign-in, issued credential, spending or production write without authorization. Existing backup and Android acquisition questions remain pending; do not repeat them. Continue bounded local work while those gates remain open.
