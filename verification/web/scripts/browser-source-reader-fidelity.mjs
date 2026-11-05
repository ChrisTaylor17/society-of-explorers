import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd(), EVIDENCE = path.join(ROOT, 'verification/web/evidence');
const output = path.join(EVIDENCE, 'source-reader-fidelity-browser.json');
const sha = value => createHash('sha256').update(value).digest('hex');
function resident(name) {
  const file = path.resolve(ROOT, name), info = fs.lstatSync(file);
  assert(info.isFile() && !info.isSymbolicLink() && (!info.size || info.blocks), 'Unavailable input ' + name);
  return file;
}
const read = name => fs.readFileSync(resident(name));
const startedAt = new Date().toISOString(), stories = [], books = [], http = [], errors = [], unexpected = [];
const cleanup = { browser: 'pending', fixture: 'pending' };
const publicCssReferrers = [];
let browser, fixture, sourceHashes = {}, failure = null;
const scope = 'Complete actual original and native-presentation derivative HTML for all eight canonical editions, served through actual anonymous source/asset route handlers in an offline TypeScript loader. Cached Chromium renders all source HTML/CSS/images at a 320px mobile viewport. Only declared viewport metadata and missing indexed-element IDs may differ. Browser HTTPS delivery and NextResponse are explicit local test adapters. Raw Chromium sends the exact public same-edition document URL on a source CSS image despite the no-referrer response policy; that header is recorded and preserved into the actual asset handler, never stripped. No raw-browser zero-referrer claim; independent native brokers construct fresh anonymous requests. No simplified text rendering, jsdom, native WebView/WKWebView runtime, native compilation/device accessibility acceptance, provider, production server, database, or external network operation.';
function write(status) {
  fs.writeFileSync(output, JSON.stringify({ status, startedAt, completedAt: new Date().toISOString(), stories, books,
    http, publicCssReferrers, errors, unexpected, cleanup, sourceHashes, failure, scope }, null, 2) + '\n');
}
function pass(name) { stories.push(name); write('RUNNING'); console.log('PASS ' + stories.length + ': ' + name); }
write('RUNNING');
try {
  assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')), 'Startup network guard required');
  read('verification/web/tests/support/source-reader-app.mjs');
  process.chdir(path.join(ROOT, 'verification/web'));
  const { createSourceReaderApp, sourceReaderAppHashes, ORIGIN } = await import('../tests/support/source-reader-app.mjs');
  sourceHashes = await sourceReaderAppHashes();
  for (const name of ['verification/web/scripts/browser-source-reader-fidelity.mjs', 'verification/web/scripts/deny-build-network.cjs',
    'verification/web/tests/edition-fidelity.test.mjs', 'lib/books/passage-indexes.json']) sourceHashes[name] = sha(read(name));
  const catalog = JSON.parse(read('lib/books/source-reader-catalog.json'));
  assert.equal(catalog.schemaVersion, 1); assert.equal(catalog.derivativeVersion, 'source-reader-v1');
  assert.equal(catalog.editions.length, 8);
  const cssAssets = new Set(catalog.editions.flatMap(edition => [...read(`content/great-books/${edition.bookId}/reader.html`).toString()
    .matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map(match => match[1])));
  let currentBookId = null;
  const require = createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
  resident(require.resolve('playwright'));
  const executablePath = resident('/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  fixture = await createSourceReaderApp();
  browser = await require('playwright').chromium.launch({ headless: true, timeout: 15000, executablePath,
    env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 320, height: 850 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', acceptDownloads: false });
  const p = await context.newPage(); p.setDefaultTimeout(15000);
  p.on('pageerror', error => errors.push(error.stack || String(error)));
  p.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    try {
      const headers = await request.allHeaders();
      assert.equal(url.origin, ORIGIN); assert.equal(request.method(), 'GET');
      for (const key of ['authorization', 'cookie', 'apikey']) assert.equal(headers[key], undefined, key + ' must be absent');
      assert(/^\/api\/great-books\/edition\/[a-z-]+(?:\/reader|\/assets\/[A-Za-z0-9_./-]+)?$/.test(url.pathname), 'Unexpected public route');
      const routeEdition = catalog.editions.find(edition => url.pathname.startsWith(`/api/great-books/edition/${edition.bookId}/`));
      assert(routeEdition, 'Unknown source edition route');
      const assetPath = url.pathname.split('/assets/')[1];
      const pin = assetPath ? routeEdition.assets.find(asset => asset.path === assetPath) : null;
      let response;
      if (headers.referer !== undefined) {
        assert.equal(request.resourceType(), 'image'); assert(pin); assert(cssAssets.has(url.pathname + url.search));
        assert.equal(routeEdition.bookId, currentBookId);
        assert.equal(headers.referer, `${ORIGIN}/api/great-books/edition/${routeEdition.bookId}/reader?edition=${routeEdition.editionId}`);
        publicCssReferrers.push({ path: url.pathname + url.search, referer: headers.referer });
        // The shared fixture intentionally rejects every Referer because native
        // brokers omit it. Preserve this raw browser header in the same actual
        // public asset handler without weakening that separate native fixture.
        const assetRoute = fixture.app.load('app/api/great-books/edition/[bookId]/assets/[...asset]/route.ts');
        response = await assetRoute.GET(new Request(url, { headers }), { params: Promise.resolve({ bookId: routeEdition.bookId, asset: assetPath.split('/') }) });
      } else response = await fixture.dispatch(url.pathname + url.search, { headers });
      const body = Buffer.from(await response.arrayBuffer());
      if (assetPath) {
        assert(pin, 'Unmanifested source asset'); assert.equal(url.search, '?sha=' + pin.sha256);
        assert.equal(sha(body), pin.sha256); assert.equal(body.length, pin.bytes); assert.equal(response.headers.get('content-type'), pin.mime);
      } else {
        assert.equal(url.pathname, `/api/great-books/edition/${routeEdition.bookId}/reader`);
        assert.equal(url.search, '?edition=' + routeEdition.editionId);
        assert.equal(sha(body), routeEdition.documentSha256); assert.equal(body.length, routeEdition.documentBytes);
      }
      http.push({ path: url.pathname + url.search, status: response.status, bytes: body.length,
        sha256: sha(body), contentType: response.headers.get('content-type'), referer: headers.referer ?? null });
      assert.equal(response.status, 200, url.pathname);
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
    } catch (error) { unexpected.push({ path: url.pathname + url.search, resourceType: request.resourceType(), error: error.stack || String(error) }); await route.abort(); }
  });
  for (const edition of catalog.editions) {
    const { bookId, editionId } = edition, base = `content/great-books/${bookId}`;
    currentBookId = bookId;
    console.log('CHECK complete source: ' + bookId);
    const original = read(base + '/reader.html'), derivative = read(base + '/native-reader.html');
    const manifest = JSON.parse(read(base + '/manifest.json'));
    const archive = read(base + '/original.zip');
    assert.equal(sha(archive), manifest.source.archiveSha256); assert.equal(archive.length, manifest.source.archiveBytes);
    sourceHashes[base + '/original.zip'] = sha(archive);
    const archived = JSON.parse(execFileSync('/usr/bin/python3', ['-c',
      'import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); f=max((x for x in z.infolist() if x.filename.lower().endswith((".html",".htm"))),key=lambda x:x.file_size); assert f.file_size<24000000; print(json.dumps({"entry":f.filename,"html":z.read(f).decode("utf-8-sig")}))',
      resident(base + '/original.zip')], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 }));
    assert.equal(sha(original), edition.sourceDocumentSha256); assert.equal(sha(derivative), edition.documentSha256);
    assert.equal(derivative.length, edition.documentBytes); assert.equal(manifest.editionId, editionId);
    assert.deepEqual(edition.assets, manifest.assets.map(({ path, sha256, bytes, mime }) => ({ path, sha256, bytes, mime })));
    const sourceResponse = await fixture.dispatch(`/api/great-books/edition/${bookId}?edition=${editionId}`);
    assert.equal(sourceResponse.status, 200); assert.equal(sha(Buffer.from(await sourceResponse.arrayBuffer())), edition.sourceDocumentSha256);
    const metadataResponse = await fixture.dispatch(`/api/great-books/text/${bookId}`);
    assert.equal(metadataResponse.status, 200);
    const metadata = await metadataResponse.json(); assert.equal(metadata.edition.editionId, editionId);
    const beforeRequests = http.length;
    const response = await p.goto(`${ORIGIN}/api/great-books/edition/${bookId}/reader?edition=${editionId}`, { waitUntil: 'load' });
    assert(response); assert.equal(response.status(), 200);
    assert.equal(response.headers()['x-soe-edition'], editionId); assert.equal(response.headers()['x-soe-reader'], 'source-reader-v1');
    assert.match(response.headers()['content-security-policy'], /default-src 'none'/);
    const structure = await p.evaluate(({ original, archived, edition, metadata }) => {
      const source = new DOMParser().parseFromString(original, 'text/html');
      const archive = new DOMParser().parseFromString(archived.html, 'text/html');
      const visible = doc => {
        const body = doc.body.cloneNode(true); body.querySelectorAll('script,style,noscript').forEach(node => node.remove());
        return body.textContent.replace(/\s+/gu, ' ').trim();
      };
      if (visible(source) !== visible(archive)) throw Error('Complete visible text differs from original archive');
      if (document.images.length !== archive.images.length) throw Error('Original source image count differs');
      const normalized = document.documentElement.cloneNode(true);
      const viewports = normalized.querySelectorAll('meta[name="viewport"]');
      if (viewports.length !== 1 || viewports[0].getAttribute('content') !== 'width=device-width, initial-scale=1') throw Error('Unexpected viewport derivative');
      viewports[0].remove();
      const indexed = [...normalized.querySelectorAll('[data-reading-index]')];
      if (indexed.length !== edition.blockCount) throw Error('Indexed element count differs');
      indexed.forEach((element, index) => {
        if (element.getAttribute('data-reading-index') !== String(index)) throw Error('Noncontiguous source position');
        const override = edition.anchorOverrides[String(index)], expected = override ?? `soe-reading-position-${index}`;
        if (element.id !== expected || document.getElementById(expected)?.getAttribute('data-reading-index') !== String(index)) throw Error('Wrong source anchor');
        if (!override) element.removeAttribute('id');
      });
      if (normalized.outerHTML !== source.documentElement.outerHTML) throw Error('DOM differs beyond declared viewport and indexed IDs');
      if (document.querySelector('script,iframe,object,embed,form,base,link,meta[http-equiv]')) throw Error('Active source document element');
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      if (new Set(ids).size !== ids.length) throw Error('Duplicate source anchors');
      for (const element of document.querySelectorAll('*')) for (const attr of element.attributes) {
        if (/^on/i.test(attr.name)) throw Error('Active source attribute');
        if (['href', 'src', 'srcset', 'action', 'formaction', 'poster'].includes(attr.name) &&
          !(attr.name === 'href' && attr.value.startsWith('#') || attr.name === 'src' && attr.value.startsWith(`/api/great-books/edition/${edition.bookId}/assets/`))) throw Error('Unexpected source URL');
      }
      const links = [...document.querySelectorAll('a[href]')];
      for (const link of links) if (!document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1)))) throw Error('Missing internal source target');
      for (const heading of metadata.edition.contents) if (!document.getElementById(heading.id)) throw Error('Missing source heading');
      const css = [...document.querySelectorAll('style')].map(element => element.textContent).join('\n');
      if (/@import|@font-face/i.test(css)) throw Error('Unexpected external stylesheet or font');
      const imageUrls = [...document.images].map(image => image.getAttribute('src'));
      const cssUrls = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map(match => match[1]);
      const resources = [...new Set([...imageUrls, ...cssUrls])].sort();
      const expected = edition.assets.map(asset => `/api/great-books/edition/${edition.bookId}/assets/${asset.path}?sha=${asset.sha256}`).sort();
      if (JSON.stringify(resources) !== JSON.stringify(expected)) throw Error('Source resource closure mismatch');
      const text = document.body.textContent;
      if (!/FULL PROJECT GUTENBERG LICENSE/i.test(text) || !text.includes('1.E.4.')) throw Error('Complete license missing');
      if (!document.getElementById('pg-footer')) throw Error('License anchor missing');
      return { blockCount: indexed.length, images: document.images.length,
        outsideIndexedImages: [...document.images].filter(image => !image.closest('[data-reading-index]')).length,
        emptyImageDescriptions: [...document.images].filter(image => !image.alt).length,
        tables: document.querySelectorAll('table').length, fragmentLinks: links.length,
        headings: metadata.edition.contents.length, resourceCount: resources.length, cssResources: cssUrls.length,
        sourceStyleCount: document.querySelectorAll('style').length, bodyTextCharacters: text.length,
        footnote: links.find(link => /note|foot|fn/i.test(link.getAttribute('href')))?.getAttribute('href') ?? null };
    }, { original: original.toString(), archived, edition, metadata });
    const decoded = await p.evaluate(async () => {
      await Promise.all([...document.images].map(image => image.decode()));
      if ([...document.images].some(image => !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0)) throw Error('Source image failed decoding');
      return document.images.length;
    });
    assert.equal(decoded, structure.images);
    // Decode CSS-only images too through their canonical actual asset route.
    const allAssets = await p.evaluate(async ({ bookId, assets }) => {
      for (const asset of assets) {
        const image = new Image(); image.referrerPolicy = 'no-referrer';
        image.src = `/api/great-books/edition/${bookId}/assets/${asset.path}?sha=${asset.sha256}`;
        await image.decode(); if (!image.naturalWidth || !image.naturalHeight) throw Error('Manifest image decode failed');
      }
      return assets.length;
    }, edition);
    assert.equal(allAssets, edition.assets.length);
    const layouts = [];
    for (const size of [20, 30]) {
      const layout = await p.evaluate(size => {
        document.documentElement.style.setProperty('--reader-font-size', size + 'px');
        // A synchronous layout read works with the real no-script sandbox;
        // do not weaken CSP merely to schedule page-owned animation callbacks.
        return {
          width: innerWidth, documentWidth: document.documentElement.scrollWidth,
          fontSize: getComputedStyle(document.documentElement).fontSize,
          bodyFont: getComputedStyle(document.body).fontFamily,
          overflowingImages: [...document.images].filter(image => image.getBoundingClientRect().width > document.documentElement.clientWidth + 1).length,
          tableOverflowRules: [...document.querySelectorAll('table')].map(table => getComputedStyle(table).overflowX),
          tableScroll: [...document.querySelectorAll('table')].map(table => {
            const previous = table.scrollLeft; table.scrollLeft = table.scrollWidth;
            const moved = table.scrollLeft; table.scrollLeft = previous;
            return { width: table.clientWidth, contentWidth: table.scrollWidth, moved };
          }),
          preWhitespace: [...document.querySelectorAll('pre')].map(pre => getComputedStyle(pre).whiteSpace),
        };
      }, size);
      assert.equal(layout.width, 320); assert(layout.documentWidth <= 321, bookId + ' page overflow at ' + size + ': ' + layout.documentWidth);
      assert.equal(layout.fontSize, size + 'px'); assert.equal(layout.overflowingImages, 0);
      assert(layout.tableOverflowRules.every(value => value === 'auto')); assert(layout.preWhitespace.every(value => value === 'pre-wrap'));
      assert(layout.tableScroll.every(table => table.contentWidth <= table.width + 1 || table.moved > 0), 'Overflowing table must remain horizontally scrollable');
      layouts.push({ size, ...layout });
    }
    await p.evaluate(() => document.documentElement.style.setProperty('--reader-font-size', '20px'));
    const positions = [...new Set([0, Math.floor(edition.blockCount / 2), edition.blockCount - 1])];
    for (const index of positions) {
      const anchor = edition.anchorOverrides[String(index)] ?? `soe-reading-position-${index}`;
      await p.goto(`${ORIGIN}/api/great-books/edition/${bookId}/reader?edition=${editionId}#${encodeURIComponent(anchor)}`, { waitUntil: 'load' });
      assert.equal(await p.evaluate(anchor => document.querySelector(':target')?.id === anchor, anchor), true);
    }
    if (structure.footnote) {
      const target = structure.footnote;
      await p.evaluate(target => document.querySelector(`a[href="${CSS.escape(target)}"]`).click(), target);
      assert.equal(await p.evaluate(target => decodeURIComponent(location.hash) === target && document.querySelector(':target')?.id === target.slice(1), target), true);
      await p.goBack({ waitUntil: 'load' });
    }
    if (bookId === 'hamlet') {
      const verse = await p.locator('[data-reading-index="41"]').innerText(); assert.equal(verse, 'BARNARDO.\nWho’s there?\n');
      await p.locator('[data-reading-index="41"]').scrollIntoViewIfNeeded();
      await p.screenshot({ path: path.join(EVIDENCE, 'source-reader-fidelity-hamlet-320.png') });
      await p.evaluate(() => document.documentElement.style.setProperty('--reader-font-size', '30px'));
      await p.locator('[data-reading-index="41"]').scrollIntoViewIfNeeded();
      await p.screenshot({ path: path.join(EVIDENCE, 'source-reader-fidelity-hamlet-large-text-320.png') });
    }
    if (bookId === 'divine-comedy') {
      assert.equal(structure.images, 138); assert.equal(structure.outsideIndexedImages, 138);
      await p.locator('img').nth(3).scrollIntoViewIfNeeded();
      await p.screenshot({ path: path.join(EVIDENCE, 'source-reader-fidelity-divine-comedy-320.png') });
    }
    if (bookId === 'relativity') {
      assert.equal(structure.images, 234); assert.equal(structure.tables, 4); assert(structure.cssResources > 0);
      await p.locator('[data-reading-index="117"]').scrollIntoViewIfNeeded();
      await p.screenshot({ path: path.join(EVIDENCE, 'source-reader-fidelity-relativity-equation-320.png') });
      await p.locator('table').last().scrollIntoViewIfNeeded();
      await p.screenshot({ path: path.join(EVIDENCE, 'source-reader-fidelity-relativity-table-320.png') });
      await p.locator('table').last().evaluate(table => { table.scrollLeft = table.scrollWidth; });
      await p.screenshot({ path: path.join(EVIDENCE, 'source-reader-fidelity-relativity-table-scrolled-320.png') });
    }
    books.push({ bookId, editionId, documentSha256: edition.documentSha256, sourceDocumentSha256: edition.sourceDocumentSha256,
      ...structure, archiveEntry: archived.entry, archiveSha256: manifest.source.archiveSha256,
      decodedImages: decoded, decodedAssets: allAssets, checkedPositions: positions, layouts,
      requests: http.length - beforeRequests });
    pass(`${bookId}: actual complete route, unchanged source DOM/styles/credits/license, all assets decoded, all internal targets, stable indexed anchors and 320px/20–30px layout`);
  }
  assert.equal(books.reduce((n, row) => n + row.images, 0), 375);
  assert.equal(books.reduce((n, row) => n + row.outsideIndexedImages, 0), 150);
  assert.equal(books.reduce((n, row) => n + row.decodedAssets, 0), 312);
  assert.equal(books.reduce((n, row) => n + row.blockCount, 0), 10198);
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  // Bind the actual cached modules loaded by this run, without walking packages.
  for (const file of Object.keys(require.cache)) sourceHashes[path.relative(ROOT, resident(file))] = sha(read(file));
  for (const [name, expected] of Object.entries(sourceHashes)) assert.equal(sha(read(name)), expected, 'Source changed during proof: ' + name);
  pass('All eight full documents retain 375 source images including 150 outside indexed blocks; 312 manifest assets decode, source hashes stay unchanged, and no credential/provider/unknown request occurs; exact public CSS referrer behavior is recorded separately');
} catch (error) { failure = error.stack || String(error); console.error(failure); }
finally {
  try { if (browser) await browser.close(); cleanup.browser = browser ? 'closed' : 'not-created'; } catch (error) { cleanup.browser = String(error); failure ??= String(error); }
  try { if (fixture) await fixture.close(); cleanup.fixture = fixture ? 'closed' : 'not-created'; } catch (error) { cleanup.fixture = String(error); failure ??= String(error); }
  write(failure ? 'FAIL' : 'PASS');
}
if (failure) process.exitCode = 1;
