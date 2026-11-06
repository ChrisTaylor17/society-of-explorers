# Blocking a Circle author

Open the current actions on another member’s post, review the scope, then choose **Block author**. The server checks the current account, Circle membership, selected post, and the reviewed revisions. It takes the author from that post. Members can manage the block under **Members → Chat → Blocked members** on the web, **Blocked members** in the phone member menu, or the **Blocked members** section in regular Quest Browser.

The same private block applies across current Circles and direct messages. It hides each member’s posts from the other in both discussion views and refuses direct replies in either direction. A thread keeps an unavailable placeholder so other members’ replies retain their context. The block leaves Circle membership and assigned human review evidence intact.

The browser clears the discussion and draft after confirmation or an uncertain reply. The browser asks the member to check the private block list after an uncertain result. The shared phone and Quest Browser controller can retry the same request explicitly and accepts only its matching receipt. Reloading the discussion checks current access again. This draft covers Circles on the Society of Explorers reading path. Independent book salons and external meeting providers are outside this scope.

## Rollout and restore

Stage [the Circle draft](../sql/circle-member-blocks-apply.sql) after the public-profile wrappers and [direct-message blocks](../sql/direct-message-blocks-apply.sql). Check the prior functions and grants, then coordinate the database and app rollout. Verify the hosted schema cache and ordinary account flows before opening the pilot. The private block table remains available only through the reviewed routines. Include block records in the account deletion and retention review.

The local PostgreSQL rehearsal observed a reply in a second Circle waiting on the same pair lock. It refused the reply after the block committed and preserved the independent thread replies. The [66-table restore](privacy-restore-check.md) includes the new routines and rejects a restored database missing the private block revision check.

[Verification receipt](circle-member-blocking-verification.json)

## Managing blocks on phone and Quest

The member must check their current account and deliberately load the list. The phone bridge enables its dedicated transport when the installed module advertises the owner-blocks policy. Older bridges keep their existing member controls. The transport sends only the owner's block page and the reviewed unblock request to the approved app origin. The server uses the same block record and revision as the web.

An unblock review binds the current member, the selected block and its revision. If the response is lost, retrying the exact request recovers its receipt when the revision is still current. The member can clear the review at any time. Moving the app to the background, changing accounts or entering immersive mode clears the private list and any held review. The regular Quest Browser list needs a new manual load after returning from VR.

The compiled Quest page and both phone screen simulations reached the owner endpoint. The Swift request policy was compiled and exercised on Mac. Installed builds, actual device lifecycle and hosted verification are separate release gates. [Block management verification](member-block-management-verification.json)
