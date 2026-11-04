import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('tooling/package.json'));
const { JSDOM } = require('jsdom');
const root = path.resolve('../../content/great-books');
const expected = {
  republic: [1497, 'Jowett'], meditations: [2680, 'Casaubon'],
  'genealogy-of-morals': [52319, 'Samuel'], apology: [1656, 'Jowett'],
  odyssey: [1727, 'Butler'], 'divine-comedy': [8800, 'Cary'],
  hamlet: [1524, null], relativity: [5001, 'Lawson'],
};
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => value.replace(/\s+/gu, ' ').trim();
function visible(document) {
  const copy = document.body.cloneNode(true);
  copy.querySelectorAll('script,style,noscript').forEach(node => node.remove());
  return canonical(copy.textContent);
}
function original(folder) {
  return JSON.parse(execFileSync('python3', ['-c',
    'import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); f=max((x for x in z.infolist() if x.filename.lower().endswith((".html",".htm"))),key=lambda x:x.file_size); print(json.dumps({"entry":f.filename,"html":z.read(f).decode("utf-8-sig")}))',
    path.join(folder, 'original.zip')], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 }));
}

for (const [bookId, [ebookId, translator]] of Object.entries(expected)) {
  test(`${bookId}: archived source, complete visible text, local images and edition identity agree`, () => {
    const folder = path.join(root, bookId);
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json')));
    const archive = fs.readFileSync(path.join(folder, 'original.zip'));
    const reader = fs.readFileSync(path.join(folder, 'reader.html'));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.bookId, bookId);
    assert.equal(manifest.source.ebookId, ebookId);
    assert.equal(manifest.source.archiveSha256, sha(archive));
    assert.equal(manifest.source.archiveBytes, archive.length);
    assert.equal(manifest.reader.sha256, sha(reader));
    assert.equal(manifest.reader.bytes, reader.length);
    assert.match(manifest.editionId, new RegExp(`^pg-${ebookId}-[a-f0-9]{64}$`));
    assert.equal(manifest.metadata.rights.jurisdiction, 'US');
    assert.equal(manifest.metadata.rights.outsideUS, 'not-assessed');
    assert.equal(manifest.metadata.rights.status, 'public-domain');
    if (translator) assert.match(JSON.stringify(manifest.metadata.translators), new RegExp(translator));
    if (bookId === 'divine-comedy') assert.match(JSON.stringify(manifest.metadata.illustrators), /Dor[eé]/);
    if (bookId === 'genealogy-of-morals') {
      assert.match(JSON.stringify(manifest.metadata.translators), /Kennedy/);
      assert.match(JSON.stringify(manifest.metadata.editionNotes), /[Vv]olume/);
    }
    const source = original(folder);
    const oldDOM = new JSDOM(source.html);
    const newDOM = new JSDOM(reader.toString());
    try {
      const document = newDOM.window.document;
      assert.equal(visible(document), visible(oldDOM.window.document), `${source.entry}: textual content changed`);
      assert.match(visible(document), /1\.E\.4\./);
      assert.match(visible(document), /FULL PROJECT GUTENBERG LICENSE/i);
      assert.equal(document.querySelector('script,iframe,object,embed,form,base,link,meta[http-equiv]'), null);
      for (const element of document.querySelectorAll('*')) {
        for (const attr of [...element.attributes]) {
          assert.doesNotMatch(attr.name, /^on/i);
          if (['href', 'src', 'srcset', 'action', 'formaction', 'poster'].includes(attr.name)) {
            assert.ok(attr.name === 'href' && attr.value.startsWith('#') || attr.name === 'src' && attr.value.startsWith(`/api/great-books/edition/${bookId}/assets/`), `${attr.name}=${attr.value}`);
          }
        }
      }
      const css = [...document.querySelectorAll('style')].map(n => n.textContent).join('');
      assert.doesNotMatch(css, /@import/i);
      for (const match of css.matchAll(/url\(\s*[\"']?([^\"')]+)[\"']?\s*\)/gi)) {
        assert.ok(match[1].startsWith(`/api/great-books/edition/${bookId}/assets/`), match[1]);
      }
      const indexed = [...document.querySelectorAll('[data-reading-index]')];
      assert.equal(indexed.length, manifest.reader.blockCount);
      assert.deepEqual(indexed.map(el => Number(el.dataset.readingIndex)), Array.from({ length: indexed.length }, (_, index) => index));
      assert.ok(indexed.length > 20, 'Substantial book text must be present');
      for (const item of manifest.reader.contents) assert.ok(document.getElementById(item.id), item.id);
      const assets = new Map(manifest.assets.map(asset => [asset.path, asset]));
      assert.equal(assets.size, manifest.assets.length);
      assert.equal(document.images.length, oldDOM.window.document.images.length, 'Every source image must remain');
      for (const image of document.images) {
        const imageUrl = new URL(image.getAttribute('src'), 'https://offline.invalid');
        const relative = decodeURIComponent(imageUrl.pathname.split('/assets/')[1]);
        assert.ok(assets.has(relative), relative);
        assert.equal(imageUrl.searchParams.get('sha'), assets.get(relative).sha256);
      }
      for (const asset of assets.values()) {
        assert.doesNotMatch(asset.path, /(?:^|\/)\.\.(?:\/|$)|^\//);
        const bytes = fs.readFileSync(path.join(folder, 'assets', asset.path));
        assert.equal(asset.bytes, bytes.length);
        assert.equal(asset.sha256, sha(bytes));
        assert.match(asset.mime, /^image\/(?:png|jpeg|gif|webp)$/);
        if (asset.mime === 'image/png') assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
        if (asset.mime === 'image/jpeg') assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8');
        if (asset.mime === 'image/gif') assert.equal(bytes.subarray(0, 3).toString(), 'GIF');
        if (asset.mime === 'image/webp') assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
      }
      if (bookId === 'relativity') {
        assert.ok(document.images.length > 20, 'Equations and diagrams must be retained');
        assert.match(visible(document), /Lorentz/);
      }
      if (bookId === 'hamlet') assert.ok([...document.querySelectorAll('p,pre')].some(el => canonical(el.textContent).length < 20), 'Short speaker/verse lines must remain');
    } finally {
      oldDOM.window.close();
      newDOM.window.close();
    }
  });
}
