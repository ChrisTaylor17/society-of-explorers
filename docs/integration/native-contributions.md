# Native own contributions

The verified member-account gate now offers **View my contributions** separately from **Continue to Circle**. Opening the contributions view does not load data. The member chooses **Load my posted messages** to read their own messages across Circles, including after leaving a Circle or when its listing is hidden. This author access does not join a Circle, grant membership or enable another member's archive. The default native application still requires trusted application-owned sign-in and transport composition.

`ContributionsScreen` uses the shared `createMemberContributions` controller. List pages replace each other and contain at most 25 owned message states. Selecting a contribution clears the list and performs a fresh message-state GET for that exact Circle/message pair. Only current author withdrawal controls are presented. Hidden messages remain tombstones with author-facing explanations; withdrawn bodies do not reappear. Withdrawal requires a separate acknowledgement and discloses that restricted safety evidence may remain.

An uncertain withdrawal retains the exact reviewed request privately. List refresh, pagination, selection, back and return-to-account navigation stay blocked while an operation is busy or its action outcome is unknown. A current-state GET cannot confirm that action; only a manual exact retry can confirm its receipt. **Close member view** remains available and retires all private details and pending keys. Account changes, inactivity, Android blur, offline/unknown connectivity and unmount also retire the view. Returning active or online never automatically reads or retries.

The JavaScript native adapter and Android Kotlin source add only `GET /api/circles/contributions` with no query or one raw UUID `after` cursor. They reject `limit`, duplicate/unknown/encoded parameters, bare query delimiters, fragments, alternate paths and writes. Existing cookie exclusion, exact authorization, redirect rejection, request-generation, cancellation and response bounds remain in force. Kotlin is source-checked, not compiled or run.

## Local verification

The scoped browser fixture runs the actual native account and contributions TSX, verified owner and shared controllers against canonical member/contributions/message handlers and actual Circle SQL in a disposable PGlite database. React Native DOM primitives, AppState, connectivity, the existing SDK identity, the server authenticated-member boundary and HTTP delivery are explicit synthetic doubles. The fixture supplies no Circle archive or membership endpoint.

The new browser proof passes **9/9 stories**, binding **52 source files** and **70 intercepted requests**. It covers explicit account entry and list loading; own messages across two actually left and quarantined Circles; 25-plus-2 pagination; hidden-message author explanations; a committed withdrawal with a lost response and exact SQL receipt replay; rejected ownership/tuple changes; held list, state and committed-action JSON retired through four lifecycle boundaries; global close during uncertainty; and unknown connectivity with explicit recovery. At 320px, the DOM fixture has no horizontal overflow, provides keyboard acknowledgement and keeps visible controls at least 48px high. Owned browser and database cleanup completes without page errors or unexpected requests.

The transport suite passes **4/4**: three executable JavaScript policy cases and one explicitly static Kotlin check. Scoped lint passes for `ContributionsScreen`, `MemberCircleScreen` and the JS native adapter. The unchanged existing-account browser suite also passes **9/9** against the changed parent (37 source bindings, 27 requests), and its account transport suite passes **4/4**. Historical fixture sources and archived checkpoint evidence remain available; the new contributions evidence uses separate output names.

Run from the canonical checkout with cached runtimes and external-network denial:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor verification/web/tooling/node_modules/@oven/bun-darwin-aarch64/bin/bun --no-env-file --no-install --preload ./verification/web/scripts/deny-build-network.cjs platforms/tests/bundle-native-contributions.mjs
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./verification/web/scripts/deny-build-network.cjs platforms/tests/browser-native-contributions.mjs
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./verification/web/scripts/deny-build-network.cjs --test platforms/tests/native-contributions-policy.test.mjs
```

The receipt is `verification/web/evidence/native-contributions-browser.json`; the fixture manifest and bundle use `native-contributions-fixture/`, with a 320px screenshot alongside. Logs are `platforms/evidence/native-contributions-{bundle,browser,policy,lint}.log`. The initial nine-story receipt, runner, log and manifest were archived before tightening the held-response endpoint/method assertion; the final receipt preserves that prior attempt.

This is local source/browser/SQL evidence. It does not establish issued credentials, provider acceptance, native dependency/SDK availability, Codegen, compilation, Hermes behavior, secure OS storage or networking, device accessibility, production SQL or deployment. No install, provider call, native execution or production change is part of this milestone.
