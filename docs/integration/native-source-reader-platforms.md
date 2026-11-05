# Native full-edition platform source

`SourceReader.tsx` wraps the app-local Fabric component `SoeSourceReader`. Its inputs are a catalog book, exact edition, selected block, fresh bounded request key, and active state. It accepts no URL, HTML, script, headers, member identity, Circle identity or provider configuration. `sourceReaderAvailable()` checks native component registration; absence leaves the existing reader available through the parent UI.

The derivative preserves complete source HTML, styles, tables, images, equations and internal links. Its only structural changes are the viewport and missing indexed IDs. Existing IDs are preserved through the catalog's anchor map. Original edition identity, original document hash and derivative document hash remain distinct. An indexed selection is what the explicit saved-place control saves; freely scrolling or following a footnote does not silently change that selection.

Android registers `SourceReaderManager` through the existing package and uses the platform WebView. Codegen now includes modules and components. The Gradle copy task packages exactly `lib/books/source-reader-catalog.json`, without copying the content tree or reading provider data. The anonymous network origin is the validated public `SOE_MEMBER_ORIGIN` build value; the reader never opens the member store.

The iOS implementation is Objective-C++ Fabric source wrapping WKWebView. The RN 0.88 component registration names `SoeSourceReaderView`. The local Expo module declares the reader pod, and the iOS config plugin packages the same catalog inside the pod as a resource. The generated host can set the canonical HTTPS public `SoeReaderOrigin` independently of member configuration. This checkout has the [iOS account bridge and host source](ios-member-bridge.md); Expo project generation, CocoaPods resolution and device acceptance remain open.

Each native view verifies the entire selected document and every manifest asset before loading the renderer. Bounds are 2 MiB per document, 512 KiB per image, 256 images and 32 MiB per selected edition, with a 120-second preparation deadline. Exact paths, query pins, MIME, byte lengths and SHA-256 hashes must match. Responses use identity encoding. A resource failure discards the view and requires explicit retry. There is no persistent resource cache.

Within one active view and unchanged edition, Previous/Next reuse verified bytes and navigate to the exact selected fragment with a fresh request key. Android observes history/page completion; iOS observes URL/loading and navigation completion. Both require the current fragment and selected index before emitting `ready`. These signals establish the native code's requested destination and completed document load; actual pixel position, accessibility and native layout still require device acceptance.

Both renderers disable page JavaScript and expose no JavaScript interface/evaluator. Android serves a synthetic HTTPS origin through an intercepting client with network fallback disabled. iOS serves a private custom scheme through a per-view handler and a nonpersistent website data store. Their separate native HTTP clients exclude cookies, credentials, redirects, caches and renderer-supplied headers. They never send bearer, apikey, member or Circle context. Android additionally guards each physical resource exchange with its network interceptor. The iOS source makes one application task per resource with no application retry; NSURLSession's underlying wire retry behavior has not been verified and is not claimed to be physically once-only.

Pause/background, hidden/detached view, recycle, inactive selection, different edition, error and close retire the resource session and destroy rendered content. Resuming requires an explicit new request key. Account retirement is owned by the parent screen in addition to these independent native lifecycle hooks. Completed resource bytes never cross a retired view lifetime.

`platforms/tests/native-source-reader-policy.test.mjs` executes actual TypeScript resource/selection policy and actual TSX callback code using explicit hook/native primitives. Its Kotlin, Objective-C++, package and registration cases are labeled static source assertions. These are not native compilation or device tests. Cached browser fidelity tests establish source/layout behavior in Chromium only. Remaining native acceptance includes Codegen compatibility with the installed React Native version, Android WebView interception with network blocking, WK custom-scheme CSP/resource behavior, all eight complete documents, image/table/equation layout, internal links, anchor jumps, cancellation, process loss, background/foreground and accessibility.

Reproduce the local policy check without installations or startup network access:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor \
  node --require ./verification/web/scripts/deny-build-network.cjs \
  --test platforms/tests/native-source-reader-policy.test.mjs
```

No Android or iOS build, simulator, device, provider, deployment or native runtime acceptance is established by this source milestone.
