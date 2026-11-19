# Quest author AI consent

Both `/quest/contributions` and the contributions section of `/quest/[circleId]` enable the supported web transport with `aiConsent: true`. The shared controller defaults to false. Missing, partial or duplicate consent markup stops the canonical page before account client construction; an older configuration cannot present working consent controls.

After an explicit account check, authors load their posted messages and select a contribution. The selected message receives its own fresh author-state check. AI settings require a separate explicit check. Legacy absence remains off; no setting is assumed from the contribution list, withdrawal state or previous screen.

The full disclosure names Anthropic Claude, covers personal text and retention, explains that revocation cannot recall text already transmitted, and links to the versioned message policy. Allowing or reaffirming permission requires a fresh checkbox. Keeping future review off and revoking use a separate action. Each choice must receive the next consent revision and an independently matching readback before it is confirmed. Choosing permission does not invoke a provider.

An uncertain write is never retried automatically. A fresh read alone does not settle it; a new explicit choice advances the revision and fences older opposite writes. Message withdrawal and consent actions mutually retire confirmations. Every contribution callback captures its render epoch; consent also carries the shared message/context/interaction token. Old callbacks cannot target a new account, a different message, or a recreated selection of the same message.

## Local verification

`../evidence/quest-ai-consent-verification.json` binds the passing browser receipt, logs, screenshot, generated-host receipts and preserved provisional runs. The browser proof passed 10 scenarios and 100 canonical-handler requests with 166 source hashes and 20 runtime hashes. Scoped lint and the bundle succeeded. The browser and disposable database closed; provider and advice calls were zero.

The real Quest React wrapper, auth bridge, generated controller, DOM controls and CSS ran at 320px. Canonical member authentication used actual intent/selection matching and member SQL with synthetic cookies and provider identities. Contribution/message identity remains the inherited lower-level actor double. Current consent handlers and additive intent SQL ran in disposable PGlite. Held writes intentionally continued after browser retirement, producing real SQL conflicts after a newer choice. The test also replays an enabled old withdrawal while a different message has a fresh enabled withdrawal, plus old consent, checkbox and navigation callbacks.

The first provisional run failed an overstrict fixture assertion about the author's own DTO label; it was preserved before correcting the wire/UI distinction. The second preserved run passed before the stronger enabled-withdrawal regression was added. The old-callback defect was identified from source; no baseline reproduction is claimed.

These checks do not establish issued sessions, real provider access, independent PostgreSQL scheduling, deployed SQL, native or Quest headset behavior, immersive interaction or production acceptance. The AI provider remains disabled. Existing reviewer navigation continues to use the regular web application; this increment adds author consent to Quest contributions.
