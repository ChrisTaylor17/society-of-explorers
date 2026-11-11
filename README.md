# Society of Explorers

A community and reading app for Christian-rooted fellowship, Scripture, Great Books and respectful disagreement. The free public trial starts at `/try`; private Circles, account services, AI, payments and native/Quest releases have separate acceptance requirements.

## What to open

The existing public exhibition is a **different deployment and repository** from this app. These pages are currently reachable without an account:

- [Christian fellowship and the Good Samaritan](https://www.societyofexplorers.com/fellowship)
- [The complete letter to Philemon](https://www.societyofexplorers.com/readings/philemon)
- [Salon planner](https://www.societyofexplorers.com/salon-plan)

The canonical app's public trial includes `/try`, `/great-books/apology`, `/fellowship/scripture`, `/salons/pilot` and `/travel`. A local build does not put these paths on the public domain. [Verified destination and release options](docs/integration/public-phone-release-options-2026-11-11.md).

## Current work and recovery

- [DONE.md](DONE.md): ordered completion checklist, results and exact unresolved dependencies.
- [DECISIONS.md](DECISIONS.md): decisions made during this finish pass.
- [Completion audit](docs/integration/finish-audit-2026-11-11.md): implemented features, limitations and prior evidence.
- [RELEASE_STATUS.md](RELEASE_STATUS.md): dated release reconciliation; its historical test counts are not fresh acceptance of later work.

Canonical checkout: `/Users/christaylor/Documents/Codex/soe-release`, branch `codex/soe-first-release`. Restore commit `7020eb5` preserves the state before the November 11 finish pass. Later scoped commits preserve each correction. No reset or force-push is needed to inspect or recover an earlier version.

## Run a local public preview

Use a clean, materialized checkout with the existing locked dependencies. Do not put issued credentials or `.env` files into an offline preview. The app uses local font packages, so the build needs no remote font download.

From the checkout root:

```sh
mkdir -p verification/web/evidence
python3 verification/web/scripts/build-offline.py --webpack --fixture-public-config
```

This performs the production build/type check with invalid public placeholders, a clean environment and blocked outbound app networking. It refuses runtime dotenv files and cloud-only source placeholders. A failure is written to `verification/web/evidence/next-build.json`; inspect its log instead of treating a partial build as success.

For development in a separately configured checkout, the standard scripts remain:

```sh
npm run dev -- --hostname 127.0.0.1
# After a successful build:
npm run start -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/try`. These standard scripts load the checkout's normal environment; they are not an isolated recovery or provider test. Public readings work without member credentials. Member-dependent actions should report unavailable in an unconfigured environment. Do not point a test at production merely to remove that message.

The November 11 verification uses a separate materialized snapshot with reused locked dependencies and an outbound-denied runtime. Its exact run/view receipt is recorded in `DONE.md` when acceptance finishes. Dependencies are governed by `package-lock.json`; do not upgrade them to reproduce a result.

## Verification

```sh
npm run lint
npm test                  # isolated security and growth suites
npm run test:web          # web/component/disposable database suites
npm run test:platforms    # shared native and Quest contracts
```

The test runner uses one bounded process per suite, a clean environment and startup network denial. Results and per-file logs live in `verification/web/evidence/test-run/`; use a distinct `--output` argument to preserve earlier runs. Missing tools fail explicitly and are never installed automatically. For example:

```sh
npm run test:growth -- --output=growth-review
```

See [the verification guide](verification/web/README.md) for the locked Bun/JSDOM tools, host requirements, database fixtures and exact browser scope. Fixtures and local simulations do not establish real member privacy, customer use, delivery, payments or physical-device acceptance.

## Boundaries that remain real

The public reading path needs no account or payment. Private member intake still depends on a verified hosted backup/restore, applied access controls and real-account sign-in/recovery tests. Deletion intake and paid/provider capabilities must remain unavailable where the promised outcome cannot yet be fulfilled. A prepared salon has no host or dates until those are actually confirmed.

Keep the separate static exhibition, this app, Root Kernel, Northstar and historical prototypes distinct. Preserve uncommitted work and archived source. Do not deploy the whole private app over the public exhibition to expose a few readings. Spending, missing credentials and irreversible operations require Chris under the current instruction.
