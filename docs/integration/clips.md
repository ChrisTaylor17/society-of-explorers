# Clips and passages

Implemented in the canonical release worktree on 2026-11-04. This is local product functionality, not deployment or production clearance.

## Working flow

`/clips` offers three short, credited passages from the existing pinned Apology, Meditations and Relativity editions. The server resolves the actual edition/block coordinates and text bytes on every catalog read. “Read in context” opens the exact reader position; “Bring this passage to a Circle” enters the existing reviewed passage composer. A missing or changed edition omits that card rather than quoting stale copied text.

The catalog also includes **How a Circle works**, a 23.955-second original silent SoE video. The source HTML, MP4, WebVTT and essential inspection receipt live in versioned `content/clips`. Its original text and canvas graphics use no third-party media, audio, music or voice. The receipt records decoded dimensions 720×404, one video track, zero audio tracks, no external assets and inspection of all six authored frames. The public label says “Original SoE content; local automated checks”; it does not claim human approval, actual member footage or a released product.

LibriVox and NASA remain proposals in the [rights audit](content-rights-audit.md), outside the runtime registry and unavailable for playback. No third-party audio/video rights were silently promoted.

## Publication and storage gate

`lib/clips/registry.json` is a maintainer-controlled private registry. Entries need explicit `status: catalog-approved` and `publishable: true`, but those flags alone are insufficient. The reusable verifier also requires:

- Strict identifiers, bounded fields and separate source, final asset, caption and inspection file pins; every pin names a relative file with exact bytes and SHA256.
- Real-path containment under `content/clips`, no symlink escape, regular files opened without following a leaf symlink, bounded reads and actual content-hash comparison. The source limit is 64MiB; the final clip is at most 16MiB and 120 seconds; caption/inspection files are at most 64KiB.
- Exact artifact identities in the pinned inspection, reviewed duration, required track configuration, video dimensions and frame-check evidence. MIME is allowlisted and checked against file signatures. A signature is not codec-decoding proof: the creation/inspection pipeline and browser checks supply that evidence.
- Valid WebVTT with ordered, bounded cues covering the clip, no executable markup, and a transcript derived from the same caption bytes.
- Explicit review mode, check date, source timing, territorial scope and display/excerpt/reencode/caption/commercial permissions. Future-dated checks, unknown territory and malformed records fail closed. Duplicate IDs expose no ambiguous entry.

First-party originals require the pinned local-creation/inspection evidence and an explicit no-external-assets determination. The initial original uses the entire authored timeline. This mode is separate from documentary rights review and is labeled accordingly.

Third-party media additionally requires an exact source-page/media-URL pair from a small code-reviewed HTTPS allowlist; hash-bound original and derivative bytes; source-duration/excerpt timing; matching source, credit and check date in the rights receipt; an unexpired or explicitly non-expiring review; and permissions/territory determinations for each relevant component. Audio needs text and performance review. Video needs visuals and, if retained, soundtrack/performance review. The proposed NASA derivative must have all audio removed and that transformation recorded. Merely setting “public domain” or “approved” on a proposal cannot satisfy these requirements.

The default public context has **unknown territory**, so only WORLDWIDE-reviewed entries can appear. A US-only review does not become usable through a query parameter or caller-supplied header. A trusted server territory resolver and additional territorial evidence remain necessary before enabling such recordings.

## Public boundary and playback

`GET /clips/catalog` accepts no query and returns only whitelisted text/media display DTOs. It never returns proposal counts, review documents, source filesystem paths, original media URLs, reviewer identities, approval flags or inspection details. The client receives credits, review scope, a transcript, and local hash-bound media/caption links.

`GET`/`HEAD /clips/media/{id}?sha={digest}` and `/clips/captions/{id}?sha={digest}` repeat the approval/file checks. Unknown or held entries and replaced files return generic unavailable responses. A stale digest returns 409. The endpoints cannot fetch or proxy a URL. They support one strict byte range, open-ended and suffix ranges for seeking, 206/416 semantics, Content-Length and ETag. Responses use no-store, NoSniff, no-referrer and same-origin resource policy. Full-file verification is bounded; this is not a general streaming service.

The React player creates no media element or media request before **Load**. That explicit action fetches the media and captions with cookies omitted, no referrer, no redirects and no cache; it bounds both streams and verifies both hashes again. Only then are revocable local blob URLs attached to controls with `preload="none"`, anonymous mode and no autoplay. Playback still requires the player control. Unload, retirement and unmount abort requests and revoke URLs. Errors preserve an explicit retry and transcript instead of substituting another source.

## Verification and remaining checks

[Focused evidence](../../verification/web/evidence/clips-tests.json) records 21 passing cases under a clean environment and startup network guard. These exercise the actual gate, gateway, canonical retained first-party file, hash-verifying client and real React server rendering. They cover held/missing/changed artifacts; source/rights/territory/timing checks; symlink/traversal rejection; captions; HEAD/Range; generic failures; bounded anonymous reads; no automatic media loading; and exact text source links. Synthetic media/rights receipts are isolated test fixtures, not third-party clearance.

The actual retained original passes catalog → media/caption route → anonymous bounded client → SHA256 verification, including HEAD and seek ranges. Its generation receipt separately records real Chromium decoding and six inspected frames. Full canonical build/browser integration, interactive player controls, narrow-screen/keyboard behavior and available-device playback remain release-owner checks; these focused tests do not substitute for them. TypeScript and targeted ESLint passed during implementation.

Re-run from `verification/web`:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor node --require ./scripts/deny-build-network.cjs --test tests/clip-gate.test.mjs tests/clip-http.test.mjs tests/clip-client.test.mjs tests/clip-retained.test.mjs
```

The deployment must retain `content/clips/**/*` in the `/clips` route traces. Regenerating or replacing media, source, captions or inspection invalidates the old registry hashes until review is repeated and the record deliberately updated. No database, account, provider, package, spending or production change is required by this feature.
