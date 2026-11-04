# Synthetic participant report submission

This milestone adds an authenticated **API-only** submission path to the reviewed local SQLite backend. It does not add a native Report button, moderator account, report-reading API, operator dashboard, notification, human review or response-time service. All records and tests are fictional.

## Submission and receipt

Use the existing synthetic bearer session and exactly the existing four write-envelope fields:

```http
POST /api/writes/report
Authorization: Bearer <existing synthetic session>
Content-Type: application/json
```

```json
{
  "personId": "jules",
  "idempotencyKey": "report-intent-1",
  "payloadHash": "<canonical SHA-256 of body using src/hash.js>",
  "body": {
    "otherId": "ada",
    "category": "safety",
    "details": "Fictional test incident only.",
    "planId": "plan-riverside"
  }
}
```

`otherId`, `category`, `details` are required own fields; `planId` is optional. No other envelope/body fields are accepted. `personId` must match the authenticated session; `reporterId`, moderator/assignee/status fields and target-account deletion fields cannot be supplied. The target must be a different existing fixture person. Blocked or deleted targets can be reported about past events; the submitting account itself must remain authorized and not deleted. An optional plan must exist, including a closed fixture plan. Submission does not assert the allegation is true or require current contact access.

Categories are exactly `harassment`, `safety`, `spam`, `other`. Details are a well-formed Unicode string, raw length1–2000 UTF-16 code units, nonempty after trim. Leading/trailing whitespace is removed for storage. NUL, other C0 controls except tab/CR/LF, DEL and lone UTF-16 surrogates are rejected. Plain text such as markup is stored literally; it is not executed, rendered, fetched or converted into attachments. The report HTTP envelope is limited to8192 received bytes and must be valid UTF-8/JSON. Oversized requests return413; malformed encoding/JSON returns400; invalid fields, actors or hashes return403; invalid/replaced/expired sessions return401. Errors do not echo the submitted text.

Successful **durable** submission returns the existing committed-write envelope:

```json
{
  "status": "committed",
  "version": 1,
  "data": {
    "reportId": "report-<opaque random identifier>",
    "submitted": true,
    "notice": "Report submitted to local storage. This prototype provides no human review or response-time service. Submitting does not block contact."
  }
}
```

The receipt contains no reporter, target, category, text or incident timestamp. The identifier is not an access credential. Its `version` uses the existing highest-plan-version receipt convention; report submission does not increment plan versions or alter invitations, grants or blocks. It is a storage acknowledgment, not an authorization or moderation decision.

Reports require configured SQLite mode. The preserved default in-memory mode returns404/unavailable with an explicit **No report was submitted** message; it never issues a false durable receipt.

## Idempotency, limits and access

The existing person/endpoint/key namespace, canonical body hash and committed-receipt store apply. Same authenticated person/key/body returns the original minimal receipt; changed body with that key conflicts409. The hash covers the original JSON body, including whitespace in details; normalization of stored text does not merge distinct user intents. Pending/dropped-before outcomes create no report; lost-after-commit outcomes can be reconciled through the same authenticated `/api/lookup` endpoint without resubmission. Only the reporter's authorized session can retrieve their own **receipt**, never the stored report body. Deleting the reporter's account removes participant API access, including receipt lookup, under the existing tombstone policy.

A synthetic lifetime cap of **25 reports per person** bounds report/receipt growth. New intents beyond it return429 and create nothing. Same-key committed retries still return their receipt, and another fixture person's quota is separate. The cap persists across restart and is checked under the SQLite transaction. It is not a production rate-limit, emergency-contact route or operational policy; there is no automatic reset, quota-management UI or moderator override.

There is no `GET /api/reports`, list/filter endpoint, report-ID read endpoint or participant/administrator role that can read reports over HTTP. Unsupported reads return the same404 regardless of ID. A subject or unrelated participant cannot access another reporter's receipt namespace. The local OS/database owner can inspect the unencrypted file; this participant API boundary does not prevent that.

## Persistence and explicit schema migration

Checkpoint/schema version2 adds a private `reports` collection. Record fields are opaque ID, authenticated reporter ID, subject ID, category, trimmed details, optional plan ID, submission time. Each report and its exact minimal idempotency receipt are saved in the **same** existing SQLite transaction. Grant/block/version/session rules and the S1 denial barrier are unchanged.

Fresh database paths initialize version2. Existing version1 databases are deliberately refused by normal startup; they are never silently reseeded. With all writers stopped and an appropriate offline preservation decision, explicitly run from the backend directory:

```sh
node --experimental-strip-types src/migrate-reports.js /absolute/private-directory/world.sqlite
```

This validates the recognized version1 checkpoint, adds an empty reports collection, and transactionally replaces the table/checkpoint/schema marker with version2, preserving every prior state collection and version. Invalid, missing, foreign or newer files are refused. Repeating the command on valid version2 is a no-op validation. Earlier version1 code rejects version2 rather than silently dropping reports. Do not run old/new writers together during migration. No automatic backup, downgrade or general future migration framework is supplied.

The file still uses the experimental Node22.22.1 built-in SQLite implementation already present on this Mac. No dependency installation or cloud service is added. It is mode0600, unencrypted, and remains a small synchronous single-host checkpoint store. The prior durability documentation describes its original version1 milestone; use this document for the version2 transition.

## Privacy and operational gaps

No request logger, report telemetry, console report dump, notifier or external destination is added. Receipts and generic errors omit reporter identity and details. Report-path unexpected exceptions are redacted even in fault-test mode, and corrupt checkpoint JSON errors do not include stored text. Tests capture the owned normal server's stdout/stderr and verify that fictional reporter/text canaries never appear.

Reports remain on disk after account tombstoning. There is **no retention deadline, automatic purge, appeal/correction workflow or physical erasure claim**. Reporter identity and free text are deliberately retained in the unencrypted database and possible historical pages/journals/backups. Real-data retention/access/erasure decisions are unresolved. No log capture or artifact includes actual report database files.

Operational staffing, a moderator authorization and access model, review prioritization, incident escalation, handling of urgent danger, user follow-up and service levels are all missing. This prototype accepts local synthetic submissions only; “submitted” must not be presented as “a human is reviewing” or “help will arrive.” Real identity/abuse defenses, backup/disaster recovery, native/physical-device/iOS validation and production release readiness remain separate blockers. No real-person pilot or production clearance is implied.
