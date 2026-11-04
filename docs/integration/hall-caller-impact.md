# Hall and artifact caller impact — local work in progress

Scope is exactly the public Hall reader and raw `public.artifacts` access. No production change is authorized. This inventory describes current canonical source, not every historical deployed client.

## Current source callers

| Caller | Authority and behavior | Expected containment impact |
| --- | --- | --- |
| `app/hall/page.tsx` before this milestone | Browser anon client selected complete `is_public=true` rows plus `members(display_name)`, newest48, with thinker filter before the limit. Discarded database errors and displayed an empty-gallery message; loaded arbitrary image URLs. | Raw reads will be denied. Replace with bounded same-origin public text DTO, explicit publication filter/whitelist, anonymous attribution, honest error/retry and no media requests. The replacement must preserve global thinker filtering before the bound. |
| `app/api/artifacts/generate/route.ts` | Verified actor; service-role INSERT. Independent flags require both explicit publish consent and `makePublic`, and both explicit storage consent and context-storage request. AI/image generation uses separately gated provider transports. The database default is not the route's consent decision. | Preserve service INSERT/SELECT and all columns/defaults. No provider call or content generation is needed to rehearse containment. Existing tests establish synthetic identity refusal; they do not prove provider readiness. |
| `app/api/artifacts/merch/route.ts` | Verified actor; explicit artifact ID/member/image projection; owner comparison; disabled-by-default ordering flag and provider configuration gate before an external order. | Preserve service SELECT. Do not enable ordering or contact a provider as part of access repair. Child `artifact_merch` schema/grants are outside this candidate. |
| `app/api/artifacts/mint/route.ts` | Verified actor and explicit artifact projection/owner checks; mint-recording flag/configuration gate; separate child records and metadata. | Preserve service SELECT. Do not enable recording, prepare/submit a transaction or mutate mint rows. Child `nft_mints` scope is separate. |
| `app/api/safe/route.ts` | Verified actor; service-role count filtered to that actor's artifact member ID. | Preserve service SELECT/count. This endpoint's broader existing zero-on-query-error behavior is outside the public Hall reader change. |
| `components/ArtifactGenerator.tsx` and navigation | Calls the same-origin generation endpoint and links to Hall; no additional direct artifact table client found in active app/components/lib/platform source searches. | The Hall link continues to the reviewed public reader. Generation remains a provider-gated feature; no claim that existing published artifacts have media usage receipts. |

## Read-only catalog evidence

`verification/web/evidence/hall-catalog-2026-11-04.json` records thirteen columns, RLS enabled, the public SELECT predicate `is_public=true`, a public INSERT policy with `WITH CHECK(true)`, all eight table privileges for each browser/service role, no column ACLs, a UUID primary key and nullable member reference with ON DELETE CASCADE. A public row policy permits access to every selected column under the table-wide SELECT grant, including prompt/context/media fields. It does not demonstrate a privacy-preserving public projection.

The separate bounded supplement records the primary-key index, no inheritance/partitioning, browser/service role flags and no memberships, schema authority and grantors. Safe default expressions are `gen_random_uuid()`, `true` and `now()`; the theme JSON literal remains redacted with its MD5. Six internal trigger semantics include incoming NFT cascade-delete and merchandise NO ACTION references, plus the outgoing member checks. Unknown external child schemas are explicit fixture stubs, never a complete clone. No user rows, issued keys, function bodies or live artifact API calls were read.

All eight privileges include TRUNCATE and MAINTAIN. RLS does not govern TRUNCATE, but the presence of a grant is not a claim that an HTTP truncate endpoint exists or that a truncate would succeed independently of incoming foreign keys. No exploitation or row mutation was attempted.

## Candidate boundary and approval prerequisites

The separate artifact containment draft must remove browser/PUBLIC table and column authority, retain effective service CRUD and all existing rows/policies/defaults/FKs, and save an owner-only catalog receipt. It must not change global defaults, child tables, media storage objects, functions or generation/publication flags. The existing seven-table containment is not silently expanded.

Reversal restores only prior ACL/RLS metadata and preserves every current artifact. It can re-expose newly added public rows and their private context under the old raw grants. It therefore requires a separate, explicit owner decision; prefer a forward fix. Catalog-only receipts cannot establish whether an installation was unused. Relation locks do not coordinate cluster-wide role changes or arbitrary trusted-owner DDL.

Before any production approval: finish and independently review exact files/hashes; exercise service/public/private/browser-negative behavior on the sanitized fixture; inventory deployed/legacy callers and storage access; establish actual backup/restore and coordinated maintenance evidence; resolve or separately scope privileged legacy RPC review. Local DTOs and local SQL tests do not change the live Data API boundary, establish media rights or constitute a full restore/rollout acceptance.
