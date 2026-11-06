# Legacy Twiddle access review

The November 6 hosted catalog showed effective read and write grants for both browser roles on the three Twiddle tables. Each table had row-level security enabled. Permissive policies allowed anonymous reads and broad writes. The three links from authored posts, collaborators and reactions to `auth.users` use the default `NO ACTION` behavior and can block a provider deletion. The catalog review queried permissions and definitions only.

The [owner review draft](../sql/legacy-twiddle-data-containment-apply.sql) revokes raw table and column access from the two browser roles and PUBLIC. It checks service access before commit and leaves rows, policies and other explicit grants in place. Unexpected role inheritance, dependent views, browser-callable privileged routines identified by catalog dependencies or source text, and replication publication membership require review. The transaction uses a bounded exclusive lock.

The isolated PostgreSQL 17 fixture reproduced reads and writes for both browser roles. All 24 attempted browser operations were refused after containment and again after a logical restore. The owner verified preserved rows, policies, constraints and trigger definitions. The service role could still read, create, update and delete test records. [Verification](legacy-twiddle-containment-verification.json)

## Application route closure

The previous list, detail and reaction read routes used a privileged server client. The response and cron routes could pass Twiddle text to an AI provider. The release now refuses all eight methods at the start of the handlers with private, non-cacheable responses. This uses a release policy in the source, so reopening requires code review of audience, posting and provider consent. The prototype code remains in the repository.

The feed, thread and Constellation pages show the same pause notice and link to the Circles directory with Online selected. The public experience page identifies the feature as a concept. Chromium exercised all three notices at 320px, followed the link with the keyboard and ran 20 requests as a guest and with synthetic stale credentials. The guarded comparison used eight requests per compiled build. The previous build attempted three outbound requests, which the guard blocked. The new build attempted none with the same synthetic configuration. [Application verification](legacy-twiddle-release-verification.json)

Before an approved cutover, verify the hosted backup and protect or retire the older reachable builds. Apply the raw database containment during the same reviewed rollout and confirm the website and the Data API separately. The next account-deletion step needs a reviewed disposition for authored posts, collaborator and reaction links, associated media, minted posts and known copies. Keep provider identity preparation gated on those references.
