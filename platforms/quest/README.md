# Quest member Circle host

The canonical web route `/quest/[circleId]` imports `member-circle-page.mjs`. Its `mountExistingMemberCircle({window, document, config})` export accepts a strict Circle UUID, explicit HTTPS origin and existing verifying auth interface. Standard browser transport defaults to fetch with redirect rejection, no credentials cookies, no-store requests and no referrer. The wrapper makes no SDK method or private API call until the user chooses **Check member session**.

The page requires the controls shown in `circle.html`. The archive additions are `circle-archive-open`, `circle-archive`, `circle-archive-status`, `circle-archive-messages`, `circle-archive-next`, and `circle-composer`. Missing markup is rejected before provider subscription work. Closure removes subscriptions/listeners and clears private DOM, including when markup changes during retirement.

`circle-host.mjs` is generated from `../shared/quest-entry.ts`:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor python3 platforms/scripts/build-shared.py
```

The active member path provides current flat conversation/posting plus complete archive and thread reads. The preserved WebXR renderer/session files in `prototypes/` are not connected to authenticated member data. There is no claim of headset, controller, XR text input, native Quest APK or immersive acceptance.

The canonical Quest contribution views now opt into per-message author AI consent controls with `aiConsent: true`. Older configurations default to unavailable. The complete consent markup is required before the canonical page constructs its account client. See [author AI consent](AUTHOR_AI_CONSENT.md) for behavior, proof and remaining acceptance limits.
