# Guide leaderboard privacy closure

The unauthenticated main-app `/api/leaderboard` previously used service authority to select members filtered only by `is_guide=true`. It returned `displayName`, guide level, salon/graduation counts and `guide_earnings_total` relabeled `guideExp`. Neither becoming a guide nor publishing a profile provides separate consent to publish activity or earnings. The only indexed application consumer was `app/leaderboard/page.tsx`.

The route now returns only HTTP 503 `{error:"Leaderboard unavailable.",code:"leaderboard_unavailable"}` through the existing private/no-store/noindex response helper. It imports no auth/database module and performs no member query. The page removes all ranking/name/activity render paths and the auth-checking PublicNav dependency. Its static public navigation, community/directory links and accessible retry remain useful. An exact 503 closure is distinguished from unexpected HTTP/network failure, malformed or legacy DTOs, and a 10-second total fetch+JSON deadline. Retry retires the previous generation synchronously; unmount clears the deadline and aborts/retire fences even nonabortable work. Publishing a profile is not treated as leaderboard consent.

## Local verification

- `verification/web/tests/leaderboard-closure.test.mjs`: 3/3 actual-route tests passed. The actual route and `privateJson` execute under the existing offline loader/NextResponse transport shim; database/auth import factories throw if reached. Exact response shape and private/no-store, noindex, Vary and no-cookie headers are checked.
- `verification/web/tests/browser-leaderboard.mjs`: 5/5 actual-page Chromium stories passed against the actual route/helper through intercepted HTTPS fulfillment. The actual React page and PublicFooter are bundled with cached Bun/React; no UI/auth/Next adapter is included. Product inline styles are exercised; global Next/PostCSS/font output is excluded. Explicit old/malformed/error DTOs and nonabortable header/JSON transport doubles exercise total deadline, retry and unmount retirement. All requests omit cookie, bearer and referrer, even with a fixture cookie present. There are zero auth/database imports, unexpected requests, page errors, React console errors or route errors. The source-bound receipt is `verification/web/evidence/leaderboard-browser.json` (generated evidence, not required source).
- The obsolete guide assertions in `scripts/external-effect-lazy-clients-smoke.mjs` were updated to the closed boundary while preserving every unrelated `/api/safe` assertion. The broad scanner was not repeated by this agent; root owns combined checks.
- Independent read-only review found no concrete defect in the frozen route/page. Root separately owns the actual Next build and built-app browser check.

Reproduce from canonical root with clean environment and the existing startup network deny guard: run cached Bun on `verification/web/scripts/bundle-leaderboard-test.mjs`; from `verification/web`, run `node --require ./scripts/deny-build-network.cjs --test tests/leaderboard-closure.test.mjs` and `node --require ./scripts/deny-build-network.cjs tests/browser-leaderboard.mjs`. No install, provider, live database, issued credentials, deployment or member consent is proven or used.

## Separate Prompt Atlas audit boundary

Prompt Atlas is the separate `prompts-mvp` application, not this guide endpoint. Its `/api/community` selects only prompt metadata and aggregate run/save/signal counts. The canonical base migration view explicitly requires public visibility and a nonfuture publication timestamp (202606180001_prompt_atlas.sql:292-311); it joins no profile names or run context. The discovery/share paths independently apply those publication predicates and do not project author/member/profile fields. The requesting member's favorite/signal flags are owner-filtered. Execution is authenticated and streams the requesting user's result with private/no-store headers; the reviewed run schema holds a fingerprint/accounting metadata rather than plaintext inputs/responses. Service-role bypass therefore does not, by itself, demonstrate a private prompt/run/favorite-row disclosure in these projections. This is canonical-source evidence only; hosted view definitions, deployed routes and effective grants were not queried here.

Bounded separate follow-ups identified, not changed by this closure: the Prompt Atlas create API defaults omitted visibility to public despite its UI defaulting private; the personalized discovery GET lacks explicit private/no-store response headers; favorite POST accepts a known prompt UUID without the signal route's publication eligibility check. None establishes a public private-content read from the reviewed community projection. Prompt Atlas failure/seed behavior is also separate: its community consumer silently retains existing prompt data on error/empty, and no-config discovery can display static authored seed counts; these are not verified usage.

Focused ESLint on the final route/page and scoped `git diff --check` passed. The final browser receipt records 5 stories, 22 GETs (17 executing the actual handler), and successful owned-browser cleanup. The runner initializes RUNNING before bundle/module/browser setup, writes CLEANING_UP before a bounded 5-second owned close and records final PASS only after cleanup. Failure cannot retain an earlier PASS receipt. A lint-only root brand link was replaced with static text; community and directory links remain.

## Frozen source hashes

- `app/api/leaderboard/route.ts`: `d65b5fa12f37e062bb979a6099e31bf52bddcd65068d17c5dd18717891227f08`
- `app/leaderboard/page.tsx`: `75b09e7ea2f94aa127510d4562fb7a6cb83f263113f806cb9cdbcabd05ff6cf4`
- `scripts/external-effect-lazy-clients-smoke.mjs`: `b7fd15672acfee0ddd07c04ff3c2550c0609ad0eb6dbfe765b962fce3a0adb04`
- `verification/web/tests/leaderboard-closure.test.mjs`: `cc715d7056ef1fca3c10850d2243a97680db9d647d6035b58499aba814e7c9fb`
- `verification/web/tests/browser-leaderboard.mjs`: `3ce42734d001ede7e7bf7c3b7fe696ff35d1d1cad440418a479c724b8a0a9370`
- `verification/web/tests/leaderboard-entry.tsx`: `35ac75d324dd0f9a6fe00df1ad133ab9166c2f82161c8c241ebfb0f9b4b48f67`
- `verification/web/scripts/bundle-leaderboard-test.mjs`: `80107d0b9dd1e17430a43da69a4c63e5a36f90615c5bbb725d4f639b46badb47`
- `verification/web/evidence/leaderboard-browser.json`: `7044a8e0ba2288da9345f5b688148d019b576c2e1c3f9ef7a34758d02cfe8274`
