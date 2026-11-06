# Account deletion

Web account settings and the connected phone account screens lead to `/account/delete`. The page works in a browser without the installed app. The website verifies the selected email, Google or wallet sign-in. The deletion sign-in path bypasses member provisioning so a verified provider account can request deletion before creating a member record.

The person checks the account, saves a private status code and types `DELETE`. Submission uses the reviewed account and one code. An exact retry returns the original receipt. Linked wallet and provider sign-ins see the same pending request. The code works without a sign-in and reveals only the request reference and dates. The private queue stores the code's digest. Website service routines can read receipts and accept requests. Direct table access is restricted to its owner.

The current receipt confirms that the request was received and that deletion is pending. It shows the review date. The owner must choose a review deadline from 1 to 30 days. An operator procedure for erasure and completion is still pending.

## Release steps

1. Review which records to erase and which records must be retained. Cover sign-in and wallet associations, private and published profiles, reading, Circle posts and moderation, direct messages, practice and council, uploads, notifications, billing and rewards, and data in backups and provider systems. Review shared content and define the handling for public blockchain records. Set the retention window for the minimal receipt.
2. Implement the erasure procedure with durable progress and safe retries. Verify account access revocation for password, Google and wallet, including replay from other devices. Test account-owned data removal, any approved exceptions and a completion notice on an isolated restore. Verify handling for someone who can no longer sign in, including how to prove account ownership.
3. Add the queue and any completion state to the backup and restore check. Apply the queue draft and the approved erasure changes on an isolated restore before considering the hosted rollout. The current first-release migration list and 42-table receipt predate this queue.
4. Keep intake disabled until the full process and recovery are verified. After approval, configure `SOE_ACCOUNT_DELETION_REQUESTS_ENABLED=true` and `SOE_ACCOUNT_DELETION_REVIEW_DAYS`, test the hosted public path, and verify signed iOS and Android builds and browser handoff on devices. Use the deployed page for store review. [Apple account deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion) · [Google Play account deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111)
