import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sanitizeEdition, rasterizeSourceSvg, unpackArchive, editionIdentity, sha256 } from '../../../scripts/import-editions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'tooling/package.json'));
const { JSDOM } = require('jsdom');
const manifest = JSON.parse(fs.readFileSync(path.join(root, '../../content/great-books/apology/manifest.json')));
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const fixture = (body, head = '') => `<!doctype html><html><head>${head}</head><body><p>${escape(manifest.metadata.licenseNotice)}</p>${body}<section id="pg-footer"><p>THE FULL PROJECT GUTENBERG LICENSE — 1.E.4.</p></section></body></html>`;
const parse = result => new JSDOM(result.html);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WQAAAAASUVORK5CYII=', 'base64');
const svg = (content = '<path id="line" d="M0 0 L10 10"/><use href="#line"/>', attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" ${attrs}>${content}</svg>`;

test('sanitizer removes active wrappers/attributes and keeps their visible text', () => {
  const result = sanitizeEdition({ html: fixture('<p onclick="alert(1)" data-evil="x">HAMLET.</p><form action="https://evil.invalid"><label>Ay.</label><input name="secret" value="private"></form><object data="https://evil.invalid"><p>Stage direction.</p></object><script>privateScript()</script>'), bookId: 'fixture' });
  const dom = parse(result);
  try {
    const d = dom.window.document;
    assert.equal(d.querySelector('script,form,input,object,embed,iframe'), null);
    assert.match(d.body.textContent, /HAMLET\.Ay\.Stage direction\./);
    assert.doesNotMatch(d.body.textContent, /privateScript/);
    for (const el of d.querySelectorAll('*')) for (const attr of el.attributes) assert.doesNotMatch(attr.name, /^(?:on|data-evil)/i);
    assert.equal(result.blockCount, 4);
  } finally { dom.window.close(); }
});

test('escaped CSS, imports, remote protocols and image functions cannot load resources', () => {
  const styles = String.raw`@import "https://evil.invalid/a.css";
    @font-face{font-family:remote;src:url(https://evil.invalid/font)}
    .a{background:u\72l(https://evil.invalid/a);color:#123}
    .b{background-image:image-set(url(https://evil.invalid/b) 1x)}
    .c{cursor:url(file:///etc/passwd),auto;-moz-binding:url(https://evil.invalid/c);behavior:url(https://evil.invalid/d)}
    @media screen{.d{background:url(//evil.invalid/e)}}`;
  const result = sanitizeEdition({ html: fixture('<p style="background:url(https://evil.invalid/f);color:#456">Kept.</p>', `<base href="https://evil.invalid/"><link rel="stylesheet" href="https://evil.invalid/g"><meta http-equiv="refresh" content="0;url=https://evil.invalid"><style>${styles}</style>`) });
  const dom = parse(result);
  try {
    const d = dom.window.document;
    assert.equal(d.querySelector('base,link,meta'), null);
    const css = [...d.querySelectorAll('style,[style]')].map(el => el.tagName === 'STYLE' ? el.textContent : el.getAttribute('style')).join('\n');
    assert.doesNotMatch(css, /evil\.invalid|@import|@font-face|file:|-moz-binding|behavior:|image-set/i);
    assert.match(css, /color:#123/);
    assert.match(css, /color:#456/);
  } finally { dom.window.close(); }
});

test('packaged raster images and CSS URLs are hash-pinned; external links retain text', () => {
  const result = sanitizeEdition({ html: fixture('<p><a href="https://evil.invalid">Source label</a><a href="#note">Footnote</a><span id="note">Note.</span></p><img src="images/dot.png" title="Equation x" onerror="alert(1)">', '<style>.cover{background:url(images/dot.png)}</style>'), mainHtmlPath: 'book.html', entries: new Map([['images/dot.png', png]]), bookId: 'fixture' });
  const dom = parse(result);
  try {
    const d = dom.window.document;
    const url = `/api/great-books/edition/fixture/assets/images/dot.png?sha=${sha256(png)}`;
    assert.equal(d.querySelector('img').getAttribute('src'), url);
    assert.equal(d.querySelector('img').alt, 'Equation x');
    assert.equal(d.querySelector('a').getAttribute('href'), null);
    assert.equal(d.querySelectorAll('a')[1].getAttribute('href'), '#note');
    assert.equal(d.querySelector('a').textContent, 'Source label');
    assert.ok([...d.querySelectorAll('style')].some(el => el.textContent.includes(url)));
    assert.equal(result.assets.length, 1);
    assert.equal(result.assets[0].sha256, sha256(png));
    assert.equal(result.assets[0].mime, 'image/png');
  } finally { dom.window.close(); }
});

test('named anchors, duplicate targets and brief verse blocks remain usable', () => {
  const result = sanitizeEdition({ html: fixture('<h2 id="scene">Scene I</h2><a name="legacy"></a><a id="own" name="alias"></a><p id="same">HAMLET.</p><p id="same">Ay.</p><p id="same-duplicate-2">Reserved.</p><pre>First line\nSecond line</pre><p><a href="#legacy">Legacy note</a><a href="#same">First target</a></p>') });
  const dom = parse(result);
  try {
    const d = dom.window.document;
    for (const id of ['scene', 'legacy', 'alias', 'own', 'same', 'same-duplicate-2', 'same-duplicate-3']) assert.ok(d.getElementById(id), id);
    assert.equal(d.getElementById('same').textContent, 'HAMLET.');
    assert.equal(d.getElementById('same-duplicate-3').textContent, 'Ay.');
    assert.equal(d.querySelector('pre').textContent, 'First line\nSecond line');
    assert.equal(d.querySelector('a[href="#legacy"]').getAttribute('href'), '#legacy');
    assert.deepEqual([...d.querySelectorAll('[data-reading-index]')].map(el => Number(el.dataset.readingIndex)), Array.from({ length: result.blockCount }, (_, i) => i));
    assert.equal(result.contents[0].id, 'scene');
    assert.equal(result.warnings.length, 1);
  } finally { dom.window.close(); }
});

for (const reference of ['https://evil.invalid/a.png', '//evil.invalid/a.png', 'file:///etc/passwd', 'data:image/png;base64,AAAA', '../outside.png', 'missing.png']) {
  test(`unpackaged image is refused: ${reference}`, () => assert.throws(() => sanitizeEdition({ html: fixture(`<img src="${reference}">`) }), /Unpackaged or unsupported source image/));
}

test('valid path-based numeric math becomes deterministic high-density PNG', async () => {
  const bytes = Buffer.from(svg(undefined, 'style="vertical-align: -0.338ex; margin-bottom: -0.19ex;"'));
  const entries = new Map([['images/equation.svg', bytes]]);
  const first = (await rasterizeSourceSvg(entries)).get('images/equation.svg');
  const second = (await rasterizeSourceSvg(entries)).get('images/equation.svg');
  assert.deepEqual(first.data, second.data);
  assert.equal(first.data.subarray(1, 4).toString(), 'PNG');
  assert.equal(first.path, `rasterized/${sha256(bytes)}.png`);
  assert.equal(first.conversion.density, 768);
  assert.ok(first.conversion.width >= 100 && first.conversion.height >= 100);
  assert.equal(first.conversion.sourceSha256, sha256(bytes));
});

const unsafeSvg = {
  script: svg('<script>alert(1)</script>'),
  event: svg('<path d="M0 0" onclick="alert(1)"/>'),
  file: svg('<use href="file:///etc/passwd"/>'),
  external: svg('<use href="https://evil.invalid/a.svg#p"/>'),
  missing: svg('<use href="#missing"/>'),
  namespace: '<svg xmlns="https://evil.invalid" width="10" height="10"/>',
  foreignNamespace: svg('<g xmlns="https://evil.invalid"><path d="M0 0"/></g>'),
  namespaceAlias: svg('<use xlink:href="#p"/>', 'xmlns:xlink="https://evil.invalid"'),
  remoteStyle: svg('', 'style="fill:url(https://evil.invalid/a)"'),
  entity: '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + svg('<title>&x;</title>'),
};
for (const [name, source] of Object.entries(unsafeSvg)) {
  test(`active or malformed SVG is refused: ${name}`, async () => assert.rejects(rasterizeSourceSvg(new Map([['unsafe.svg', Buffer.from(source)]]))));
}

const makeZipPython = String.raw`
import sys,json,zipfile,stat
spec=json.load(sys.stdin)
with zipfile.ZipFile(sys.argv[1],'w',compression=zipfile.ZIP_DEFLATED) as z:
 for row in spec:
  if 'count' in row:
   for i in range(row['count']): z.writestr(str(i)+'.txt','')
  else:
   info=zipfile.ZipInfo(row['path'].replace(chr(0),chr(1)))
   info.compress_type=zipfile.ZIP_DEFLATED
   if row.get('symlink'): info.external_attr=(stat.S_IFLNK|0o777)<<16
   z.writestr(info,('x'*row.get('bytes',1)).encode())
# Python's writer truncates NUL names; patch a same-length fixture to exercise
# the reader's untruncated orig_filename rather than testing that writer quirk.
for row in spec:
 if chr(0) in row.get('path',''):
  with open(sys.argv[1],'rb') as f: data=f.read()
  data=data.replace(row['path'].replace(chr(0),chr(1)).encode(),row['path'].encode())
  with open(sys.argv[1],'wb') as f: f.write(data)
`;
function withArchive(spec, check) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'soe-edition-zip-'));
  try {
    const filename = path.join(directory, 'fixture.zip');
    execFileSync('python3', ['-c', makeZipPython, filename], { input: JSON.stringify(spec) });
    check(filename);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('safe ZIP members remain byte-exact without extracting filesystem paths', () => withArchive([{ path: 'folder/book.html', bytes: 4 }, { path: 'folder/images/dot.png', bytes: 3 }], file => {
  const entries = unpackArchive(file);
  assert.equal(entries.get('folder/book.html').toString(), 'xxxx');
  assert.equal(entries.get('folder/images/dot.png').toString(), 'xxx');
}));

for (const unsafe of ['../outside.txt', '/absolute.txt', 'folder/../../outside.txt', 'folder\\outside.txt', 'control\u0000name.txt']) {
  test(`unsafe ZIP path is refused: ${JSON.stringify(unsafe)}`, () => withArchive([{ path: unsafe }], file => assert.throws(() => unpackArchive(file), /Unsafe archive path/)));
}
test('ZIP symlinks and duplicate normalized paths are refused', () => {
  withArchive([{ path: 'link', symlink: true }], file => assert.throws(() => unpackArchive(file), /symlink refused/));
  withArchive([{ path: 'a/./b.txt' }, { path: 'a/b.txt' }], file => assert.throws(() => unpackArchive(file), /Duplicate archive path/));
});
test('ZIP count and expanded member bounds are enforced before file reads', () => {
  withArchive([{ count: 10001 }], file => assert.throws(() => unpackArchive(file), /entry limit/));
  withArchive([{ path: 'oversize.html', bytes: 32 * 1024 * 1024 + 1 }], file => assert.throws(() => unpackArchive(file), /expansion limit/));
});

test('edition identity binds renderer/indexed content/assets but excludes review freshness', () => {
  const input = { sourceArchiveSha256: manifest.source.archiveSha256, metadata: manifest.metadata, reader: manifest.reader, assets: manifest.assets };
  assert.equal(editionIdentity(input), manifest.editionSha256);
  const dated = structuredClone(input); dated.metadata.rights.reviewedAt = '2099-12-31';
  assert.equal(editionIdentity(dated), manifest.editionSha256);
  for (const change of [copy => { copy.reader.blockIndexVersion += '-changed'; }, copy => { copy.reader.sha256 = 'a'.repeat(64); }, copy => { copy.assets.push({ path: 'changed.png', sha256: 'b'.repeat(64) }); }, copy => { copy.metadata.author += ' changed'; }, copy => { copy.sourceArchiveSha256 = 'c'.repeat(64); }]) {
    const copy = structuredClone(input); change(copy);
    assert.notEqual(editionIdentity(copy), manifest.editionSha256);
  }
});
