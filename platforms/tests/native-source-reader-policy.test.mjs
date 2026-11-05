import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const safe = path => { const s = fs.lstatSync(path); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks) && !(s.flags & 0x40000000)); return fs.readFileSync(path, 'utf8'); };
safe('platforms/tests/load-source.mjs');
const { sourceLoader } = await import('./load-source.mjs');
const load = sourceLoader(), policy = load('platforms/native/src/reading/source-reader-policy.ts'), source = load('lib/books/source-reader.ts');
const catalog = JSON.parse(safe('lib/books/source-reader-catalog.json'));
const selection = (changes = {}) => ({ bookId: 'hamlet', editionId: source.getSourceReaderEdition('hamlet').editionId, blockIndex: 41, requestKey: 'reader-1', ...changes });

test('all eight complete documents and all 312 binary assets have exact anonymous resource policy', () => {
  let assets = 0;
  for (const edition of catalog.editions) {
    const path = source.sourceReaderDocumentPath(edition.bookId, edition.editionId), result = policy.sourceReaderResource(edition.bookId, edition.editionId, path);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { path, sha256: edition.documentSha256, bytes: edition.documentBytes, mime: 'text/html' });
    assert.notEqual(result.sha256, edition.sourceDocumentSha256);
    for (const asset of edition.assets) {
      const path = `/api/great-books/edition/${edition.bookId}/assets/${asset.path}?sha=${asset.sha256}`;
      assert.equal(policy.sourceReaderResource(edition.bookId, edition.editionId, path)?.sha256, asset.sha256); assets++;
    }
  }
  assert.equal(assets, 312);
});
test('all 10,198 valid indexed positions resolve source-preserving original or generated anchors', () => {
  let count = 0, originals = 0;
  for (const edition of catalog.editions) for (let blockIndex = 0; blockIndex < edition.blockCount; blockIndex++) {
    const value = selection({ bookId: edition.bookId, editionId: edition.editionId, blockIndex });
    assert.equal(policy.validSourceReaderSelection(value), true);
    assert.equal(policy.sourceReaderFragment(value), '#' + encodeURIComponent(edition.anchorOverrides[String(blockIndex)] ?? `soe-reading-position-${blockIndex}`));
    if (edition.anchorOverrides[String(blockIndex)]) originals++; count++;
  }
  assert.equal(count, 10198); assert(originals > 0);
});
test('missing/stale editions, invalid indices and unbounded request keys cannot select a native document', () => {
  for (const value of [null, selection({ editionId: undefined }), selection({ editionId: 'stale' }), selection({ bookId: 'Hamlet' }), selection({ bookId: '../hamlet' }),
    selection({ blockIndex: -1 }), selection({ blockIndex: 1.1 }), selection({ blockIndex: NaN }), selection({ blockIndex: Infinity }), selection({ blockIndex: '41' }),
    selection({ blockIndex: source.getSourceReaderEdition('hamlet').blockCount }), selection({ requestKey: '' }), selection({ requestKey: 'x'.repeat(129) }), selection({ requestKey: 'key/account' })]) {
    assert.equal(policy.validSourceReaderSelection(value), false); assert.equal(policy.sourceReaderFragment(value), null);
  }
  assert.equal(policy.validSourceReaderSelection(selection({ requestKey: 'x'.repeat(128) })), true);
});
test('document lane rejects missing/alternate/duplicate pin, query order, encoding, remote and related API routes', () => {
  const v = selection(), path = source.sourceReaderDocumentPath(v.bookId, v.editionId);
  for (const bad of [path.split('?')[0], path + '&x=1', path + '&edition=' + v.editionId, path + '#fragment', path.replace('hamlet', '%68amlet'), path.replace('reader?', 'reader/?'), path.replace('edition=', 'edition=%20'),
    'https://remote.invalid' + path, '/api/auth/member', '/api/great-books/passage?book=hamlet', '/api/great-books/text/hamlet', path.replace('/reader', '')]) assert.equal(policy.sourceReaderResource(v.bookId, v.editionId, bad), null);
  assert.equal(policy.sourceReaderResource(v.bookId, undefined, path), null);
});
test('assets are same-book and exact path/hash with no traversal, fragments, credential or unpinned aliases', () => {
  const e = catalog.editions.find(e => e.assets.length), a = e.assets[0], path = `/api/great-books/edition/${e.bookId}/assets/${a.path}?sha=${a.sha256}`;
  for (const bad of [path.split('?')[0], path + '&sha=' + a.sha256, path + '&token=x', path + '#x', path.replace('/assets/', '/assets/../assets/'), path.replace('/assets/', '/assets/%2e%2e/assets/'), path.replace(a.sha256, '0'.repeat(64)), path.replace('?sha=', '?SHA=')]) assert.equal(policy.sourceReaderResource(e.bookId, e.editionId, bad), null);
  for (const other of catalog.editions.filter(other => other.bookId !== e.bookId)) assert.equal(policy.sourceReaderResource(other.bookId, other.editionId, path), null);
});
test('catalog pins exact resident derivative bytes, including larger-than-legacy-transport document', () => {
  let large = false;
  for (const e of catalog.editions) {
    const html = safe(`content/great-books/${e.bookId}/native-reader.html`);
    assert.equal(Buffer.byteLength(html), e.documentBytes); assert.equal(crypto.createHash('sha256').update(html).digest('hex'), e.documentSha256);
    assert(html.includes('name="viewport"')); if (e.documentBytes > 1048576) large = true;
  }
  assert(large);
});

