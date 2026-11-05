# Quest member Circle host

The canonical web route `/quest/[circleId]` imports `member-circle-page.mjs`. Its `mountExistingMemberCircle({window, document, config})` export accepts a strict Circle UUID, explicit HTTPS origin and existing verifying auth interface. Standard browser transport defaults to fetch with redirect rejection, no credentials cookies, no-store requests and no referrer. A deliberate session check in the regular browser or headset starts account verification.

The page requires the controls shown in `circle.html`. The archive additions are `circle-archive-open`, `circle-archive`, `circle-archive-status`, `circle-archive-messages`, `circle-archive-next`, and `circle-composer`. Missing markup is rejected before provider subscription work. Closure removes subscriptions/listeners and clears private DOM, including when markup changes during retirement.

`circle-host.mjs` is generated from `../shared/quest-entry.ts`:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor python3 platforms/scripts/build-shared.py
```

The active member path provides current flat conversation/posting plus complete archive and thread reads. The canonical route also offers a read-only immersive discussion panel on a compatible device. It checks the account and Circle access inside the room and clears the preview on exit or loss of authority. The regular browser still carries the complete archive, live meeting links and member actions. Device behavior remains open. [Immersive room behavior and verification](../../docs/integration/quest-immersive-discussion.md)

The canonical Quest contribution views now opt into per-message author AI consent controls with `aiConsent: true`. Older configurations default to unavailable. The complete consent markup is required before the canonical page constructs its account client. See [author AI consent](AUTHOR_AI_CONSENT.md) for behavior, proof and remaining acceptance limits.
