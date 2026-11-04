# Pinned Great Books editions

Reviewed 2026-11-03. This is an eight-edition local content review, not a worldwide rights clearance or a production release. Each retained Project Gutenberg catalog entry identifies its edition as public domain in the USA. The manifests therefore record jurisdiction `US`, authority `Project Gutenberg`, and `outsideUS: not-assessed`.

## Edition identity and attribution

| Application book | Gutenberg ID and official catalog | Source edition and contributors | Material distinction |
| --- | --- | --- | --- |
| Republic | [1497](https://www.gutenberg.org/ebooks/1497) | *The Republic*, Plato; Benjamin Jowett, translator | The catalog points to improved edition 55201. This import intentionally pins the already selected 1497. |
| Meditations | [2680](https://www.gutenberg.org/ebooks/2680) | *Meditations*, Marcus Aurelius; Meric Casaubon, translator | Catalog/RDF omits the translator. The retained ebook introduction and notes identify Casaubon and the 1634/1635 editions. This is not George Long's translation. |
| Genealogy of Morals | [52319](https://www.gutenberg.org/ebooks/52319) | *The Genealogy of Morals*, Friedrich Wilhelm Nietzsche; Horace Barnett Samuel, main translator; J. M. Kennedy, appended *Peoples and Countries* fragment; Oscar Levy, editor | Catalog/RDF says Complete Works, Volume Thirteen. The ebook title page says Volume Eight, 1913. This unresolved discrepancy is recorded, not silently corrected. The appended fragment remains included. |
| Apology | [1656](https://www.gutenberg.org/ebooks/1656) | *Apology*, Plato; Benjamin Jowett, translator | The application's *The Apology of Socrates* label is an alias rather than the catalog title. |
| Odyssey | [1727](https://www.gutenberg.org/ebooks/1727) | *The Odyssey*, Homer; Samuel Butler, translator | English prose translation; do not present this as a verse translation. |
| Divine Comedy | [8800](https://www.gutenberg.org/ebooks/8800) | *The divine comedy*, Dante Alighieri; Henry Francis Cary, translator; Gustave Doré, illustrator | Cary with Doré illustrations, not Longfellow. Verse structure and the packaged illustrations remain. |
| Hamlet | [1524](https://www.gutenberg.org/ebooks/1524) | *Hamlet*, William Shakespeare | Original English; no translator. Speaker labels, brief speeches, stage directions, and verse breaks remain. |
| Relativity | [5001](https://www.gutenberg.org/ebooks/5001) | *Relativity: the Special and General Theory*, Albert Einstein; Robert William Lawson, translator; Hermann Struck portrait credit in source metadata | English source publication is Methuen, 1920; 1916 is the original-work year. Equations require the HTML package's image resources. |

The catalog pages, their official RDF metadata, and the retained edition front matter were used together. Gutenberg's own [permissions guidance](https://www.gutenberg.org/policy/permission.html) cautions that an ebook need not be identical to one particular print edition. Bibliographic aliases, original-work years, and translation years must not be substituted for the pinned source edition.

## Distribution conditions retained

The [full Gutenberg license](https://www.gutenberg.org/policy/license.html) and [permissions guidance](https://www.gutenberg.org/policy/permission.html) distinguish US copyright status from trademark and redistribution conditions. Every original ZIP is kept unmodified. Every compiled reader retains the complete source credits, notices, and full license text. External links in the frame become text; the parent reader supplies working source-catalog and license links and immediate access to the retained license at `#pg-footer`.

License sections 1.E.1 and 1.E.4 require a prominent notice and full-license availability when the Gutenberg name remains. Section 1.E.6 addresses reformatting and access to the original format. The local ZIP download preserves that original package. Sections 1.E.7–1.E.9 address charging and additional trademark conditions: keep access to these copies free; a future paywall or paid distribution needs a separate review. The metadata notice is extracted from the actual pinned ebook, preserving its wording while normalizing whitespace; it is not reconstructed from memory.

US status does not establish rights elsewhere. No non-US determination, translation-rights clearance for other countries, or additional warranty is asserted. Source notices and historic publisher marks remain as evidence, not as a claim of current affiliation.

The [website terms](https://www.gutenberg.org/policy/terms_of_use.html) discourage embedding their hosted books or operating a front end that uses their bandwidth, request stable ebook landing-page links, and direct bulk acquisition to mirrors. These eight selected complete archives were acquired once. Product requests read local pinned files and never fetch Gutenberg. Any broader acquisition needs its own review of the [robot access guidance](https://www.gutenberg.org/policy/robot_access.html).

## Reproduce without network

Run from the candidate root:

```sh
node scripts/import-editions.mjs
```

This default refuses missing archives and verifies each `original.zip` against its existing `source-receipt.json` before rebuilding. It does not call `fetch`. The explicit one-time acquisition option is `--download`; it fetches only missing selected archives. `--book <bookId>` narrows a rebuild. Existing archives or receipts are never overwritten by acquisition. The official archive URL pattern is `https://www.gutenberg.org/cache/epub/{id}/pg{id}-h.zip`.

The importer uses the existing linked tooling `jsdom` and existing application `postcss`/`sharp`; it installs no package and changes no product dependency. Python's standard `zipfile` reads the archive without extracting paths onto disk. Limits are 64 MiB per downloaded archive, 10,000 entries, 256 MiB expanded total, and 32 MiB per member. Traversal, absolute paths, symlinks, controls, and duplicate normalized paths fail the import. The largest HTML member is selected. All eight source HTML members are UTF-8 and named `pg{ID}-images.html`.

## Compiled reader contract

Each book directory contains `original.zip`, its acquisition receipt, `reader.html`, `manifest.json`, and an `assets/` directory. The manifest records:

- Exact Gutenberg ID and source URLs; ZIP SHA-256, byte count, retrieval timestamp, selected HTML entry, and charset.
- Source title, author, scoped translator credits, editor/illustrator credits, explicit US-only rights status, reviewed date, license URL, source-extracted notice, and unresolved edition notes.
- Reader SHA-256, bytes, zero-based contiguous text-block count/index algorithm, and a bounded heading table of contents preserving existing fragment targets.
- Asset relative paths, MIME types, bytes, SHA-256, and any conversion provenance.
- A canonical source-body text hash and source image count.

`editionId` is `pg-{Gutenberg ID}-{64-hex SHA-256}`. Its compound hash binds the source ZIP, bibliographic/rights metadata excluding the review timestamp, compiled indexed HTML, block count/TOC, asset hashes/conversion records, and explicit transformation versions. It excludes the acquisition timestamp. `transformVersion` is `inert-full-html-v1`; `reader.blockIndexVersion` is `leaf-text-blocks-v1`. A changed source, conversion, renderer, or block layout receives a different identity rather than silently reinterpreting an old bookmark.

Assets are raster PNG/JPEG/GIF/WebP only, served from `/api/great-books/edition/{bookId}/assets/{path}?sha={assetSHA}`. `assets[].path` is relative inside the edition's `assets/` directory and excludes an `assets/` prefix. This hash makes an old document's asset request fail explicitly after an incompatible replacement. No remote resource survives into the reader.

HTML remains one complete document. Structural, poetry, drama, table, image, and supported MathML markup remain; source CSS is isolated in the scriptless frame. Active elements/attributes, imports, remote CSS URLs, external navigation, metadata, base elements, forms, scripts, and embeds are removed or unwrapped without discarding their textual children. Local image references are rewritten to hash-pinned local API URLs. Internal footnote/contents links remain. Legacy named anchors receive IDs; duplicate IDs receive stable suffixes while original links retain the first target. Responsive base styles add readable contrast, font sizing, wrapping, table scrolling, and bounded images. Narrow-screen page-number and enumerated-item markers return to normal flow, and fixed-width figure containers shrink to their available width; no content is hidden to suppress overflow.

Each rebuild compares the entire source-body text (excluding script/style content and normalizing whitespace) to the transformed body and aborts on text loss. The output retains source line breaks and structural elements; text equality alone is not a claim of identical typography, semantic accessibility, or mathematical equivalence. Parent-owned independent fidelity tests and browser checks cover those additional boundaries. Relativity also has a narrow-screen title-page rule that removes compounded heading/subtitle font sizes and reduces side padding; this keeps title words intact without changing general prose or other editions.

## Relativity equation conversion

The original ZIP contains 163 MathJax-style SVG equation resources; 159 are referenced by the document. These use paths, groups, local fragment references, and rectangles. No SVG is served by the reader. The importer validates the supported SVG vocabulary, namespace, fragment targets, and numeric alignment styles, then rasterizes the source paths with existing Sharp/libvips/librsvg. It does not generate or reinterpret equation content with an AI model.

Conversion `strict-mathjax-svg-paths-to-png-v1` uses density 768 DPI, PNG compression level 9, adaptive filtering disabled, and a 50-million input-pixel bound. The current recorded versions are Sharp 0.34.5, libvips 8.17.3, and librsvg 2.61.2. Each emitted asset records its original SVG path/hash, conversion versions, and pixel dimensions; its deterministic filename is `rasterized/{sourceSvgSHA}.png`. Original SVGs remain unchanged in the downloadable archive. Existing equation alt/title labels are preserved, and a title fills a missing alt label. This does not supply a new semantic mathematical transcription when the original lacks one.

## Import inventory

| Book | Original ZIP bytes | Compiled reader bytes | Local assets | Indexed blocks |
| --- | ---: | ---: | ---: | ---: |
| Republic | 571,254 | 1,392,287 | 0 | 4,747 |
| Meditations | 440,084 | 588,565 | 0 | 1,186 |
| Genealogy of Morals | 224,303 | 394,258 | 2 | 347 |
| Apology | 90,307 | 115,511 | 0 | 125 |
| Odyssey | 559,197 | 798,555 | 1 | 1,357 |
| Divine Comedy | 29,948,232 | 779,730 | 138 | 440 |
| Hamlet | 344,955 | 304,408 | 0 | 1,446 |
| Relativity | 528,678 | 420,878 | 171 | 550 |

Final byte sizes and all authoritative hashes are the generated manifests, not this explanatory table. Divine Comedy dominates the approximately 67 MiB local content footprint because the original illustrated archive and served local images are both retained. This is a local review artifact; no upload or deployment is performed by the importer.