// This hook harness executes the actual TSX callback policy with explicitly
// supplied React/native primitives. It is not a React renderer or native test.
function wrapper(platform = 'android', installed = true) {
  let cursor = 0, state = [], effects = [], cleanups = new Map();
  const same = (a, b) => a?.length === b?.length && a.every((v, n) => v === b[n]);
  const react = {
    useRef(value) { const i = cursor++; state[i] ??= { current: value }; return state[i]; },
    useMemo(fn, deps) { const i = cursor++; if (!state[i] || !same(state[i].deps, deps)) state[i] = { deps, value: fn() }; return state[i].value; },
    useLayoutEffect(fn, deps) { const i = cursor++; if (!state[i] || !same(state[i], deps)) { state[i] = deps; effects.push(() => { cleanups.get(i)?.(); cleanups.set(i, fn()); }); } },
  };
  const primitives = { Platform: { OS: platform }, UIManager: { getViewManagerConfig: () => installed ? {} : null }, codegenNativeComponent: () => 'NativeReader' };
  const loader = sourceLoader({ react, 'react-native': primitives, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) } });
  const loaded = loader('platforms/native/SourceReader.tsx');
  return { module: loaded, render(props) { cursor = 0; const result = loaded.SourceReader(props); const jobs = effects; effects = []; jobs.forEach(fn => fn()); return result; }, unmount() { cleanups.forEach(fn => fn?.()); cleanups.clear(); }, installed(value) { installed = value; } };
}
const event = (requestKey = 'reader-1', blockIndex = 41, phase = 'ready') => ({ nativeEvent: { requestKey, blockIndex, phase } });
test('wrapper only offers actual registered Android/iOS component, with explicit unavailable response', () => {
  for (const platform of ['android', 'ios', 'web']) for (const installed of [true, false]) {
    const f = wrapper(platform, installed), received = [], onState = value => received.push(value);
    assert.equal(f.module.sourceReaderAvailable(), installed && platform !== 'web');
    const view = f.render({ ...selection(), active: true, onState });
    assert.equal(!!view, installed && platform !== 'web'); assert.equal(received.length, view ? 0 : 1);
    if (!view) assert.equal(received[0].phase, 'unavailable'); f.unmount();
  }
});
test('actual wrapper callback accepts only current key/index and known status', () => {
  const f = wrapper(), received = [], onState = value => received.push(value), view = f.render({ ...selection(), active: true, onState });
  for (const bad of [event('other'), event('reader-1', 42), event('reader-1', 41, 'success'), event('reader-1', 41, 'closed')]) view.props.onReaderState(bad);
  assert.equal(received.length, 0); view.props.onReaderState(event()); assert.equal(received.length, 1); f.unmount();
});
test('retained wrapper callbacks retire on same-key book replacement, callback replacement, inactivity and unmount', () => {
  const f = wrapper(), first = [], second = [], onState = value => first.push(value), props = { ...selection(), active: true, onState };
  const old = f.render(props); const next = f.render({ ...props, bookId: 'apology', editionId: source.getSourceReaderEdition('apology').editionId });
  old.props.onReaderState(event()); assert.equal(first.length, 0);
  const replacement = f.render({ ...props, onState: value => second.push(value) }); next.props.onReaderState(event()); assert.equal(first.length, 0);
  replacement.props.onReaderState(event()); assert.equal(second.length, 1);
  f.render({ ...props, active: false }); replacement.props.onReaderState(event()); assert.equal(second.length, 1);
  const last = f.render(props); f.unmount(); last.props.onReaderState(event()); assert.equal(first.length, 0);
});
test('wrapper invalid selection never mounts the native component or exposes arbitrary source props', () => {
  const f = wrapper(), received = [], onState = value => received.push(value);
  assert.equal(f.render({ ...selection({ editionId: 'stale' }), active: true, onState }), null); assert.equal(received[0].phase, 'unavailable');
  const view = f.render({ ...selection(), active: true, onState, origin: 'https://bad.invalid', bearer: 'PRIVATE', html: '<script/>', circleId: 'PRIVATE' });
  assert.deepEqual(Object.keys(view.props).sort(), ['active', 'blockIndex', 'bookId', 'editionId', 'onReaderState', 'requestKey', 'style']);
  f.unmount();
});

