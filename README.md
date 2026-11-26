# Society of Explorers

Society of Explorers (SoE) is a members club that reads Plato, Scripture and the Great Books together in live online salons. Each salon is led by Mira Vale, an AI tutor who asks questions and keeps the conversation moving, so the members do the thinking. Any belief is welcome, and the aim is careful reading and respectful disagreement.

This repository is the SoE web app, built with Next.js 16 and deployed on Vercel.

## What is in this repo

Pages (under `app/`):

- `/try`: the free public trial of the reading experience.
- `/great-books`, `/library`: Great Books reader, passages and seminar notes. `/great-books/scripture` and `/fellowship` cover Scripture readings.
- `/council`: the council and figure chat, where members talk with Great Thinker personas.
- `/salons`: salon listings, including the Mira tutor page at `/salons/republic-book-1/mira`.
- `/circles`: small reading circles, with invitations, discussion threads and safety and reporting tools.
- `/practice`: a short daily reading practice.
- `/account`, `/billing`, `/login`: sign-in, profile, supporter billing and account deletion.
- `/capital`, `/92b`: private admin pages.

API routes live under `app/api/` (about 200 route handlers). Main groups: `thinker`, `message` and `council` for figure chat, `salons` and `salon-message` for salons and the Mira route, `great-books` and `library` for texts and passages, `circles`, `practice`, `auth`, `stripe` and `supporter` for payments, `cron` for scheduled jobs (see `vercel.json`).

## Run it locally

```sh
npm install
npm run dev
```

Open http://localhost:3000/try. Copy `.env.example` to `.env.local` and fill in only what you need; features without their settings report themselves as unavailable. Public reading pages work without any account.

Environment variable names (values are never committed; see `.env.example` for the full list):

- Site: `SITE_URL`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`
- Database and sign-in: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXTAUTH_SECRET`, `WALLET_SESSION_SECRET`, `WALLET_ENCRYPTION_KEY`
- AI: `ANTHROPIC_API_KEY`, `AI_GATEWAY_API_KEY`, `AI_GATEWAY_ENABLED`, `AI_GATEWAY_ANTHROPIC_BASE_URL`, `AI_GATEWAY_ANTHROPIC_MODEL`, `SALON_MIRA_MODEL`, `SALON_GUIDE_MODEL`, `MOVEMENT_CLAUDE_MODEL`, `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, `OPENAI_SAFETY_SALT`, `SOE_MESSAGE_AI_ENABLED`
- Voice, images, video: `ELEVENLABS_API_KEY`, `FAL_API_KEY`, `DAILY_API_KEY`
- Payments: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_MERCH`, `STRIPE_PRICE_SEEKER`, `STRIPE_PRICE_SCHOLAR`, `STRIPE_PRICE_PHILOSOPHER`, `STRIPE_PRICE_ORACLE`, `PRINTFUL_API_KEY`
- Email: `RESEND_API_KEY`, plus several `*_EMAIL_NOTIFICATIONS_ENABLED` switches
- Admin and account deletion: `SOE_ADMIN_EMAILS`, `SOE_ACCOUNT_DELETION_REQUESTS_ENABLED`, `SOE_ACCOUNT_DELETION_REVIEW_DAYS`, `SOE_ACCOUNT_ERASURE_ACCESS_ENABLED`
- Other feature switches and legacy settings are listed in `.env.example`.

Checks:

```sh
npm run build   # production build and type check
npm run lint
npm test        # security and growth suites
```

## Project layout

- `app/`: Next.js App Router pages and API routes
- `components/`: shared React components
- `lib/`: server and shared logic (AI prompts in `lib/claude/`, books and passages, circles, payments, auth)
- `content/`: Great Books texts, clips and editions served by the app
- `public/`: static assets
- `supabase/`: database migrations and schema
- `tests/`: security and growth test suites
- `scripts/`: smoke tests and content import tools
- `platforms/`: shared code and tests for the native apps
- `verification/`: offline build and test harness
- `docs/`: design notes, contracts and integration records
- `archive/`: earlier experiments, kept for reference and not used by the app

## Related projects

The iOS, Android and Quest app shells and the marketing site live elsewhere, in a separate site and separate projects. This repo holds the web app and the code shared with those shells.

## Mira is an AI

Mira Vale is always presented as an AI. She says so in her welcome, answers plainly if anyone asks whether she is human, and the salon page states that she is software and can be wrong about the text.

## Safety

If a guest in a salon seems to be in distress or speaks of self-harm, Mira stops the discussion and shows a fixed message that points to 988 (call or text, United States) or the local emergency number elsewhere, and the host follows up privately. The wording is in `lib/claude/miraTutor.ts` and is used by `app/api/salons/republic-book-1/mira/route.ts`.
