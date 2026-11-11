# Public first-visit route — November 11, 2026

## Change

`/try` gives a visitor working public starting points: the Good Samaritan reading, the complete Apology, the Scripture comparison and the four-week salon plan. The homepage's first action opens this route; Circle discovery remains available beside it. The page states that private account features are being prepared for a pilot and that the salon has no confirmed host or dates. It does not claim a booking, payment, live meeting, neutral AI verdict or customer result.

The feedback action opens an ordinary email draft to the existing contact, `chris@societyofexplorers.com`, for the visitor to review and send. A direct email-address fallback is visible. No form, account lookup, private data, network service or new provider is used by the page.

The two leaderboard recovery links previously pointed to the nonexistent `/community` route. Both now point to the existing `/explore` directory. Its availability and privacy behavior are unchanged.

## Verification

- Six focused groups in `verification/web/tests/public-trial.test.mjs` pass. They render the actual page, reject unexpected imports, check existing local routes and in-page anchors, verify the explicit availability statements and email draft, and render leaderboard recovery in five synthetic display states without executing effects.
- Scoped ESLint passes with zero warnings for `app/HomePageClient.tsx`, `app/try/page.tsx`, `app/leaderboard/page.tsx` and the focused test.
- The focused checks use the already-installed locked dependencies in the isolated `2026-11-11-public-trial/source` validation copy. No dependency installation occurred.
- Built-app mobile, keyboard and navigation acceptance is assigned to the parent completion pass. This source/SSR check is not a browser, deployed-site or customer-validation result.

The old source remains in restore commit `7020eb5`. No global navigation, authentication, provider, billing, edition or security handler changed in this item. Nothing was sent, published or deployed; no money was spent.
