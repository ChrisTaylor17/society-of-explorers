# Meridian live demo

A multi-user demo of small plans for Society of Explorers. Synthetic people only.

The exhibition site stays at the repository root. This app is the `meridian/` directory. Point a Vercel project’s root directory at `meridian` so the preview does not replace the exhibition.

## What works

- Sign in with a magic name and passcode. Seeded passcodes are on the presenter walkthrough, not the public sign-in page.
- Profile with interests, free windows, a fictional area, and a `relay:` handle. Other signed-in people see overlapping interests and windows, plus area or bio only when you opt in.
- Propose a walk, hike, coworking hour, dinner, or making-something plan and invite people.
- Mutual consent before a relay handle is returned. The server omits it until both grants are active.
- Permissions for each person’s named agent, with one-click revoke. The next read enforces it within seconds. Revoking stops future sharing; it can't erase what was already seen.
- Private feedback after a plan is marked done. The other person does not receive the note.
- An audit log of grants and revocations. Each has an Ed25519 receipt. The signing key comes from `MERIDIAN_SIGNING_PRIVATE_KEY` and is not stored in the database. Receipts are hash-chained. The public key is at `/api/receipts/pubkey`, and `/verify` checks a receipt and the chain.
- Sign-in and signup are rate-limited. A new sign-in replaces older session tokens, and a session token rotates about every 15 minutes.

## What is not claimed

Matching is the overlap of interests and free windows. It is not private set intersection. Agents do not act by themselves. No messages are sent and nothing is booked. Receipts are not anchored on a chain. There is no token.

## Run

```bash
cd meridian
npm install
npm test
npm run dev
```

Open http://localhost:3000. The presenter script is at `/walkthrough`.

Without `DATABASE_URL`, local data is stored in `meridian/data/meridian.sqlite`. On Vercel, a connected private Blob store (`BLOB_READ_WRITE_TOKEN`) holds that same SQLite file so separate server instances share sign-in, consent, and revokes. If neither is set, Vercel falls back to an ephemeral file. See `.env.example`.

`MERIDIAN_SIGNING_PRIVATE_KEY` must be set or grants and revokes are refused. Reset requires a signed-in session and `MERIDIAN_RESET_SECRET`. Neither value is printed in the app. The walkthrough lists the seeded passcodes for the presenter.
