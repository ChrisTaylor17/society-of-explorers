# Society of Explorers release status

Updated 2026-11-04. **First release remains HOLD. Production clearance is false.**

Canonical checkout: `/Users/christaylor/Documents/Codex/soe-release`, branch `codex/soe-first-release`. The original `/Users/christaylor/society-of-explorers` checkout was not edited; its current 681 status entries match the saved baseline exactly. A previous read briefly observed an additional `.claude/settings.local.json`; provenance is unknown and its contents were never read. Preserve all source candidates. The later account-authority folder is a security model, not the complete app.

Current milestone adds fresh-session own-contribution history and withdrawal across Circles on native and Quest to checkpoint `413aa3a83f2fc363746e7ab08a8b6a850fa761ad`. [Current verification](docs/integration/platform-contributions-verification.json) records scope and source/evidence hashes. No push, deployment, production SQL, provider activation, issued credential, SDK download or spending occurred.

## Product decisions and implemented behavior

- **Both clip formats:** `/clips` has three source-linked text selections and an original silent, captioned 24-second introduction with explicit media loading. Third-party audio/video proposals remain held. Twelve hero originals without usage receipts remain in a deployment-excluded provenance archive; six pages use first-party CSS backgrounds.
- **Per-message author AI opt-in:** legacy messages default excluded. Authors see the named Anthropic disclosure and can revoke consent. Only eligible message text can enter advice; reporter notes, profiles and conversation context are excluded. Current access/consent and exact quotations are checked. The provider is disabled; consent/allowance SQL is unapplied. Human decisions remain deliberate.
- Web integrates reading editions/passage context, Circle participation, threaded discussion/archive, receipts, Unicode discovery and moderation. Human review supports bounded pages beyond 100 reports with explicit acknowledgements and current server-held coverage. AI retains its separate 100-report limit. New SQL remains unapplied.
- Accounts include subject-only provisioning, explicit wallet/Supabase selection, signed wallet expiry/nonces, bounded sign-out with matching receipt and cookie readback, and retirement of private views. Profile changes bind owner/revision and fresh readback; publication is explicit and legacy profiles stay private. Public projections omit private identity, billing, activity and earnings.
- Ordinary salon reads use bounded published-profile projections; writes require an actor-bound receipt and matching fresh history. Hall uses a public text-only DTO. Public guide rankings are paused locally. Core/Circle/artifact/reward containment candidates preserve data but have not repaired live access.
- Quest has member-browser composition, archive paging, keyed root/reply writing and the new message actions, with same-Circle web fallbacks. Native screens use active lifecycle and trusted known-online connectivity; unknown/offline state clears private views/drafts. Reconnection alone performs no check or fetch. Native sign-in composition, compilation and physical-device acceptance remain open.

## Current author-history milestone

Members can now open their own posted messages across Circles from the native account gate or standalone `/quest/contributions`. Quest also offers the history panel from a connected Circle. The standalone route requires no Circle ID, listing lookup or current Circle membership. The existing canonical author-only API/SQL is reused unchanged, including access after leaving or quarantine.

History loads only on an explicit action, in replacement pages of at most 25 messages. Selection must match a Circle/message pair on the checked page. The page bodies are cleared before a separate fresh message-state GET verifies current author permissions. Only withdrawal is offered here, with explicit acknowledgement and a disclosure that restricted safety evidence can remain. Reporter notes and others' contributions are excluded; AI consent is unchanged.

Uncertain withdrawal retains one exact request for manual replay and blocks list/back/account navigation. A current-state GET never confirms the earlier receipt. Account, lifecycle, connectivity and closure changes retire private pages, action state and keys; an already-sent action can still complete. Returning online does not reload or retry. Credential acquisition, transport, JSON parsing and secure UUID acquisition have bounded deadlines and retirement checks.

Native JavaScript/Kotlin transport adds only the exact contributions GET, with no query or one literal UUID `after` cursor. Kotlin remains source-only. The native entry still needs an application-owned sign-in client and toolchain/device acceptance. See [native scope](docs/integration/native-contributions.md) and [Quest scope](docs/integration/quest-own-contributions.md).

The preceding verified-account milestone remains integrated: explicit bearer identity overrides unrelated cookies for setup, and native entry requires a fresh matching member readback before opening private destinations. This does not create a provider account or grant Circle membership.

## Current verification

| Scope | Result and boundary |
| --- | --- |
| Controller/API/SQL | **29/29**: nine focused controller checks and 20 canonical HTTP/strict SQL stories; 63 unchanged bindings. Includes 106 own posts over five pages, two left/quarantined Circles, ownership isolation, withheld notes, exact replay and late-result retirement. |
| Native history | **9/9** actual TSX to canonical history/message handlers/SQL browser stories; 52 bindings and 70 requests. **4/4** policy checks comprise three executable JavaScript cases and one static Kotlin check. DOM/native/provider doubles remain explicit. |
| Quest history | **8/8** actual client/component/API/SQL browser stories; 49 handler requests and 64 bindings. Standalone and embedded entry, fresh author state, paging, hidden explanations, lost replies and retirement pass. |
| Existing flows | **9/9** unchanged native account browser stories, 37 bindings and 27 requests; existing account policy **4/4**. Existing Quest message actions **8/8**, 56 requests and 62 bindings. |
| Platform regression | **85/85** writer/platform/durable-port/adapter/connectivity/Quest-auth/message-safety checks. Portable types and scoped shared/native/Quest/test lint pass. |
| Web build/browser | Offline webpack build **PASS, 47.96s**, all **993** inputs unchanged; fingerprint `9e276d84e762f232087c4ce69dadb4944969b283abe9c685ce80708678d9f875`, build `rIonsVMy44kkRX2Zi-61y`. **14/14** built-site stories, 25 matching bindings and owned cleanup. The new standalone route is verified without a Circle ID; authenticated history uses the separately scoped composed fixture. |

Independent shared-controller/native-UI/transport review found no actionable defects; root reviewed Quest composition and standalone entry. Small-screen control/keyboard checks use browser primitives; native rendering and headset accessibility still require devices. All application/test runs used clean environments, startup external-network denial and cached runtimes. This is not OS-level network isolation.

The previous account milestone's 36 evidence files are preserved byte-for-byte under `verification/web/evidence/checkpoint-413aa3a/`; hashes match [its historical receipt](docs/integration/native-account-provisioning-verification.json). Earlier message-safety and keyed-participation evidence remains under `checkpoint-46a53ff/` and `checkpoint-5f93bc9/`. Historical counts do not verify changed source. Evidence artifacts are local and ignored by Git; scoped runners and receipts are committed, not a portable evidence export.

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
