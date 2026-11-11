# Public phone access and release options — November 11, 2026

## What Chris can open now

The existing public site already provides working, anonymous reading and planning pages:

- [Fellowship and the Good Samaritan](https://www.societyofexplorers.com/fellowship)
- [The complete letter to Philemon](https://www.societyofexplorers.com/readings/philemon)
- [Salon planner](https://www.societyofexplorers.com/salon-plan)

Anonymous HTTP checks at 14:57 UTC returned 200 for these pages and the homepage. Their complete response bytes match the prior released source. This verifies current reachability and content, not a fresh interactive phone test. The planner's copy/download browser evidence remains the earlier release's dated evidence. No release, login or purchase is needed to share these existing URLs.

The Next app's new `/try`, `/great-books/apology` and `/fellowship/scripture` currently return 404 on that public domain. `/salons/pilot`, `/login` and `/api/` return 308 to `/hold.html`. Do not describe local Next improvements as available on the public domain. [Exact public HTTP receipt](public-phone-paths-2026-11-11.json).

## Exact existing destinations and access

| Item | Verified result |
| --- | --- |
| Public source | `ChrisTaylor17/soe`, branch `master`, commit `fc5ba3738c9ad0533a59fcd88d8a4a4921e7c5aa`; current head verified through the already-authenticated GitHub CLI. |
| Hosting project | `soe-exhibition`, `prj_UUnDq98M0BaB7sziRrbrXGH8P1za`, framework `null` (static exhibition). |
| Hosting team | `chris-projects-03dec906`, `team_cjQKLRhwsyaUtOLJoA4sfxbS`. |
| Current public alias | `www.societyofexplorers.com` points to `dpl_BYwZRHQDwkNXKepzz5TpFestcGKR`, independently verified using the Vercel connector's exact-alias lookup and authenticated CLI inspection. |
| Exact deployment URL | `https://soe-exhibition-kefe6ov61-chris-projects-03dec906.vercel.app`, READY, production, CLI-created. |
| Apex | `societyofexplorers.com` is verified on the same project and redirects to `www.societyofexplorers.com`. |
| Prior rollback | The existing November 10 release record preserves `dpl_4mpHC3TugRkwDbzqjE76CsEKAK8v`. A new additive release should use the currently verified `dpl_BYwZRHQDwkNXKepzz5TpFestcGKR` as its immediate rollback. |
| Separate Next source | `ChrisTaylor17/society-of-explorers`, canonical local checkout `Documents/Codex/soe-release`; it is not the public exhibition source. The canonical checkout has no `.vercel/project.json`. |

The GitHub connector returned 404 for the public-source branch and configuration, but the existing authenticated CLI read both successfully; this is not a new login blocker. Vercel's filtered alias list returned no rows, while its exact-alias lookup and CLI both resolved the expected production build. Do not infer that the domain is unassigned from the list result. The `app.societyofexplorers.com` exact-alias connector read returned 404 in this team; its ownership was not independently established here and it is not a release target.

The public site's dated candidate is preserved at `/Users/christaylor/Documents/Mewest/RESEARCH/soe-archive-readability-2026-11-10/candidate`. Its local `AGENTS.md` identifies this separate release source and requires preservation of existing URLs and audit evidence. Current `vercel.json` has 87 redirects and 74 rewrites; the member/API holds are explicit. No environment values, credentials or member records were read.

## Recommended reversible path

**Use the live links above immediately.** For a next public release, add a small static reading package to the existing exhibition, keeping every member/API redirect intact. Avoid deploying the complete Next app simply to expose its reading pages.

Suggested route mapping for the parent to prepare and review:

| Local feature | Public static destination |
| --- | --- |
| `/try` | Add `/try` with links adapted to the actual public routes below. Do not copy the local links unchanged. |
| Good Samaritan | Reuse `/fellowship#reading`; verify the actual anchor when preparing the package. |
| Philemon | Reuse `/readings/philemon`. |
| Complete Apology | Add `/readings/apology` from the verified local complete edition, retaining its exact source text, credits and license; do not route through `/api`. |
| Scripture comparison | Add a static `/readings/scripture-comparison` from the inspected public source data, preserving all verses, publisher notes, named interpretations and sources. Keep only working native controls or locally tested client tools. |
| Salon planning | Reuse `/salon-plan`; keep `/salons/*` held. Add a separately named static four-week plan only if it contributes something the current planner does not already offer. |

Prepare the allowlisted HTML/CSS/assets without Next account components, cookies, providers, forms that send data, or server functions. Check every internal link, original text/credit preservation, narrow-phone layout, keyboard navigation and no-JavaScript recovery. Stage on the existing project without assigning the public domains, test the exact staged files and member/API redirects, then promote that tested build. Keep the current production deployment as the rollback. This follows the [Vercel deployment skill](/Users/christaylor/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/deployments-cicd/SKILL.md); no publication was performed in this read-only review.

This path needs no new service, paid tool, database access or new credential from Chris for the read-only steps already verified. The existing project is usable through authenticated tools; write permission was not exercised. The available team response did not expose billing allowances, so zero incremental hosting usage for a new deployment is not established here. Sharing the already-live pages requires no new purchase or deployment. New member features still require the separate hosted privacy, backup and real-account work.
