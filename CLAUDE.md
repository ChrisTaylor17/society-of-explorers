# Society of Explorers: notes for agents

Read `node_modules/next/dist/docs/` before changing Next.js code. This is Next.js 16 and differs from older versions; heed deprecation notices. `AGENTS.md` has the same warning plus older project background.

## Ground rules
- This repo is PUBLIC. Never commit secrets, keys, emails, phone numbers, addresses, meeting links, internal plans, prices or business notes. `.env.example` holds names only.
- Archive instead of deleting. Use `git mv` into `archive/` and keep history.
- Never break the live Mira tutor page or its crisis path:
  - page: `app/salons/republic-book-1/mira/` (route `/salons/republic-book-1/mira`)
  - API: `app/api/salons/republic-book-1/mira/route.ts`
  - prompt and crisis wording: `lib/claude/miraTutor.ts` (routes to 988 in the US)
  Change these only with a clear reason, and check the crisis wording is intact.
- Mira Vale is always labeled as an AI, in copy, prompts and UI.
- Test on a Vercel preview before merging. Wait for the Vercel status on the head commit to be green.

## Copy
- No em-dashes in user-facing copy.
- No crypto, investment or price talk in app copy.
- Keep plain modern English. See `STYLE.md` for the look (`--soe-*` tokens in `app/globals.css`).

## Code
- Keep the existing code style: TypeScript, App Router, CSS modules, route handlers under `app/api/`.
- Do not edit files under `archive/`, `platforms/source/` or `verification/` unless the task is about them.
- Do not upgrade dependencies to reproduce a result; lockfile governs.

## Commands
- `npm ci` then `npm run build` (production build and type check)
- `npm run lint`
- `npm test` (security and growth suites; see `verification/web/README.md`)
- `npm run dev` for local work
