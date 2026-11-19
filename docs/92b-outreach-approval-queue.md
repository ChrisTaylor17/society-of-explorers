# 92B Outreach Approval Queue

Status: local draft queue. Do not send, schedule, import, DM, email, text, call, post, or automate any outreach without explicit approval of the recipient, channel, and final copy.

## Operating Rule

Every outreach item moves through this sequence:

1. `candidate`: possible person or group, no action approved.
2. `drafted`: message exists locally.
3. `approved`: Chris has approved recipient, channel, and final copy.
4. `sent`: message was sent after approval.
5. `responded`: reply received.
6. `call`: call or meeting requested.
7. `pledged`: pledge received or committed.
8. `closed`: no action, not aligned, or deferred.

## Segment Priorities

| Rank | Segment | Why It Matters | Best Ask | Draft |
| --- | --- | --- | --- | --- |
| 1 | One warm Supporter | Fastest measured first paid signal | One $25 Supporter pledge after production promotion and verification | First Supporter Pledge |
| 2 | Warm believers | Highest trust and fastest signal | Read, pledge, or introduce one aligned person | Architect Patron |
| 3 | Boston locals | Can validate the physical-node story | Read and react to the conditional storefront plan | Boston / Local Angle |
| 4 | Operators/builders | Can improve credibility before broader launch | Give blunt page and funnel feedback | Builder / Operator Friend |
| 5 | Creators/philosophers | Can amplify the mission authentically | Share the story or refer one patron | Creator / Philosopher |
| 6 | Past leads | Already expressed some founding interest | Re-engage around the $120k push | Follow-Up |

## Approval Queue

Use this table before any outreach. Keep it local until a specific batch is approved.

| Priority | Recipient / Group | Relationship Context | Segment | Channel | Draft | Status | Approved By | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | TBD | Warm relationship, trusted enough for the smallest tracked pledge ask | One warm Supporter | Email or text | First Supporter Pledge | candidate | - | Use only after production promotion and post-promotion verification. |
| 2 | TBD | Warm relationship, likely to understand the mission | Warm believers | Email or text | Architect Patron | candidate | - | Add only after Chris names the person or approves importing from a connected tool. |
| 3 | TBD | Boston-aware, can judge the physical-node story | Boston locals | Email | Boston / Local Angle | candidate | - | Do not imply the location is secured. |
| 4 | TBD | Product/business operator who can critique funnel clarity | Operators/builders | Email | Builder / Operator Friend | candidate | - | Ask for feedback before money unless very aligned. |
| 5 | TBD | Creator, writer, philosopher, or community host | Creators/philosophers | Email or DM | Creator / Philosopher | candidate | - | Ask for one aligned introduction. |
| 6 | TBD | Existing founding-interest lead | Past leads | Email | Follow-Up | candidate | - | Use connected tools read-only to prepare context only after approval. |

## Tracking Fields

- `first_touch_at`
- `last_touch_at`
- `next_action_at`
- `pledge_amount`
- `pledge_status`: none, interested, committed, paid
- `objection`: unclear offer, money timing, space uncertainty, privacy concern, wants call, other
- `source_utm`
- `intro_requested`
- `intro_made`
- `notes_redacted_for_ai`

## UTM Links

Warm direct:

```text
https://www.societyofexplorers.com/92b/fund?utm_source=warm_outreach&utm_medium=direct&utm_campaign=92b_founding_node
```

Boston local:

```text
https://www.societyofexplorers.com/92b/fund?utm_source=boston_warm&utm_medium=direct&utm_campaign=92b_founding_node
```

Creator/referral:

```text
https://www.societyofexplorers.com/92b/fund?utm_source=creator_referral&utm_medium=direct&utm_campaign=92b_founding_node
```

Window QR:

```text
https://www.societyofexplorers.com/92b/fund?utm_source=92b_window&utm_medium=qr&utm_campaign=92b_founding_node
```

## Daily Review

- How many people were approved for outreach?
- How many messages were actually sent after approval?
- Which story caused the strongest reply?
- Which objection appeared most often?
- Did anyone ask for a call, intro, or higher-tier pledge?
- Does the page need a clearer explanation before the next batch?

## Privacy Notes

- Keep sensitive relationship details out of broad admin views.
- Do not copy private emails or messages into this document unless Chris approves.
- Use summaries such as "Boston local, knows the space" instead of unnecessary personal data.
- If connected tools are used later, read context for preparation only until a send action is explicitly approved.
