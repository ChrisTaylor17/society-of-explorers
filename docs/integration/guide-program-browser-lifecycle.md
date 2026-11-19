# Guide-program browser lifecycle

8 November 2026. Local correction based on `5b1f669b075a2da76c52b43f3ff3b0374753ec3c`. This preserves the older seven-week guide program, distinct from the first four-week fellowship Circle. It is not a hosted release or an approved guide-role design.

## Problem and behavior

`/salon` previously loaded the member and bearer once, skipped wallet-only private reads, retained private program state after an account change, and accepted late replies without checking the account. A join then loaded a different detail projection which did not contain the personal membership progress that the page expected.

The page now uses a scoped controller and the existing browser-access adapter. It reads `/api/auth/member` through current cookies without provisioning an account or retaining bearer credentials. It checks the selected member, provider and subject before a program read and again before displaying its result. Every request carries the current browser sign-in intent; program reads and explicit joins also carry the expected member. Both headers matter: the existing server only applies its expected-member check when the intent header is supplied. No server auth helper, profile projection, endpoint handler or database permission was broadened.

Same-tab and cross-tab account notifications, SDK identity events, background/blur/pagehide and offline signals synchronously retire the operation and clear private data. Returning to the page offers **Check current access**. It does not automatically restore private content. Unmount disposes subscriptions and operations. Each operation has a ten-second deadline; generation and intent checks reject late completions even when transport ignores abort.

The page distinguishes signed out, unavailable, genuine empty membership and a verified program. Only a fresh empty membership enables joining. One explicit join sends at most one request during its operation, then reads the personal-program endpoint and rechecks identity. It does not treat a failed response, a different account, a mismatched program or absent readback as success. An uncertain join remains locked against another write in that page lifetime, including after an empty refresh. Its message explains that the first request may still complete. A later verified membership can resolve that state.

Only the fields needed for display enter React state. Malformed or overlarge program replies are unavailable, and backend exception text is not shown. The public listing and links to the four-week plan and online Circles remain available separately.

## Verification and boundaries

See [the final local verification](guide-program-browser-verification.json). Tests cover cookie-only wallet and Supabase selection, both account headers, empty membership, one explicit join and personal-progress readback, retirement, account/provider/intent changes, delayed requests before and after transmission, failures, unknown outcomes, timeout, inactivity, unmount, bounded presentation and compatibility with the actual personal-program handler over disposable SQL. Compiled browser scenarios exercise the actual page and lifecycle code with explicitly fictional API responses. They do not establish real authentication or hosted access.

The earlier server-read and current account-selection controls remain separate prerequisites. Production still requires coherent backup/restore, reviewed access repair and real independent-session acceptance. No hosted call, deployment, key, credential or billing change was needed for this work.

## Remaining decisions and rollback

The older program's creation, concurrent capacity, attendance and graduation writes are still separate, non-transactional operations. This controller cannot cancel a write already accepted by the server. Its uncertain-request record is in memory only: reloading, navigating away or using another tab is not an idempotency contract. Durable, transactional participation and guide-role permission checks must be reviewed together before offering this program. Multiple active memberships still lack an explicit selection preference. The original 35-weekday-session workload is not the four-meeting pilot.

Rollback is local: restore the earlier page and remove these two new client modules. No schema or hosted data migration exists in this change. Reverting restores the previously identified stale-view and wallet-entry defects; it is not a recommended release fallback. Existing API writers, identity helpers and Circle/Root Kernel data are preserved.
