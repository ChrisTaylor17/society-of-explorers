# Exhibition landing plan

Date: 2026-09-27

The launch site is the Foreman/Builder exhibition. Its home is the empty private repository `https://github.com/ChrisTaylor17/soe`. Astra research is an addition inside that exhibition. This document is a landing plan only. No exhibition files were copied, and nothing was deployed.

## What is not the launch site

`ChrisTaylor17/society-of-explorers` at `codex/prompts-mvp` (`0383110e6aa96ee16b594d971ba2e3402648b4f5`) is the legacy marketplace archive. It contains the marketplace app, Council, wallets, tokens, and the nested `prompts-mvp` Prompt Atlas app. The live site `https://www.societyofexplorers.com` (Vercel deployment `dpl_8PSS1iRp7s7tvNx8mRnwQ38Lfv2d`) is that legacy product.

This plan does not ship `prompts-mvp`, and it does not use the marketplace as the design or product foundation. Those trees stay where they are. They are not imported into `soe`.

## Repository choice

| Repository | Observed state | Use |
| --- | --- | --- |
| `ChrisTaylor17/soe` | Private. GitHub contents API returns `409 Git Repository is empty`. `list_branches` returns no branches. | Canonical exhibition repository. |
| `ChrisTaylor17/soesoe` | Also empty (`409`). | No advantage over `soe`. Leave it empty. |
| `ChrisTaylor17/explorers` | Public Next.js app, last update 2025-10-16. README describes Solana NFT and token creation, Phantom, MongoDB. Routes include `create-nft` and `create-token`. | Older product. Do not use as the exhibition repo. |
| `ChrisTaylor17/society-of-explorers` | Marketplace plus `prompts-mvp`. | Legacy archive only. |

`soe` is the right landing repository because Chris named it and it has no history to contaminate. `explorers` is a different product and would drag an unrelated public history into the launch.

## Exhibition source was not on this machine

These paths were named as the private release-candidate trees on the shared box:

- `/workspace/soe-website-rc`
- `/workspace/tmp-soe-pass8`
- `/workspace/NextChapter/soe-concepts/multimedia/web`

None of them exist in this agent environment. A filesystem search found no Foreman/Builder exhibition tree. This plan does not invent routes, media, or journeys. The next session has to run on the box that actually holds the chosen tree.

`codex/research-handoff-clean` at `e284fd0` was not searched further. Chris confirmed it exists only in ChatGPT Work/Codex and was never pushed.

## How to land the exhibition in `soe`

Do this from the shared box, after one tree is chosen. The agent that can see the tree should do the copy. This agent could not.

1. Choose one directory. It must be the Foreman/Builder exhibition: primary journeys Explore, Gather, and Build, with the approved design, media, and journeys. If a candidate is a checkout of `society-of-explorers` or `prompts-mvp`, reject it.
2. Inspect that tree’s `.git` before any push. If `origin` is `society-of-explorers`, or the history contains marketplace commits, do not push that history.
3. Make a new history from the working tree only:
   - Copy the chosen directory to a clean folder.
   - Exclude `node_modules`, `.next`, `.env`, `.env.*`, and the old `.git`.
   - `git init` in the clean folder.
   - Confirm the copy still contains the exhibition journeys and does not contain `prompts-mvp`, marketplace Supabase migrations, token contracts, or paid-tier product code.
4. Push that new history to `https://github.com/ChrisTaylor17/soe`. The repository is empty, so the first push does not need a force. Put the exhibition on `main` only when Chris has looked at the tree. Until then, push a branch.
5. Leave `www.societyofexplorers.com` on the current legacy Vercel project. Create a new Vercel project for `soe` only after the re-auth in the release note. Do not deploy in this step.

## Where Astra fits

After the exhibition is the content of `soe`:

- Add research as a subordinate extension of Explore. Keep Explore, Gather, and Build as the primary architecture.
- Do not retitle the exhibition around Astra, and do not stand up a second site.
- Until `e284fd0` is exported from Codex and reviewed, the public research surface is presentation only: no form, no email field, no file upload, no personal contribution.
- AI-assisted contribution review stays off. No such flag exists in any pushed repository. Do not add a review writer ahead of provider, retention, and consent approval.
- Participation storage goes in a new Supabase project. See the security inventory. Do not point the exhibition at the marketplace database.

## Dual path after the tree is on `soe`

Path A, full participation, waits on all of the following: exhibition tree reviewed on `soe`, research migration from the Codex export reviewed, new Supabase project with contributor isolation proven, and written approval for provider, retention, and consent.

Path B, exhibition plus a closed research note, is the first public shape. The note states that participation is not open. It accepts no personal data. Path B still waits on the exhibition tree itself. It is not available from this machine tonight.
