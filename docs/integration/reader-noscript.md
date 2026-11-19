# Reading without JavaScript

Verified locally on 2026-11-11. Before this change the actual built Apology page remained at “Loading the complete local edition…” when JavaScript was disabled, although its complete edition endpoint worked.

The server page now verifies local edition availability and renders a native recovery view inside `noscript`. Readers can open the complete credited edition and use Back to return to their original reading link, then return to the library. A requested edition must match exactly. Linked selection URLs explicitly say that this alternative opens the whole edition without positioning or highlighting the selection. Malformed, duplicate, unknown and mismatched requests receive recovery text, not a substituted book.

The enhanced BookReader, edition verification/handlers, source text, license, CSP/sandbox/headers, proxy and service worker are unchanged. Public local filesystem verification runs once on server rendering in addition to the existing enhanced reader's metadata request; it does not resolve an account or Circle.

Acceptance: six focused groups pass; scoped lint passes with zero warnings; full offline Next 16.2.9 build/type check passes in 65.85 seconds. Twelve recorded built-browser observations cover before/after, 320/390px layouts, keyboard opening and native contents, original-query recovery, library return, unknown book, mismatch and the normal scripted reader. The complete Apology has 125 blocks and its full license. Its complete bytes and all protective response headers match before/after.

Known-edition unavailability is a synthetic focused test. Arbitrary partial-JavaScript failure, real accounts, hosted behavior and devices are not newly accepted. The normal reader retains its exact linked block positioning and text-size controls; no private tool was invoked.

Detailed local evidence: [receipt](/Users/christaylor/Documents/Mewest/RESEARCH/soe-reader-noscript-2026-11-11/COMPLETION.json), [browser observations](/Users/christaylor/Documents/Mewest/RESEARCH/soe-reader-noscript-2026-11-11/BROWSER_CHECKS.json), [edition bytes and headers](/Users/christaylor/Documents/Mewest/RESEARCH/soe-reader-noscript-2026-11-11/EDITION_BEFORE_AFTER.json), [phone view](/Users/christaylor/Documents/Mewest/RESEARCH/soe-reader-noscript-2026-11-11/AFTER_320_SELECTION.png).
