# Synthetic local report screen — review candidate

This isolated source extends the independently re-reviewed 230-file report-redaction repair archive SHA-256 `fc9f1515ac0c0c79712888237747a9e1a161e5e23e4c6c20ec081345ee51209e`. No backend implementation, schema, quota, consent rule or deployment changed. Earlier milestone documents describe their respective historical checks. The external review kit records the checks for this candidate.

## Use and boundaries

In an explicit development `local-http` session, **Report a concern** opens a form about the existing fictional Ada participant and Riverside plan. Select one of the four API reasons and enter fictional details (at most 2,000 UTF-16 code units). Blank, disallowed control-character and malformed Unicode text cannot submit. Loading disables repeat actions. The existing bearer session submits to `/api/writes/report`; the form cannot choose the reporter identity. Fixture, blocked, release and disabled live-boundary modes cannot submit reports.

The receipt confirms local SQLite storage only. It contains the report ID, `submitted: true` and the API's explicit notice that there is no human review or response-time service and submission does not block contact. The form invents no reviewer, contact channel, notification, emergency service or response promise. There is no automatic block. The report text remains in the unencrypted local test database; closing or ending the demo does not delete a submitted report.

## Retry and privacy contract

- One in-memory key/hash identifies each explicit report intent. A missing, malformed, timed-out or lost write reply stays unconfirmed. Only a valid committed write response or recorded same-key receipt confirms storage. The authenticated report request/lookup deadline is 10 seconds; this does not time-bound initial app sign-in/health boot.
- Status checking reads the original key. Only an `absent` lookup with the original body still present enables an explicit same-body, same-key retry. An unresolved intent cannot be edited or replaced. A key conflict also stays unresolved. A definite rejection allows an explicit corrected new intent with a new key.
- Close, Android back, `inactive` and `background` clear the controller's subject, reason, details and receipt and close the form. An unresolved intent retains only its key/hash in this local session so a later explicit check can recover a minimal receipt. If the body was cleared and the lookup is absent, resending is disabled; no new report is automatically substituted.
- Success clears the form text and shows only the minimal receipt. Returning to the plan clears that receipt. Foreground refresh never submits or retries a report.
- **End local demo session** clears draft, receipt and unresolved tracking, disables that session and discards the adapter's owned bearer-token reference. Waiting sign-in/results cannot revive it. This is a local session end; there is no server logout/revocation endpoint and no such claim. Restarting the app explicitly starts a new synthetic session.
- Report text is neither persisted in client storage nor sent to logs/analytics by this flow. The normal report request intentionally sends it to the configured loopback test API. No promise of secure heap erasure, transport recall, keyboard/OS snapshot removal, or deletion from server storage is made. Already transmitted data and temporary network/runtime buffers may outlive clearing.

The existing local API enforces authentication, actor-scoped idempotency/lookup, report bounds and quota. The adapter additionally validates the exact minimal receipt and rejects reflected extra receipt fields or invented review notices. It does not render raw server errors. Local end suppresses participant data even if a response finishes parsing afterward.

## Review and local checks

New tests: `mobile/tests/reporting.test.ts` and `prototypes/soe-join-revoke/integration/report-ui.test.mts`. The integration tests use fresh temporary SQLite databases and fictional sessions only. They cover actor spoofing, cross-user receipt isolation, loss before/after delivery, stable retries, malformed replies, report timeout, delayed replies across navigation/background/end, expiry and lazy sign-in races. Existing mobile, backend and integration suites remain part of validation.

From this source root, using the already available Node 22.22.1 and local dependencies:

```sh
NODE_NO_WARNINGS=1 node --import ./mobile/node_modules/tsx/dist/loader.mjs --test mobile/tests/*.test.ts
./mobile/node_modules/.bin/tsc --noEmit -p mobile/tsconfig.json
./mobile/native/node_modules/.bin/tsc --noEmit -p mobile/native/tsconfig.json
NODE_NO_WARNINGS=1 node --experimental-strip-types --test prototypes/soe-join-revoke/tests/*.test.js prototypes/soe-join-revoke/tests/adversarial/*.test.js
NODE_NO_WARNINGS=1 node --import ./mobile/node_modules/tsx/dist/loader.mjs --test prototypes/soe-join-revoke/integration/*.test.mts
```

Native results and limitations belong to the external review evidence. A controller test, type check or bundle build alone is not a native interaction result. This candidate remains synthetic and unpushed and must stop for independent review. It does not authorize a real-user pilot.
