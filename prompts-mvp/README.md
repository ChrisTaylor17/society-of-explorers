# Society of Explorers Prompt Atlas

Prompt Atlas is the isolated, production-oriented prompt discovery and execution app for Society of Explorers. It lives entirely under `/prompts-mvp` so the existing salon, movement, and capital work in the repository remains untouched.

## Product

- Kinetic prompt discovery with category, shuffle, newest, and trending modes
- Editable prompt workspace with streamed Claude responses
- Supabase email/Google auth and shared SoE SIWE wallet sessions
- Member-owned favorites and public/private custom prompts
- Aggregate-only execution tracking; raw context and model output are not stored by default
- Five free runs per calendar month
- Prompt Atlas Pro at the configured Stripe price (`$12/month` launch target) with unlimited monthly runs and a 30/hour abuse guard
- Community leaderboard based on usage, favorites, and votes

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
2. `supabase/seed.sql`

The schema references the existing `public.members` table so email and wallet identities continue to resolve to the same Society member.

## Verification

```bash
npm run lint
npm run build
npm audit --omit=dev
npm run check:env
```

`check:env` is expected to fail on machines that have not received production credentials. Never put server secrets in a `NEXT_PUBLIC_` variable or commit `.env*` files.

## Deployment

See `docs/deployment-runbook.md` for Supabase, Stripe, Vercel, DNS, rollback, and post-deploy checks.

The accepted design references are in `docs/design/`, and their extracted implementation rules are in `docs/design-spec.md`.