const android = 'platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/reader/';
test('Android resource security and independent lifecycle are present (STATIC SOURCE ONLY, NOT COMPILED)', () => {
  const session = safe(android + 'SourceReaderSession.kt'), view = safe(android + 'SourceReaderView.kt'), catalogSource = safe(android + 'SourceReaderCatalog.kt');
  for (const token of ['.followRedirects(false)', '.followSslRedirects(false)', '.retryOnConnectionFailure(false)', 'CookieJar.NO_COOKIES', '.cache(null)', 'Authenticator.NONE', 'sent?.compareAndSet(false, true)', 'response.code == 200', 'SourceReaderCatalog.sha(data) == resource.sha', 'data.size == resource.bytes', 'readBytesBounded(resource.bytes)', 'Executors.newFixedThreadPool(4)', 'TimeUnit.SECONDS.toNanos(120)', 'resources.values.forEach { it.cancel(true) }']) assert(session.includes(token), token);
  for (const token of ['javaScriptEnabled = false', 'blockNetworkLoads = true', 'allowFileAccess = false', 'allowContentAccess = false', 'domStorageEnabled = false', 'setAcceptThirdPartyCookies(view, false)', 'SourceReaderSession.denied()', 'resourceSession.prepare', 'onHostPause()', 'onDetachedFromWindow()', 'previous.destroy()', 'attemptedKey == requestKey']) assert(view.includes(token), token);
  assert(!view.includes('evaluateJavascript(') && !view.includes('addJavascriptInterface('));
  assert(!session.includes('SOE_PROVIDER') && !session.includes('SOE_PUBLISHABLE') && !session.includes('MemberSecureStore'));
  assert(catalogSource.includes('33554432') && catalogSource.includes('524288') && catalogSource.includes('2097152'));
});
test('iOS private renderer/resource isolation and lifecycle are present (STATIC SOURCE ONLY, NOT COMPILED)', () => {
  const text = safe('platforms/native/ios-source/SoeSourceReaderView.mm');
  for (const token of ['WKWebsiteDataStore.nonPersistentDataStore', 'allowsContentJavaScript = NO', 'NSURLSessionConfiguration.ephemeralSessionConfiguration', 'config.HTTPCookieStorage = nil', 'config.HTTPShouldSetCookies = NO', 'config.URLCredentialStorage = nil', 'config.URLCache = nil', 'request.HTTPShouldHandleCookies = NO', 'completionHandler(nil); [task cancel]', 'buffer.length + data.length <= maximum', 'SRSha(data)', '_verified.count == _resources.count', 'startURLSchemeTask:', 'stopURLSchemeTask:', 'UIApplicationWillResignActiveNotification', 'prepareForRecycle', '[_network invalidateAndCancel]', '[_verified removeAllObjects]', '[_web stopLoading]', 'SoeReaderOrigin']) assert(text.includes(token), token);
  assert(!text.includes('evaluateJavaScript:') && !text.includes('addScriptMessageHandler:') && !text.includes('SOE_PROVIDER') && !text.includes('SOE_PUBLISHABLE'));
  assert(text.includes('img-src soe-reader:') && text.includes('script-src \'none\''));
});
test('Fabric/package catalog wiring exists without a new runtime dependency (STATIC SOURCE ONLY)', () => {
  const pkg = JSON.parse(safe('platforms/native/package.json')), gradle = safe('platforms/native/android/app/build.gradle'), pod = safe('platforms/native/ios-source/SoeSourceReader.podspec');
  assert.equal(pkg.codegenConfig.type, 'all'); assert.equal(pkg.codegenConfig.ios.componentProvider.SoeSourceReader, 'SoeSourceReaderView');
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@supabase/auth-js', 'expo', 'expo-status-bar', 'react', 'react-native']);
  assert(gradle.includes("'../../lib/books/source-reader-catalog.json'") && gradle.includes('sourceSets.main.assets.srcDir(sourceReaderAssets)'));
  assert(pod.includes("'../../../lib/books/source-reader-catalog.json'") && pod.includes("s.frameworks = 'WebKit'"));
  assert(safe('platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/SoeMemberPackage.kt').includes('listOf(SourceReaderManager())'));
});
test('native same-edition reuse binds exact selected fragment and retires bytes with the view (STATIC SOURCE ONLY)', () => {
  const androidView = safe(android + 'SourceReaderView.kt'), ios = safe('platforms/native/ios-source/SoeSourceReaderView.mm');
  for (const token of ['identity == next && web != null', 'navigateSelection()', 'doUpdateVisitedHistory', 'url == targetUrl && source.url == targetUrl', 'blockIndex == targetIndex', 'session?.close()']) assert(androidView.includes(token), token);
  for (const token of ['if (_web) { [self navigateSelection]; return; }', 'forKeyPath:@"URL"', 'forKeyPath:@"loading"', '[_web.URL.absoluteString isEqual:_target]', '_targetIndex == _index', '[_resources close]']) assert(ios.includes(token), token);
});
