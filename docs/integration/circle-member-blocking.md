# Blocking a Circle author

Open the current actions on another member’s post, review the scope, then choose **Block author**. The server checks the current account, Circle membership, selected post, and the reviewed revisions. It takes the author from that post. The member can manage the block on the web under **Members → Chat → Blocked members**.

The same private block applies across current Circles and direct messages. It hides each member’s posts from the other in both discussion views and refuses direct replies in either direction. A thread keeps an unavailable placeholder so other members’ replies retain their context. The block leaves Circle membership and assigned human review evidence intact.

The browser clears the discussion and draft after confirmation or an uncertain reply. The browser asks the member to check the private block list after an uncertain result. The shared phone and Quest Browser controller can retry the same request explicitly and accepts only its matching receipt. Reloading the discussion checks current access again. This draft covers Circles on the Society of Explorers reading path. Independent book salons and external meeting providers are outside this scope.

## Rollout and restore

Stage [the Circle draft](../sql/circle-member-blocks-apply.sql) after the public-profile wrappers and [direct-message blocks](../sql/direct-message-blocks-apply.sql). Check the prior functions and grants, then coordinate the database and app rollout. Verify the hosted schema cache and ordinary account flows before opening the pilot. The private block table remains available only through the reviewed routines. Include block records in the account deletion and retention review.

The local PostgreSQL rehearsal observed a reply in a second Circle waiting on the same pair lock. It refused the reply after the block committed and preserved the independent thread replies. The [66-table restore](privacy-restore-check.md) includes the new routines and rejects a restored database missing the private block revision check.

[Verification receipt](circle-member-blocking-verification.json)
