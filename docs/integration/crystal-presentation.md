# Crystal Hub local presentation boundary

Implemented locally November 10, 2026. This is a proposed internal software boundary, with synthetic verification only. No device, hosted route or provider is connected.

Design source: [Crystal Hub Engineering Design Package v0.1](</tmp/codex-remote-attachments/01a1c6c0-b97b-7b60-99d5-183061c7901f/1DB977A4-C289-45CF-B4DA-0C950CEFA977/1-Crystal-Hub-Engineering-Design-Package-v0.1.md>), §6 (lines 288–301) and §12 (lines 575–589). Section 6 distinguishes idle, listening, thinking and a speaking thinker's signature color. Section 12 assigns member-session start and removal cleanup to the key manager. These establish software behavior, not an implemented device protocol.

`platforms/shared/crystal-presentation.ts` reuses the existing verified-session owner's `scope`/`subscribe` signals and `lib/claude/thinkers.ts` canonical lookup. The prior search found no equivalent crystal/listening/speaking controller in `platforms/shared`, `lib/circles` or `lib/claude`. Existing account and thinker modules are unchanged.

## Contract

1. The host supplies an existing verified-session owner. This module does not verify a key, ring, NFC identifier, wallet, member account or Circle entitlement. It never reads credentials. The actual server remains responsible for authorizing any future account action.
2. After existing verification, an explicit `activate()` returns an opaque **local session handle**, or `null`. It does not accept an identity or key identifier. No owner notification activates a presentation automatically.
3. `selectThinker(session, id)` accepts only the six existing canonical profiles. `consentToVoice(session, true)` records local intent for that session. Default and non-`true` values refuse voice presentation. This local flag does not replace separate provider/transcription consent or authorize microphone access.
4. `beginListening(session)` returns an opaque **local turn handle**. The only forward sequence is `beginThinking(turn)` → `beginSpeaking(turn)` → `finishSpeaking(turn)`. An out-of-order, copied, stale or repeated handle is refused. `cancelTurn(turn)` clears that turn. Changing thinkers also cancels the current turn.
5. `retire(session)` is the simulated key-removal signal. It clears selected thinker, local consent, phase and pending turn. A delayed removal event for an older session cannot clear a newer session. Owner scope changes, verification loss/suspension and read failures also retire the presentation. Explicit reactivation yields a new handle, even for the same member, and requires fresh selection and local consent.
6. `close()` permanently retires and detaches the controller. Observers cannot mutate its frozen snapshots; an observer exception does not prevent cleanup. Reentrant retirement is published before later observers can receive stale speaking state.

The model has exactly four fields:

```ts
{
  sessionActive: boolean,
  phase: 'idle' | 'listening' | 'thinking' | 'speaking',
  thinkerId: string | null,
  speakingColor: string | null // non-null only during speaking presentation
}
```

No member identifier, email, biography, credential, transcript, voice ID, prompt, account tier, EXP balance or memory is accepted or exported. The selected thinker's ID/color are copied from the canonical profile; the full profile is not retained in presentation state. Session/turn handles are in-process object identities, not serialized wire messages, credentials or authority grants.

## Explicit assumptions and remaining integration work

- **Proposed scope:** one active presentation session and one pending turn. Multi-person seats/Council behavior are not implemented or resolved by this choice.
- **Proposed consent behavior:** local voice intent is default-off and cleared at session retirement. The design package does not specify this software API. Future provider or microphone use needs its own consent and lifecycle checks.
- **Presentation only:** `listening` and `speaking` are software states, not acknowledgements that a physical microphone, speaker or light is operating. No animation timing, RGB calibration, device command, audio capture or cloud call is implemented. The module does not implement or certify the physical Hush switch.
- **Cleanup boundary:** retirement erases this module's small in-memory state. The host still owns stopping the verified-session helper, unmounting archives and disposing audio/model work. No credential vault, transcript store or personal memory is introduced or wiped here.
- **Next justified task:** adapt an actual hardware-owner-approved session/device contract to these inputs once that contract exists. It must carry retirement safely across the chosen transport and account for disconnected/late events. No pairing, USB/BLE/NFC protocol or whole-member export should be guessed. A visual demo is optional; deterministic transition tests already verify the state contract without a new hosted surface.

## Verification

`platforms/tests/crystal-presentation.test.mjs` executes the actual controller, canonical thinker lookup and existing verified-session helper with synthetic identity verification. It tests all six colors, default/refused/revoked voice intent, account switches including a return to the original member, simulated key removal at every phase, late/repeated/forged/cross-controller actions, stale session commands, observer failures and least-data snapshots.

Strict platform type checking uses `platforms/tests/tsconfig.crystal-presentation.json`, extending the existing strict project configuration. The existing web build excludes `platforms`; a new web build alone would not validate this module. The prior helper lint/build and 15 focused groups remain separate, unchanged receipts. No duplicate search, provider check, hardware test or customer result is claimed.
