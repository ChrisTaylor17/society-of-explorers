# Recorded live sessions and truthful calendar dates

## Verified problem and change

At base revision f6b1c04780b4f9e398b9197184fa75ef6d96b009, the actual GET handler returned a computed next Wednesday and recurring calendar even when the disposable database contained no Council event. A denied community lookup produced the same successful response. Those baseline cases use actual source and the installed Supabase SDK, with fictional records and a local PostgreSQL transport; they are not live-production probes.

The local reader now distinguishes absence from failure. It selects a currently marked-live, unfinished Council session first, otherwise the next recorded future session. The past list requires a recorded end. A long-running session is no longer lost merely because its scheduled start is over an hour old, and an elapsed but never-ended booking is not called a completed meeting. Data is bounded to the existing seven public schedule fields; room URLs, transcripts and metadata are excluded.

A missing community or genuinely empty schedule returns no date or calendar. Lookup failures or malformed records return a generic private/no-store 503. A shared parser on the page derives the calendar from the selected record and ignores old synthetic dates or supplied links. Requests have bounded timeouts. The page separates loading, unavailable, empty, scheduled and live states, with a keyboard-operable retry/refresh action. Refresh retires the previous join and calendar state.

Calendar copies describe one recorded event, with its actual UTC start and a stable event identifier. No weekly recurrence or unconfirmed end time is inserted. The Google template uses equal start/end instants to represent the start only; the page explicitly says the end time is unconfirmed. Calendar copies do not automatically receive changes. Text escaping and UTF-8 line folding prevent a title from injecting additional calendar properties. Displayed Eastern times use the named time zone and include EST or EDT instead of a hard-coded 8pm label. No external calendar or installed calendar app was opened or tested.

The existing manager/cron creation default separately guessed the UTC offset from the month. Its target-date calculation now uses America/New_York rules, preserving the existing Wednesday 8pm default and host window until 9pm. This is a correction to an existing default, not approval of a recurring schedule, an invitation or creation of any event. Host-configurable scheduling remains future work.

## Preservation and limits

The member-only join endpoint, identity checks, attendance transaction, provider URL validation, retirement on account change, and manager authorization are unchanged. Regression checks exercise them against fictional accounts and a disposable database. The public reader is not a substitute for database access repair or an explicit future event-publication contract. A stored live flag still requires an accountable host to keep it current; the page provides manual refresh, not an authoritative provider-health monitor.

The broader claim review still has work: roadmap LIVE/payment assertions, structure/privacy/hardware and venue statements, and the 92B fundraising promises remain outside this implementation. No funding flow, checkout, donation status, legal operator, venue or current event was verified or altered here. No secret was read, no credential changed, no new dependency installed and no charge made. The hosted recovery/privacy hold and physical-device acceptance remain open.

## Verification

The [verification receipt](live-schedule-verification.json) distinguishes the full compiled web build, scoped lint, route/helper checks using the actual SDK and synthetic PostgreSQL transport, and browser journeys with a locally intercepted meeting. The earlier failing cross-realm test comparison is retained and reconciled; serialized payload equality is tested without weakening expected field values. The revised build is bound to canonical source bytes. It does not establish hosted PostgREST behavior, real provider login, actual attendance, an iOS/Android build or headset acceptance.

## Primary implementation references

- [Supabase: zero-or-one-row results](https://supabase.com/docs/reference/javascript/using-modifiers-maybesingle) and [abort signals](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal): error and cancellation behavior was checked against current documentation and the installed 2.99.3 SDK.
- [iCalendar RFC 5545](https://www.rfc-editor.org/rfc/rfc5545): event identity, UTC timestamps, escaped text and folded content lines. The output intentionally carries no recurrence or unverified duration.
- [Supabase changelog](https://supabase.com/changelog): the index was retrieved on November 8. Flutter/CLI changes do not require changes to this local JavaScript reader. The [announced HTTP cipher change](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) is a separate future-device compatibility consideration; no actual device or hosted TLS acceptance was performed.
