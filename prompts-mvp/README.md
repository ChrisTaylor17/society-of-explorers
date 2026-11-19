# Society of Explorers Prompt Atlas

Prompt Atlas is the isolated, production-oriented prompt discovery and execution app for Society of Explorers. It lives entirely under `/prompts-mvp` so the existing salon, movement, and capital work in the repository remains untouched.

## Product

- Kinetic prompt discovery with category, shuffle, newest, and trending modes
- Guided revenue path for offer, pricing, customer, and trust-page prompts
- Curated prompt packs for revenue launch, paid community design, and sovereignty audits
- Interactive revenue-loop selector that explains each pack's artifact, upgrade moment, and privacy boundary before asking for payment
- Privacy-safe public prompt share pages at `/p/{slug}` with prompt-specific metadata and OG cards
- Editable prompt workspace with streamed Claude responses
- Supabase email/Google auth and shared SoE SIWE wallet sessions
- Member-owned favorites and public/private custom prompts
- Aggregate-only execution tracking; raw context and model output are not stored by default
- Five free runs per calendar month
- Prompt Atlas Pro at the configured Stripe price (`$12/month` launch target) with unlimited monthly runs and a 10/hour fair-use pace
- Member-controlled Stripe Customer Portal access for payment methods and cancellation
- Sortable community leaderboards and category demand signals based only on aggregate usage, favorites, and member signals
- Email-allowlisted, aggregate-only operator evidence for activation, conversion, subscription run rate, churn pressure, model-token cost, and launch readiness

## Run Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The visual shell and seed prompt catalog work without credentials. Authentication, persistence, Claude execution, and billing require the environment variables in `.env.example`.

## Database

Apply these files to the existing SoE Supabase project in order:

1. `supabase/migrations/202606180001_prompt_atlas.sql`
2. `supabase/migrations/202606180002_prompt_run_recovery.sql`
3. `supabase/migrations/202606180003_prompt_billing_event_order.sql`
4. `supabase/migrations/202606180004_provider_run_accounting.sql`
5. `supabase/migrations/202606180005_prompt_plan_limits.sql`
6. `supabase/migrations/202606180006_prompt_operator_metrics.sql`
7. `supabase/migrations/202606180007_prompt_catalog_expansion.sql`
8. `supabase/migrations/202606180008_unlimited_pro_runs.sql`
9. `supabase/seed.sql`

The schema references the existing `public.members` table so email and wallet identities continue to resolve to the same Society member.

## Verification

```bash
npm run lint
npm run build
npm run ui:smoke
npm audit --omit=dev
npm run operator:smoke -- --list
npm run operator:smoke
npm run operator:smoke -- --with-ui
npm run privacy:smoke
npm run checkout:safety:smoke
npm run billing:integrity:smoke
npm run community:growth:smoke
npm run community:privacy:smoke
npm run operator:metrics:smoke
npm run prompt:catalog:smoke
npm run prompt:packs:smoke
npm run prompt:share:smoke
npm run billing:return:smoke
npm run billing:portal:smoke
npm run billing:duplicate:smoke
npm run billing:intent:smoke
npm run billing:price:smoke
npm run billing:lifecycle:smoke
npm run provider:accounting:smoke
npm run plan:economics:smoke
npm run db:readiness:smoke
npm run stripe:live:smoke
PROMPT_ATLAS_BASE_URL=https://prompts-mvp.vercel.app npm run execute:live:smoke
npm run vercel:env:smoke
npm run check:env
```

`operator:smoke -- --list` prints the local smoke plan without running child scripts. `operator:smoke` runs the complete local privacy, billing, community-growth, prompt-pack, share-link, aggregate-metrics, provider-accounting, and plan-economics smoke manifest. It fails if a smoke script is added or removed without classifying it as default or opt-in. Each script has a 30-second timeout; `PROMPT_ATLAS_SMOKE_STEP_TIMEOUT_MS` can raise it to at most 120 seconds. Unknown operator arguments fail before any child script runs. `ui:smoke` verifies the signed-out discovery, prompt deep links, prompt packs, revenue-loop selector, community growth rail, customize workspace, Pro dialog, aggregate operator launch board, and mobile layout with Playwright. `operator:smoke -- --with-ui` includes that opt-in browser UI smoke in the full manifest, `operator:smoke -- --with-db-readiness` includes the production Supabase contract check after migrations are applied, `operator:smoke -- --with-live-execution` includes the opt-in Claude execution check when `PROMPT_ATLAS_BASE_URL` is set, and `operator:smoke -- --with-vercel-env` checks Vercel Production/Preview env names and secret classification without reading values. Browser paths launch or reuse a local dev server, write screenshots under `.next/ui-smoke/`, and can run against a preview URL with `PROMPT_ATLAS_BASE_URL`. The individual commands remain useful for focused checks.

After the migrations are applied, run `npm run db:readiness:smoke` with production Supabase credentials available locally. It verifies the table/view contracts, service-role-only execution, billing, and operator RPCs required by the live app, then creates a temporary active Pro member and confirms `reserve_prompt_run` returns `runs_limit: null` for unlimited monthly paid runs. `/operator` is available only to signed-in emails in the server-only `SOE_ADMIN_EMAILS` allowlist. The database function returns aggregate totals rather than member rows; the page does not poll, send analytics events, or call Stripe.

To apply only the pending unlimited-Pro migration from the terminal, provide `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`, or `SUPABASE_ACCESS_TOKEN` with a linked Supabase project, then run:

```bash
npm run db:apply:unlimited-pro -- --apply
```

Without `--apply`, that command is a dry run and makes no database changes. The service-role key is enough for readiness checks, but not schema DDL.

`execute:live:smoke` creates a temporary wallet member, calls `/api/prompts/execute`, verifies SSE `meta`, `delta`, and `done` events plus token accounting, then deletes the temporary member so prompt-run rows cascade away. It calls the configured Claude provider once, so keep it opt-in.

`vercel:env:smoke` calls `vercel env ls --format json`, checks only variable names, targets, and secret/encrypted classification, and never prints env values. It should pass before preview transaction testing.

`stripe:live:smoke` uses Stripe metadata only. It verifies the live Prompt Atlas Pro Price contract, the enabled production webhook, and the active Customer Portal configuration without creating customers, checkout sessions, subscriptions, or charges. Include it in `operator:smoke -- --with-stripe-live` when you want the aggregate readiness manifest to cover external Stripe setup.

`check:env` is expected to fail on machines that have not received production credentials. Sensitive Vercel env values may be blank in pulled local files, so use Vercel's encrypted env list as the source of truth for deployment and local secrets as the source of truth for local execution. Never put server secrets in a `NEXT_PUBLIC_` variable or commit `.env*` files.

## Deployment

See `docs/deployment-runbook.md` for Supabase, Stripe, Vercel, DNS, rollback, and post-deploy checks.

The accepted design references are in `docs/design/`, and their extracted implementation rules are in `docs/design-spec.md`.
