# Account deletion

Web account settings and the connected phone account screens lead to `/account/delete`. The page works in a browser without the installed app. The website verifies the selected email, Google or wallet sign-in. The deletion sign-in path bypasses member provisioning so a verified provider account can request deletion before creating a member record.

The person checks the account, saves a private status code and types `DELETE`. Submission uses the reviewed account and one code. An exact retry returns the original receipt. Linked wallet and provider sign-ins see the same pending request. The code works without a sign-in and reveals only the request reference and dates. The private queue stores the code's digest. Website service routines can read receipts and accept requests. Direct table access is restricted to its owner.

The current receipt confirms that the request was received and that deletion is pending. It shows the review date. The owner must choose a review deadline from 1 to 30 days. The erasure and completion procedures remain pending.

## Start processing a reviewed request

The database owner can start an exact request with the reviewed member ID and provider subject. The owner must review the current IDs again if a profile or link changed after submission. An exact retry returns the original start time. Starting a request stores private processing state and leaves existing Auth, profile and contribution rows in place.

When the coordinated server setting is active, the browser, phone and Quest app requests that use canonical member authentication refuse the reviewed account. Password and Google selection, wallet session issuance and member setup also check processing state. The database prevents a held identity write from recreating that profile. A private digest of the reviewed wallet address continues to block reuse after removal of the member record. The status code still opens the request receipt.

Apply the queue draft before the access draft on an isolated restore. Before an approved hosted rollout, finish the database privacy repair, retire older reachable builds, verify the new server against the restored schema and enable `SOE_ACCOUNT_ERASURE_ACCESS_ENABLED=true` for every active app revision. An unavailable guard denies new authenticated app requests when this setting is active. Keep the setting active while any processing record exists.

Drain operations that already passed authentication before clearing account data. Verify provider session removal separately. Existing provider tokens can remain valid until expiry, and direct database access depends on its own permissions. [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users)

## Remove reading, Thinker and Practice records

The owner-only private data draft follows the queue and access drafts. For a request already in processing, the owner calls `preview_private_data` with its reviewed request, member and provider IDs. The returned counts cover saved reading and its older records, highlights and book reflections, the Thinker memory table, Practice answers and their reflections.

The owner passes those same IDs and the reviewed counts to `erase_private_data`. A changed count, a cross-member Practice reflection, an unexpected dependency or an inactive write guard stops the phase. The transaction clears the matched records and recalculates the affected Practice totals. An exact retry checks the cleared scope and returns the original internal receipt. The member’s status code continues to show that deletion is pending.

New writes to those eight tables check the processing state. The owner start waits for earlier transactions touching them, then the write guards refuse new or held writes for the reviewed account. Practice reflections also check the source answer when the stored reflection has no member ID.

The restored release proof covers legacy rows, removed reading locations, derived Practice reflections without a recorded member ID and an account that never created a member. It also verifies that a late error rolls back the entire phase. Shared posts, direct messages, the member profile, provider accounts, other storage and full completion have separate steps. [Verification](account-erasure-private-data-verification.json)

## Remove authored Circle posts

The owner reviews the posts and their linked moderation records using `preview_circle_posts`. The erasure call requires the same request and account IDs, the exact reviewed snapshot, and explicit approval to remove linked evidence when present. A changed snapshot or unexpected dependency stops the operation.

The transaction removes the post body, author details and passage reference. It leaves a withdrawn thread anchor under the name Former member so existing replies keep their place. It clears linked report notes, decision summaries and excerpts, and the copied material in moderation receipts. Open reports on those posts close because the posts have been removed. The procedure clears author consent and retires stale review access. Structured safety records, text-free post receipts and spent AI attempts remain for a separate retention review.

An exact retry verifies the same redaction and returns the original internal receipt. Other members’ replies, ordinary book salon posts and the member’s pending deletion status stay available. The owner must still review other copies, older salon content, Circle hosting data and retention exceptions before completing an account deletion. [Verification](account-erasure-circle-posts-verification.json)

## Remove profile fields, direct messages and older salon posts

For an exact request already in processing, the owner calls `preview_contact_data` to review the counts and digest. The owner passes those same request and account IDs and the reviewed snapshot to `erase_contact_data`. Incoming messages with another recorded author require explicit approval to retain the sender copy while clearing the departing recipient. A changed snapshot, inactive guard or unexpected reference blocks the operation.

The transaction makes the known profile fields private and clears their personal text, removes messages written by the departing account, and deletes incoming legacy rows without a recorded author. It detaches the departing recipient from other authors’ rows. The current conversation view requires both accounts, so those retained rows are outside normal conversation history. The owner still needs to determine the retention and retrieval policy for those copies.

This phase removes authored posts from ordinary book salons and from rows without a cohort. The earlier Circle phase handles the shared Circle threads. Provider identities, memberships, billing records and any additional copies have their own review. The restored release rehearsal checked older rows, an in-flight message, a forced rollback and an exact retry after a second restore. [Verification](account-erasure-contact-verification.json)

