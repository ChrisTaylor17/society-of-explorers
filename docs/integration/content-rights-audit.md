# Content and clip rights audit

Reviewed 2026-11-04 against the canonical release worktree. This is a scoped exposure audit and source proposal, not worldwide legal clearance. No third-party audio/video was downloaded, streamed, played, embedded or published. Only official public catalog/policy pages were read for the proposals.

## Current implementation and exposure

[Local integrity evidence](../../verification/web/evidence/content-rights-inventory.json) freshly verifies eight retained original archives, eight complete readers, 312 assets and 10,198 indexed blocks against their manifests. Every reader retains its full Gutenberg license footer. Rights metadata is explicitly United States/public domain according to Project Gutenberg, with other territories not assessed. Source/translator/illustrator distinctions remain in [the existing edition review](../books/RIGHTS_AND_IMPORT.md).

Text excerpts already use edition/block coordinates, a 600-UTF-16-unit limit, source credits and canonical server reconstruction. Equations, images and tables use source links instead of text-only excerpts. Free reading is separate from membership/optional services.

At the initial inventory there was no dedicated audio/video clip catalog, rights ledger, player or bundled media file in the reviewed root paths. The subsequent [clips implementation](clips.md) adds a strict catalog/player and one locally authored, inspected first-party silent video, alongside three verified text passages. Live-call iframes, user voice uploads and generated voice responses remain separate features; they do not supply licensed editorial clips. There is no third-party audio/video clip release or production clearance.

Twelve existing `public/images/hero-*.jpeg` files are outside the book manifests. Several are referenced by legacy public routes. I found no matching source/rights ledger in the root documentation reviewed; their ownership or generation provenance remains unverified, rather than presumed unlicensed. Imported platform source has its own rights-hold copy and is not covered by the book manifests. Public availability must not be confused with rights clearance.

## Bounded audio candidate

The [official LibriVox Apology catalog](https://librivox.org/apology-by-plato/) identifies Plato, translator Benjamin Jowett, reader Bob Neufeld, catalog date 2011-12-05, and two parts lasting 44:07 and 35:15. Its text-source link is the same [Gutenberg ebook1656](https://www.gutenberg.org/ebooks/1656) used by the local Apology edition.

LibriVox's [own policy](https://librivox.org/pages/public-domain/) declares its recordings public domain in the United States and expressly allows excerpting, remixing and commercial reuse. That supports a bounded US-scoped candidate without assuming that public-domain text automatically clears a particular performance. Other territories remain unassessed. Preserve the narrator, translation and source credits even though the policy requests rather than mandates attribution.

The recording predates the current ebook update. Shared translator/ebook identity does not prove exact audio-to-current-text alignment. Timing, complete-thought boundaries, transcript and accessible captions require listening to the exact acquired asset before any clip can be marked publishable.

## Bounded video candidate

[NASA SVS13326, Black Hole Accretion Disk Visualization](https://svs.gsfc.nasa.gov/13326/), released 2019-09-25 and updated 2024-08-14, lists a specific 1080×1080 movie credited to NASA's Goddard Space Flight Center/Jeremy Schnittman. It is a topical companion to Relativity, not part of Einstein's text or historical footage. The page identifies a correction to an earlier camera orientation.

[SVS's reuse policy](https://svs.gsfc.nasa.gov/help/) permits reuse unless an item says otherwise and specifically distinguishes licensed music from reusable visuals. Propose a **visuals-only derivative with every audio stream removed**. Browser mute alone does not remove unlicensed audio from a distributable asset. The [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) support factual educational/editorial use with source acknowledgment, while retaining third-party, logo/personality and endorsement restrictions. Treat this proposal as US-scoped; no worldwide determination was made.

The “360” filename describes an orbiting camera. It does not establish an immersive/equirectangular Quest experience. Keep it a flat video unless actual projection and device checks establish otherwise.

## What the next implementation can rely on

[Structured proposals](../../verification/web/evidence/clip-source-proposals.json) contain exact official catalog/policy URLs, linked media URLs obtained from page metadata, recording/edition relationships, credits, territorial scope and required transformations. Both remain `publishable: false`: no media bytes, content hash, final excerpt timing or caption alignment has been verified.

A rights-gated catalog should keep underlying text, performance, visuals, soundtrack and territorial determinations separate. Publish only after the selected asset and final derivative are hash-bound, required credits survive playback/share/export, captions and controls work, and the intended release territories are supported. Unknown rights, missing provenance or an unreviewed soundtrack must leave the media unavailable rather than fall back to an arbitrary external URL. This audit performed no acquisition, spending, provider account operation or publication.
