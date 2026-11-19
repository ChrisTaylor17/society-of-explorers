# Public first-visit route — November 11, 2026

## Change

`/try` gives a visitor working public starting points: the Good Samaritan reading, the complete Apology, the Scripture comparison and the four-week salon plan. The homepage's first action opens this route; Circle discovery remains available beside it. The page states that private account features are being prepared for a pilot and that the salon has no confirmed host or dates. It does not claim a booking, payment, live meeting, neutral AI verdict or customer result.

The feedback action opens an ordinary email draft to the existing contact, `chris@societyofexplorers.com`, for the visitor to review and send. A direct email-address fallback is visible. No form, account lookup, private data, network service or new provider is used by the page.

The two leaderboard recovery links previously pointed to the nonexistent `/community` route. Both now point to the existing `/explore` directory. Its availability and privacy behavior are unchanged.

The seeded collaboration workspace is no longer mounted on the public homepage. The page now links to the existing proposed venture model at `/structure`. The complete research component is retained in `components/workspace/CollaborationPrototype.tsx` without a public route. Its hook setup, rendered prototype, storage keys and helper functions match their pre-extraction source exactly. Existing browser data, the underlying survey/workspace components, and their account or sync contracts are unchanged. Public visits no longer initialize this seeded graph or show pretend member roles, signers, telemetry or funding.

## Verification

- Eight focused groups in `verification/web/tests/public-trial.test.mjs` pass. They render the actual pages, reject unexpected imports, check existing local routes and in-page anchors, verify the explicit availability statements and email draft, render leaderboard recovery in five synthetic display states without executing effects, and confirm that the retained prototype is not imported by a public route.
- Scoped ESLint passes with zero warnings for the changed homepage, trial route, leaderboard, retained prototype and focused test.
- The focused checks use the already-installed locked dependencies in the isolated `2026-11-11-public-trial/source` validation copy. No dependency installation occurred.
- Built-app mobile, keyboard and navigation acceptance is assigned to the parent completion pass. This source/SSR check is not a browser, deployed-site or customer-validation result.

The old source remains in restore commit `7020eb5`. No global navigation, authentication, provider, billing, edition or security handler changed in this item. Nothing was sent, published or deployed; no money was spent.
