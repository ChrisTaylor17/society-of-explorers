# Society of Explorers release status

Updated November 7, 2026, Eastern time. **First release: HOLD. Production clearance: false.**

The canonical app is `/Users/christaylor/Documents/Codex/soe-release`, branch `codex/soe-first-release`. The original checkout and other candidates remain preserved. The account-authority model is one security component, not the complete app. [Source inventory](docs/integration/source-inventory.md)

The proposed first pilot is one invite-only online salon of roughly 6–8 adults, meeting weekly for four weeks. Its reading and host-plan preview is `/salons/pilot`: Christian identity, optional prayer, Scripture and Great Books, with disagreement welcome. Host, dates, roster and payment are unconfirmed. It is an unscheduled plan, not a live cohort. [Pilot evidence](docs/integration/salon-pilot-plan-verification.json)

## Current local evidence

| Area | What exists and what the evidence establishes | Acceptance still open |
| --- | --- | --- |
| Web | Sign-in, profiles, discovery, hosting, discussion, reading, reviewed clips and human moderation are integrated. The latest full webpack/type build passed with 1,208 unchanged product inputs. | Hosted routing, real provider accounts, recovery and production privacy. |
| Invitations | Recipient sharing consent, host review, account-bound approval, separate join confirmation, token-free read-only recovery and exact revocation retry are implemented. Eight compiled macOS WebKit journeys passed, including three isolated wallet-cookie stores and 100–400% layout. | Real provider/deployed middleware, Safari application and physical lifecycle acceptance. [WebKit scope](docs/integration/webkit-admission.md) |
| iOS and Android | The registered member screens reach the same invitation flow. The latest composed run passed 140 native regressions, 88 server/controller checks and 20 browser journeys across native, Quest and web fixtures. Production Swift sources compile for Mac; this is not an iOS app build. | Actual locked dependency graph, Codegen, platform compilation, signing, installed apps and device networking/secure storage. [Platform proof](docs/integration/platform-admission-verification.json) |
| Quest | Regular browser controls, immersive reading/discussion and shared check-in have local source and simulated headset evidence. The compiled regular view passed the unsupported-WebXR fallback. Live meetings currently hand off to the host's link in Quest Browser. | Physical headset, real account, input, lifecycle, comfort, accessibility and live meeting acceptance. Immersive voice meetings are not established. [Quest scope](docs/integration/quest-shared-salon.md) |
| Recovery and account removal | A synthetic PostgreSQL rehearsal restored 67 release tables through 65 ordered SQL files and tested independent-session invitation/removal races. Deletion requests and staged erasure phases exist; intake remains off. | Matching-version hosted 97-table source backup, media consistency, full hosted erasure, retained-data decisions and final completion workflow/notice. [Restore proof](docs/integration/salon-admission-restore-verification.json) · [Deletion scope](docs/integration/account-deletion.md) |
| AI, content and privacy | Per-message author permission gates Anthropic moderation; legacy messages and reporter notes are excluded. The provider remains disabled. Packaged clips have shared source/rights checks; the privacy policy is a draft. | Real-model/provider evaluation, cost controls, rights review at release, approved retention/disclosures and store acceptance. [Moderation proof](docs/integration/message-ai-reviewer-signout-verification.json) · [Clip proof](docs/integration/native-clip-review-verification.json) · [Policy proof](docs/integration/privacy-policy-verification.json) |

The newest code checkpoint is `9bb0b124f88a675025700a5536f7735670e0ec0c`; it adds WebKit verification only. Its eight committed files and every compiled product input were independently matched to the tested source. A deliberate post-startup failure remained FAIL after clean shutdown. All owned test, browser and database processes ended. These results are local evidence, not installed-device, real-provider or production acceptance. [WebKit receipt](docs/integration/webkit-admission-verification.json)

## Owner actions already pending

- **Android setup decision:** the separate $0 installation question has been asked once and remains unanswered. Its exact proposal allows task-local tools/dependencies, at most 30 GB new working space and at least 8 GB free; it excludes an emulator, cloud build, device install, publishing and further cleanup. Do not repeat the question or treat silence as approval. [Reviewed proposal](docs/integration/native-toolchain-unblock.md)
- **Secure database entry:** the owner expects to be at the Mac on November 8 evening. The hidden entry wrapper is prepared; no real password or source login has been tested. Never request the password in chat. Mac recovery setup is already approved. Do not reset, rotate or save credentials. [Recovery procedure](docs/integration/privacy-restore-check.md)
- **Later release decisions:** approve retention, deletion completion and provider/cost disclosures before activating those capabilities; identify the actual pilot host and dates before inviting members.

The exact 27 approved generated cache folders were cleaned: 30.29 GB allocated files removed, 28.65 GB measured free-space gain, 43.39 GB free immediately afterward. Source, backups, personal files, evidence, dependencies and the active cache were preserved. Later builds use some space. This approval does not authorize installations or other deletion. [Cleanup receipt](docs/integration/native-storage-cleanup-verification.json)

The owner supplied a screenshot confirming that Personal was linked for the Pro API benefit. Grant posting and secure key setup remain unverified in this release record. Do not claim that credits were used, issue/reuse a key or send private member text based only on that screenshot. Follow the already-authorized secure setup flow when its owner confirmations are available; existing Anthropic author consent does not authorize OpenAI processing.

## Release order

1. When the owner is present, verify the approved recovery runtime and use hidden password entry for the fixed read-only login check. Then perform the approved matching-version source capture and isolated restore, including database/media consistency. Preserve existing recovery/checker pins; a new web commit does not change them.
2. After recovery and explicit cutover approval, repair hosted Data API and recording access, coordinate SQL/server/legacy-client rollout, and verify direct denials, caching and restored member access. The November 7 read-only audit found broad anonymous reads and a public Waddle bucket. The staged SQL remains unapplied. [Migration plan](docs/integration/production-migration-plan.md)
3. If the pending Android proposal is approved, acquire only its pinned tools in an owned copy and attempt the actual native build. Stage iOS separately. Keep compilation, signing, launch and physical-device acceptance distinct.
4. Verify real sign-in, recovery, sign-out, account deletion, provider/cost controls, final content/disclosures and physical phones/Quest before claiming release readiness.
5. Run the small salon pilot only after its privacy/account gates clear. Track actual invitations, attendance, week-two return and host preparation. Views, drafts, local tests and founder usage are not demand or revenue.

No production writes, new installations, credential changes, spending, outreach, invitations, push or deployment are authorized by this status file. Continue bounded independent work only when it resolves a concrete remaining requirement. Do not add features or repeat passed tests merely because owner-dependent gates remain open.

The full preceding status, milestone history and scoped test receipts are preserved byte-for-byte in [the history](RELEASE_HISTORY_2026-11-07.md). Earlier statements there describe their dated checkpoints; the current requirements and holds above supersede them.
