# Production route audit and cutover rehearsal

The member project has four current aliases and 40 READY deployment URLs. Anonymous HTTPS checks on November 5 reached the member homepage through `society-of-explorers.vercel.app`. The other three aliases and all 40 generated URLs redirected to Vercel sign-in. The public alias resolves to the October CLI upload `dpl_FqmzK79EiKmDcur1of6RFPpbUyFX`. Two protected aliases still point to the June CLI upload `dpl_8PSS1iRp7s7tvNx8mRnwQ38Lfv2d`. Use the current alias mappings when selecting the rollout target. Historical deployment records retain moved names. [Vercel deployment protection](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments)

The branded apex redirects to www, which serves the separate exhibition project. Login, Dashboard, Feed and Movement return a permanent redirect to its hold page. Circles, Library, Clips and Quest returned 404 in the signed-out checks. The uploaded exhibition configuration has 87 redirects and 66 rewrites, all with local destinations. Its uploaded homepage has no direct member-app or Supabase link in its HTML attributes. Opening member routes on the branded domain requires a separate routing decision. [Verification receipt](production-route-closure-2026-11-05-verification.json)

## Uploaded Practice and Feed behavior

The provider file index, function links, launcher file map, Next route manifest and chunk hashes bind the following handlers to the reachable member upload. The compiled routing configuration shows no middleware match for these three paths. The audit examined uploaded code statically. Live checks used anonymous HEAD on the homepage and exhibition paths.

| Handler | Behavior in the uploaded code |
| --- | --- |
| `GET /api/feed/pulse` | Reads the 20 latest answers through the service client, joins member display labels and saved reflections, and returns text and streak information without a member check. |
| `GET /api/practice/responses` | Reads answers, member identifiers and display labels by question or time window through the service client. It requires a question ID or days value. |
| `GET /api/practice/others` | Accepts a question ID and uses an optional member session to exclude the caller. The shared reader can return up to three other answers when the caller is signed out. |

The published Feed browser module calls the legacy pulse route and expects a response list and stats. It rejects the replacement’s prompt-only payload and shows its retry state. Include a full page reload in cutover acceptance for tabs left open on the older build. Review how deployment pinning routes stale clients before reopening public traffic. [Vercel deployment skew protection](https://vercel.com/docs/skew-protection)

The June upload’s file index links the older Practice and reward routes to its built functions. Its uploaded source also contains a service-backed response reader, an author-excluding reader, and the old reward writer. The June compiled handlers were outside the byte-level implementation trace. Keep the older builds behind Vercel sign-in during rollout. [Vercel file index](https://vercel.com/docs/rest-api/deployments/list-deployment-files) · [Vercel file contents](https://vercel.com/docs/rest-api/deployments/get-deployment-file-contents)

## Local cutover replay

The new regression applied the exact Core and Practice drafts to the same disposable database. Direct browser roles lost access to synthetic member billing fields, answers and reflections. The old Feed query shapes still returned both synthetic answers and reflections under the service role. The replacement handlers returned the public prompt, retired both legacy Practice readers and direct reading awards with private 410 responses, and returned the selected member’s bounded session. Two distinct synthetic accounts could read their own answers. One saved and reloaded an updated answer while the other’s record stayed intact. The three suites passed 28 checks. [Test and artifact receipt](production-route-closure-2026-11-05-verification.json)

Keep the public member alias under maintenance for the approved database and app cutover. The service-backed readers require the matching app replacement as part of that operation. Before opening traffic, check raw browser denial, the public prompt, the three retired routes, two distinct accounts, owner-only save and reload, and an older tab across reload. Retain the protected status of the earlier URLs and check the branded hold separately. If acceptance fails, retain the hold while verifying a privacy-safe replacement. The owner-approved isolated production restore and hosted checks remain open. [Production migration plan](production-migration-plan.md)
