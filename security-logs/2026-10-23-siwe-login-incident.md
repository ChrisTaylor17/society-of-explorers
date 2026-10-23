# SIWE wallet login incident, 2026-10-23 (times ET)

Production deployment: dpl_E3hbXc8KdGeQ7Sux7hHoQSfPNKpM (secure-only release). Source: `vercel logs`, project society-of-explorers.

| Time (ET) | Request | Status | Server log |
|---|---|---|---|
| 11:00:01 / 11:00:11 | GET /api/auth/nonce, POST /api/auth/siwe | 200 / **500** | none (route returned "Unable to create wallet session." without logging) |
| 11:01:42 – 11:07:50 | ~30 nonce + siwe pairs | 200 / **400** | `TypeError: non-canonical s; use ._s` (ethers 6.17.0 in SiweMessage.verify), then `SIWE error: Unknown SIWE error` |

Every 400 carried the same high-s value (0xc65c…8595). The production members table could not be inspected from the box
(TLS reset to the Supabase host), so the exact branch behind the single 500 (no member row vs. no session value) is not proven.

Fix branch: fix-siwe-wallet-session-2026-10-23 (canonicalise high-s signatures, deterministic member lookup,
any well-formed UUID, server-side failure reasons). Tests: tests/security/s10-siwe-wallet-session.test.ts.
No signatures, secrets or full wallet addresses are recorded here.