## Close hosted Circles and remove participation

The owner calls `preview_circle_departure` for the same processing request. It lists affected and hosted group IDs, counts and a digest. Review the retained group details and disposition of each hosted salon. The removal requires the exact snapshot and explicit approval for the hosted list. Resolve any live handover in a separate reviewed process before starting erasure.

The transaction removes the departing account’s memberships, RSVPs, Quest seats, reviewer grants and participation receipts. For the listed hosted groups, it detaches the creator and removes private meeting URLs. Circles use their existing completed state. Members with current access can still open the discussion and see the shared reading plan. Older book salons keep their shared group details. Other members keep their memberships and attendance records, and other hosts keep their meeting links.

The same test account went through the preceding erasure steps and this one on a restored release. The rehearsal checked stale writes, a changed snapshot, a forced rollback, the actual Circle detail route and retry after a second restore. Provider identities, separate safety history and retention still require review. [Verification](account-erasure-circle-departure-verification.json)

## Clear archived Twiddle records

Before using the [Twiddle erasure draft](../sql/account-erasure-twiddle-apply.sql), stage the earlier identity functions and the raw database containment on an isolated restore. Protect or retire old hosted routes during the reviewed rollout. The erasure draft closes the server role’s remaining access to the three archived tables, leaving the records and policies in place until the owner reviews a specific request. [Legacy access review](legacy-twiddle-containment.md)

For the exact processing request, the owner calls `preview_twiddle_erasure` with the request, member and provider IDs. It returns counts, IDs that need separate review, and a digest. Resolve linked media through its owner and provider. Review minted records and any identified woven or AI-generated copies separately, including copies outside the app. Request a fresh preview after any disposition.

The owner passes the exact review and explicit approval to `erase_twiddle_data`. It removes the author, text and attached fields from the departing account’s posts, leaves the thread anchors, and removes the account’s collaboration and reaction links. It preserves the other authors’ records and entries without a recorded owner. The owner-only receipt verifies the withdrawn anchors and detects a new linked record or known copy. The private status code continues to show that deletion is pending. [Verification](account-erasure-twiddle-verification.json)

## Remove sign-in identities

The owner calls `preview_identity_removal` with the exact processing request, member ID and Supabase subject. Use a null member ID for a provider-only account or a null provider subject for a wallet-only member. The preview rechecks the earlier erasure phases, including archived Twiddle, and shows linked Auth records, storage ownership and other database references. The owner resolves applicable storage through the provider’s Storage tools and reviews other app records before proceeding. [Supabase Storage ownership](https://supabase.com/docs/guides/storage/security/ownership)

The owner passes the exact reviewed snapshot and explicit approval to `prepare_identity_removal`. It clears the Supabase link and wallet address together and records the preparation. The hosted Supabase link cascades from `auth.users` to `members`, so complete preparation before any provider deletion. The app access fence stays active for the original identities across all reachable builds.

After the separate provider authorization, recheck the prepared scope and use the supported Supabase hard-delete operation for the reviewed subject in the same project. A lost response can be followed by an exact lookup. The owner calls `verify_identity_removal` to check the actual provider user, sessions, linked identities, refresh tokens and other user-linked Auth rows. It records verification only when those records and the checked storage and app links are clear. A previously issued access token can remain valid until expiry. The app access fence and browser grant containment are prerequisites for hosted use. [Supabase Admin deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser) · [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users)

This phase keeps the private status code and the pending member receipt. It verifies SoE sign-in identity removal, including accounts that never created a member profile. Completion still needs the approved handling of other member data, retained records, backups and the completion notice. [Verification](account-erasure-identity-verification.json)

## Release steps

1. Review which records to erase and which records must be retained. Cover sign-in and wallet associations, private and published profiles, reading, Circle posts and moderation, direct messages, practice and council, uploads, notifications, billing and rewards, and data in backups and provider systems. Review shared content and define the handling for public blockchain records. Set the retention window for the minimal receipt.
2. Implement the erasure procedure with durable progress and safe retries. Verify account access revocation for password, Google and wallet, including replay from other devices. Test account-owned data removal, any approved exceptions and a completion notice on an isolated restore. Verify handling for someone who can no longer sign in, including how to prove account ownership.
3. Use the 63-table restore check after applying the approved queue and erasure drafts. It covers the queue, processing state, internal receipts and archived anchors. Add the eventual completion state to the backup check before enabling intake. [Post-erasure restore procedure](privacy-restore-check.md#verify-a-backup-after-the-account-erasure-drafts)
4. Keep intake disabled until the full process and recovery are verified. After approval, configure `SOE_ACCOUNT_DELETION_REQUESTS_ENABLED=true` and `SOE_ACCOUNT_DELETION_REVIEW_DAYS`, test the hosted public path, and verify signed iOS and Android builds and browser handoff on devices. Use the deployed page for store review. [Apple account deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion) · [Google Play account deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111)
