# Salon journeys and the first fellowship pilot

Source review: 8 November 2026. This is a local product clarification within the existing project, not a new architecture, public release, meeting announcement or migration. Existing records and membership/payment handlers are preserved.

## One invitation, distinct programs

SoE's recurring promise is people returning to a shared reading and a real conversation. The code contains more than one program behind the word “salon.” They should not be silently merged or given the same duration, admission or identity rules.

| Entry | What the current source implements | Place in the proposed first release |
| --- | --- | --- |
| `/salons/pilot` | A public, server-rendered four-week plan and host guide. Readings are the Good Samaritan (Luke 10:25–37), Philemon, the reviewed Jowett Apology selection, then a return/reflection session. It explicitly has no confirmed host or dates. | The concrete first-cycle invitation. It is a plan, not a booking or an automatic Circle creation flow. |
| `/circles?format=online` | Filtered Circle discovery, using the existing Circle account/access contracts. Circles support agreed editions and readings; the twelve-week starter path is an option. | Find a real online group after the hosted safety gate. Choosing a topic or reading does not establish a group’s theology, membership or availability. |
| `/circles/path` | A twelve-week reading sequence with sources and host guidance. | A distinct optional curriculum. It does not turn the four-week pilot into a twelve-week commitment. |
| `/book-salons` | The older single-book listing/creation interface over `book_cohorts`; creator membership now has the separately verified transaction contract. | Preserve it and describe its destination links clearly. Its list/join error handling and account lifecycle still need separate acceptance. AI participation is optional and must be confirmed. |
| `/book-salons/[cohortId]` | The server classifies the stored cohort. Circle rows redirect to `/circles/[id]`; an ordinary book cohort uses the existing `LegacySalon`. Failed classification reports unavailable. | Keep the existing identity distinction and deep links. Do not interpret a UUID or shared table as proof that all programs have the same access contract. |
| `/salon` | A different seven-week guide program using `salons`, `salon_members` and `salon_sessions`. The existing proxy protects the document; without a session-presence hint it returns to `/`. Verified API identity is a separate concern. | Retain the program, label it clearly, and link to the separate first-cycle plan. A signed-out reader coming from book salons now gets an explicit sign-in return path. |
| `/salons` | The locally held physical-space/city proposal pages. | Explain the future gathering vision without venue, intake or fundraising availability claims. |
| `/live` | Recorded meeting times and the existing authenticated meeting handoff. No recurring date is inferred from an empty schedule. | A real meeting needs a host, time and authorized room. Listing code is not proof of a scheduled pilot. |
| `/council`, thinker links and older Temple routes | AI conversation and earlier spatial concepts. Some older `?thinker=…` links still target `/salon`, whose current page does not select a thinker. | Preserve and review these separately. A link to an AI persona is not a human gathering. Correct destination/consent choices before promoting these paths as a complete experience. |

The first four-week plan uses readings already available in the reviewed library. Psalm 22, Isaiah 53 and Josephus remain prominent Fellowship research topics, with their existing source-context paths into Circle discovery and discussion. A host can propose a later focused cycle, but an unregistered source link must not be converted into an invented assignable book or edition. Root Kernel’s distinct perspective and correction method remain intact.

## The end-to-end experience to validate

1. A person encounters a reviewed Reel, reading or Fellowship question, with source and date visible. A Reel remains a draft until editorial/reuse review.
2. They read enough context to understand the question and the community’s Christian invitation. Prayer and reading aloud are optional; respectful disagreement is welcome.
3. They can inspect the four-week plan without an account. A real group is chosen by its host, purpose, dates and access terms; selecting a topic is not a reservation.
4. Sign-in and membership use the existing verified account and Circle controls. No new legal membership, corporate vote, token entitlement or donation status follows from joining.
5. The same reading and question accompany the member into discussion and the host’s meeting. The native Fellowship and Quest browser work already preserves public question context without automatically posting it.
6. A member returns to the next recorded meeting. Host preparation, actual attendance, week-two return, reasons for leaving and a real second-cycle offer provide the evidence to improve the product.

The September “Explore, Gather, Build” exhibition can inform those journeys: discover context, meet people, and pursue voluntary projects. Its actual source is still inaccessible in this review. That historical plan does not authorize replacing this codebase, erasing history, creating a database or moving a domain. Present the actual alternatives before a major redesign.

## This bounded local change

- The older seven-week page identifies its program and provides explicit links to the four-week fellowship plan and online reading Circles, including for members already in a guide-program group.
- It removes the unsupported claim that a first salon automatically launches at eight members, the fixed seven-seat promise and automatic guide graduation after seven weeks. Actual capacity and progress records remain separate.
- Program lookup failures, malformed replies, loading and confirmed empty replies are distinct. A lookup times out after ten seconds, can be retried, and cannot replace a newer view with an expired reply. The explanation and links remain readable during loading and without JavaScript after the unchanged document gate is passed.
- Book salons name the separate guide program, route signed-out readers through `/login?next=%2Fsalon`, link to the four-week plan, and stop promising a weekly AI guide as an unconditional benefit. The introductory steps fit a narrow phone screen and describe an agreed schedule/capacity rather than fixed universal group limits.
- The membership and join handlers, private-detail fetches, existing checkout-return notice, database schema, records, proxy and permissions are unchanged. The existing source smoke assertion is updated for the added cancellation signal; behavioral browser checks cover the changed states.

## Remaining boundaries

This is not a security acceptance of the older guide program. A subsequent [read-access correction](guide-program-read-access.md) adds current-member/assigned-guide checks to detail/session reads, makes failed counts/statistics unavailable, and fixes active-program filtering. Its personal-detail page effect still depends on a bearer token, so the wallet-only path and account retirement require dedicated review. Creation, attendance and graduation still use separate writes. The guide permission projection also needs reconciliation before its writers can be accepted. These are source findings, not live exploit, data-access or actual group observations; no hosted request was made to reproduce them.

The broader Circle flow has separate local evidence, but the hosted schema, recovery, direct data access and real provider acceptance remain open. Supabase’s official [Data API guidance](https://supabase.com/docs/guides/api/securing-your-api) distinguishes object grants from row policies; a screen or document gate cannot establish those controls. The current changelog was checked; no SDK/CLI/database upgrade or schema feature is part of this change.

The native Fellowship APK and Quest browser receipts remain dated evidence for their own builds. This web change is not a fresh Android build, iOS acceptance or physical-headset/voice test. No invitations, deployment, publication, provider call, credential change or purchase occurs in this work.

## Verification and rollback

See `salon-journey-verification.json` for exact source/build evidence and retained failures. The browser uses a clearly nonissued loopback cookie only to pass the existing document-presence gate; API identity stays synthetically signed out. Its fixture groups are not members or meetings. The original no-cookie redirect is checked separately. The existing checkout-return view event is intercepted with an exact payload match and never forwarded to the server; no payment or analytics write is performed. These checks do not authenticate a real user or certify the older private detail/join lifecycle.

This source-only change needs no database migration. A reviewed local revert can restore the two previous page sources and their static assertion; it would restore the ambiguous labels and lookup-failure behavior. Preserve the broader Circle and guide-program records. Any later consolidation requires an explicit identity/URL map, membership/privacy contract, tested recovery and data-compatible rollback or forward fix. A code revert cannot reverse a sent invitation, published private content or a payment.

The subsequent [program browser lifecycle correction](guide-program-browser-lifecycle.md) clears private views on account/background changes, checks cookie-only wallet or Supabase identity, and bounds reads and joins. The seven-week program still has distinct writer and facilitator-authority gaps; these browser changes do not certify it as a first pilot.
