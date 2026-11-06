# Direct-message blocking

Members open a conversation from Members, then choose **Block member** and confirm the exact person. The block closes direct-message reads, sends and read acknowledgements in both directions. It also removes that conversation from unread counts. The message history stays stored. The other participant sees an unavailable conversation.

The person who set the block can remove it from that conversation or from **Chat → Blocked members**. The list uses a private block reference and a current published name when available. A profile that becomes private is shown as Explorer with the time of the block. If both members set a block, direct messaging resumes after both remove their own blocks.

A reviewed change binds the signed-in member, the selected reference and its current revision. A duplicate current request returns the same receipt. An older request cannot reverse a newer choice. The web chat clears the view during a change and checks fresh access before showing history again. Account changes retire the private conversation and any held response.

## Release and recovery

Stage [the database draft](../sql/direct-message-blocks-apply.sql) on the approved restore after direct-message containment. It moves the existing read, send and acknowledgement operations into service-only routines and revokes raw service access to the table. The two write directions and both block directions share one database lock for the pair. An operation that waited behind a committed block evaluates the new state before writing.

Deploy the matching `/api/message` routes with the database change and verify the hosted schema cache and app account paths. Protect legacy app revisions as part of the cutover. Keep optional email notifications off until their sender and recipient can be checked against a stored message and current block state. Include private block records in the account-deletion retention review.

Once the draft is installed, use the 66-table member-safety scope and check that the isolated restore preserves the private block, previously stored messages and the service-only routines. The rehearsal detected a backup with omitted block rows that passed the preceding reference. [Restore procedure](privacy-restore-check.md) · [Verification](direct-message-blocking-verification.json)

Circle-wide behavior, installed phone controls, Quest controls and third-party meeting interactions are separate release work.
