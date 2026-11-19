#!/usr/bin/env node
// Explicit, offline-reproducible import of eight reviewed US public-domain
// editions. Network access happens only with --download for a missing archive.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tooling = createRequire(path.join(projectRoot, 'verification', 'web', 'tooling', 'package.json'));
const project = createRequire(path.join(projectRoot, 'package.json'));
const { JSDOM } = tooling('jsdom');
const postcss = project('postcss');
const sharp = project('sharp');
const reviewDate = '2026-11-03';
const licenseUrl = 'https://www.gutenberg.org/policy/license.html';
export const TRANSFORM_VERSION = 'inert-full-html-v1';
export const BLOCK_INDEX_VERSION = 'leaf-text-blocks-v1';
const translator = (name, appliesTo = 'Main work') => ({ name, appliesTo });

export const EDITIONS = [
  { bookId: 'republic', ebookId: 1497, sourceTitle: 'The Republic', author: 'Plato', translators: [translator('Benjamin Jowett')], editors: [], illustrators: [], editionNotes: ['Gutenberg points to an improved edition, 55201. This reviewed copy intentionally retains edition 1497.'] },
  { bookId: 'meditations', ebookId: 2680, sourceTitle: 'Meditations', author: 'Marcus Aurelius', translators: [translator('Meric Casaubon')], editors: [], illustrators: [], editionNotes: ['Translator is not listed in the Gutenberg catalog/RDF. The edition notes identify Casaubon and comparison of the 1634 and 1635 editions. This is not the George Long translation.'] },
  { bookId: 'genealogy-of-morals', ebookId: 52319, sourceTitle: 'The Genealogy of Morals', author: 'Friedrich Wilhelm Nietzsche', translators: [translator('Horace Barnett Samuel', 'The Genealogy of Morals'), translator('J. M. Kennedy', 'Appended Peoples and Countries fragment')], editors: ['Oscar Levy'], illustrators: [], editionNotes: ['Includes the Peoples and Countries fragment.', 'Catalog/RDF describes Volume Thirteen; the ebook front matter says Volume Eight, 1913. The discrepancy is retained rather than resolved by assumption.'] },
  { bookId: 'apology', ebookId: 1656, sourceTitle: 'Apology', author: 'Plato', translators: [translator('Benjamin Jowett')], editors: [], illustrators: [], editionNotes: ['The Apology of Socrates is the application display alias; Apology is the source title.'] },
  { bookId: 'odyssey', ebookId: 1727, sourceTitle: 'The Odyssey', author: 'Homer', translators: [translator('Samuel Butler')], editors: [], illustrators: [], editionNotes: ['English prose translation. Source subtitle: Rendered into English prose for the use of those who cannot read the original.'] },
  { bookId: 'divine-comedy', ebookId: 8800, sourceTitle: 'The divine comedy', author: 'Dante Alighieri', translators: [translator('Henry Francis Cary')], editors: [], illustrators: ['Gustave Doré'], editionNotes: ['Cary translation with Doré illustrations; not the Longfellow translation.'] },
  { bookId: 'hamlet', ebookId: 1524, sourceTitle: 'Hamlet', author: 'William Shakespeare', translators: [], editors: [], illustrators: [], editionNotes: ['Original English; no translator is listed. Speaker labels, stage directions and verse line breaks are retained.'] },
  { bookId: 'relativity', ebookId: 5001, sourceTitle: 'Relativity : the Special and General Theory', author: 'Albert Einstein', translators: [translator('Robert William Lawson')], editors: [], illustrators: ['Hermann Struck (portrait, credited in the ebook metadata)'], editionNotes: ['Gutenberg identifies the English source publication as Methuen & Co Ltd, 1920; 1916 is the original-work year.', 'HTML-only source package: equations and illustrations must remain local images. Gutenberg warns that some generated formats lose equations or images.'] },
];

export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// Review timestamps describe evidence freshness, not the content/bookmark identity.
export function editionIdentity({ sourceArchiveSha256, metadata, reader, assets }) {
  const rights = { ...metadata.rights };
  delete rights.reviewedAt;
  return sha256(JSON.stringify({ schemaVersion: 1, transformVersion: TRANSFORM_VERSION,
    sourceArchive: sourceArchiveSha256, metadata: { ...metadata, rights }, reader, assets }));
}
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

const unzipPython = String.raw`
import sys,zipfile,json,base64,posixpath,stat
entries=[];total=0
with zipfile.ZipFile(sys.argv[1]) as z:
 if len(z.infolist())>10000: raise ValueError('Archive entry limit exceeded')
 for info in z.infolist():
  name=info.orig_filename
  if info.is_dir(): continue
  if chr(92) in name or any(ord(c)<32 for c in name) or name.startswith('/') or '..' in name.split('/') or len(name)>500: raise ValueError('Unsafe archive path')
  if stat.S_ISLNK(info.external_attr >> 16): raise ValueError('Archive symlink refused')
  total+=info.file_size
  if total>int(sys.argv[2]) or info.file_size>32*1024*1024: raise ValueError('Archive expansion limit exceeded')
  data=z.read(info)
  entries.append({'path':posixpath.normpath(name),'data':base64.b64encode(data).decode('ascii')})
print(json.dumps(entries))
`;

export function unpackArchive(filename) {
  const rows = JSON.parse(execFileSync('python3', ['-c', unzipPython, filename, String(MAX_UNCOMPRESSED_BYTES)], { maxBuffer: 400 * 1024 * 1024, encoding: 'utf8' }));
  const entries = new Map();
  for (const row of rows) {
    if (entries.has(row.path)) throw new Error('Duplicate archive path');
    entries.set(row.path, Buffer.from(row.data, 'base64'));
  }
  return entries;
}

async function ensureArchive(edition, directory, download) {
  const filename = path.join(directory, 'original.zip');
  const receiptPath = path.join(directory, 'source-receipt.json');
  const archiveUrl = `https://www.gutenberg.org/cache/epub/${edition.ebookId}/pg${edition.ebookId}-h.zip`;
  if (!fs.existsSync(filename)) {
    if (!download) throw new Error(`Missing pinned archive for ${edition.bookId}; use explicit --download once.`);
    const response = await fetch(archiveUrl, { signal: AbortSignal.timeout(60_000), redirect: 'error', headers: { 'User-Agent': 'SoE local edition review: one-time selected archive import' } });
    if (!response.ok) throw new Error(`Archive download failed (${response.status}) for ${edition.bookId}`);
    const chunks = []; let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > MAX_ARCHIVE_BYTES) throw new Error('Archive download limit exceeded');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('Source response is not a ZIP archive');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filename, bytes, { flag: 'wx' });
    fs.writeFileSync(receiptPath, JSON.stringify({ archiveUrl, archiveSha256: sha256(bytes), archiveBytes: bytes.length, retrievedAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
  }
  if (!fs.existsSync(receiptPath)) throw new Error('Pinned source receipt missing; do not silently replace the archive.');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const bytes = fs.readFileSync(filename);
  if (receipt.archiveUrl !== archiveUrl || receipt.archiveSha256 !== sha256(bytes) || receipt.archiveBytes !== bytes.length) throw new Error('Pinned archive integrity check failed');
  return { ...receipt, filename };
}

function imageMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

// Strict path-based MathJax SVG rasterization. No scripts, entities, CSS or
// external references reach librsvg; the unmodified SVG stays in original.zip.
export async function rasterizeSourceSvg(entries) {
  const replacements = new Map();
  const tags = new Set(['svg', 'title', 'desc', 'defs', 'path', 'g', 'use', 'rect']);
  const attrs = new Set(['xmlns', 'xmlns:xlink', 'width', 'height', 'viewBox', 'id', 'stroke-width', 'd', 'stroke', 'fill', 'transform', 'xlink:href', 'href', 'x', 'y', 'style']);
  for (const [sourcePath, source] of entries) {
    if (!sourcePath.toLowerCase().endsWith('.svg')) continue;
    const text = source.toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('SVG entity declarations refused');
    const dom = new JSDOM(text, { contentType: 'image/svg+xml' });
    const svg = dom.window.document.documentElement;
    if (svg.namespaceURI !== 'http://www.w3.org/2000/svg' || svg.localName !== 'svg') throw new Error('Equation SVG namespace refused');
    const svgIds = new Set([...dom.window.document.querySelectorAll('[id]')].map(el => el.id));
    for (const el of dom.window.document.querySelectorAll('*')) {
      if (el.namespaceURI !== 'http://www.w3.org/2000/svg' || !tags.has(el.localName)) throw new Error(`Unsupported equation SVG element: ${el.localName}`);
      for (const attr of [...el.attributes]) {
        if (attr.name === 'xmlns' && attr.value !== 'http://www.w3.org/2000/svg' || attr.name === 'xmlns:xlink' && attr.value !== 'http://www.w3.org/1999/xlink') throw new Error('Equation SVG namespace refused');
        if (!attrs.has(attr.name) || (/url\s*\(|https?:|data:|javascript:|\/\//i.test(attr.value) && !attr.name.startsWith('xmlns'))) throw new Error('Active equation SVG attribute refused');
        if (attr.localName === 'href' && (!/^#[A-Za-z0-9_.:-]+$/.test(attr.value) || !svgIds.has(attr.value.slice(1)))) throw new Error('External or missing equation SVG reference refused');
        if (attr.name === 'style') {
          const declarations = attr.value.split(';').map(value => value.trim()).filter(Boolean);
          if (!declarations.length || declarations.some(value => !/^(?:vertical-align|margin-bottom):\s*-?(?:\d+(?:\.\d+)?|\.\d+)(?:ex|em|px)$/.test(value))) throw new Error('Unsupported equation SVG style refused');
          el.removeAttribute('style');
        }
      }
    }
    const safeSvg = Buffer.from(svg.outerHTML, 'utf8');
    dom.window.close();
    const density = 768;
    const { data, info } = await sharp(safeSvg, { density, limitInputPixels: 50_000_000 }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer({ resolveWithObject: true });
    const sourceSha256 = sha256(source);
    replacements.set(sourcePath, { path: `rasterized/${sourceSha256}.png`, data, mime: 'image/png', conversion: {
      algorithm: 'strict-mathjax-svg-paths-to-png-v1', sourcePath, sourceSha256, density,
      sharpVersion: sharp.versions.sharp, libvipsVersion: sharp.versions.vips, librsvgVersion: sharp.versions.rsvg,
      width: info.width, height: info.height,
    } });
  }
  return replacements;
}

const htmlTags = new Set('a abbr address article aside b bdi bdo blockquote br caption center cite code col colgroup dd del details dfn div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr i ins kbd li main mark nav noscript ol p pre q rp rt ruby s samp section small span strong sub summary sup table tbody td tfoot th thead time tr tt u ul var wbr img'.split(' '));
const mathTags = new Set('math mrow mi mn mo mfrac msup msub msubsup msqrt mroot mtable mtr mtd mtext mspace mfenced semantics annotation mmultiscripts mprescripts none mover munder munderover menclose mpadded mphantom mstyle'.split(' '));
const globalAttrs = new Set(['id', 'class', 'title', 'lang', 'dir', 'role', 'aria-label', 'aria-hidden']);
const mathAttrs = new Set('mathvariant mathsize display displaystyle scriptlevel stretchy symmetric largeop movablelimits linethickness columnalign rowalign columnspacing rowspacing columnspan rowspan notation open close separators accent accentunder encoding width height depth'.split(' '));
const blockSelector = 'p,h1,h2,h3,h4,h5,h6,pre,li,dt,dd,td,th,blockquote,figcaption';
const normalizeText = value => value.replace(/\s+/gu, ' ').trim();

export function canonicalBodyText(html) {
  const dom = new JSDOM(html);
  for (const el of dom.window.document.querySelectorAll('script,style')) el.remove();
  const result = normalizeText(dom.window.document.body.textContent);
  dom.window.close(); return result;
}

const baseCss = `
html{font-size:var(--reader-font-size,20px);color-scheme:light}
body{font-family:Georgia,"Times New Roman",serif;font-size:1rem!important;line-height:1.7!important;max-width:72ch!important;margin:0 auto!important;padding:1.25rem!important;color:#20231e!important;background:#fffdf6!important;overflow-wrap:break-word}
img{max-width:100%!important;height:auto!important} table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse}
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%} a{color:#174c76} a:focus-visible{outline:3px solid #735819;outline-offset:3px}
h1,h2,h3,h4,h5,h6{line-height:1.3;scroll-margin-top:1rem} [data-reading-index]{scroll-margin-top:1rem}
.pagenum,small{font-size:.8rem!important} @media(max-width:480px){body{padding:1rem!important}.figcenter,.figure,figure{max-width:100%!important;margin-left:0!important;margin-right:0!important}.pagenum{position:static!important;display:block!important;text-align:right!important}.itemNumber{position:static!important;left:auto!important;width:auto!important;margin-right:.5em}}
`;

// This edition's title compounds nested em sizes inside a padded title page.
// Keep the title hierarchy readable on a narrow frame without altering the
// prose, poem layouts, or other editions' typography.
const editionCss = {
  relativity: `@media(max-width:480px){
.titlePage{padding:2em 12px!important}
.titlePage .docTitle{line-height:1.3;margin:1.5em 0}
.titlePage .docTitle .mainTitle{font-size:clamp(1rem,7vw,1.4rem)!important}
.titlePage .docTitle .subTitle,.titlePage .docTitle .seriesTitle,.titlePage .docTitle .volumeTitle{font-size:1em!important;display:block}
.titlePage .byline,.titlePage .docImprint{font-size:1rem}
.titlePage .byline .docAuthor,.titlePage .docImprint .docDate{font-size:1em}
}`,
};

/** Strict inert HTML transformation; never enables jsdom scripts or resources. */
export function sanitizeEdition({ html, mainHtmlPath = 'book.html', entries = new Map(), bookId = 'fixture', rasterized = new Map() }) {
  const dom = new JSDOM(html, { url: `https://edition.invalid/${mainHtmlPath}` });
  const document = dom.window.document;
  const charset = document.characterSet;
  const originalText = normalizeText((() => {
    const body = document.body.cloneNode(true);
    for (const el of body.querySelectorAll('script,style')) el.remove();
    return body.textContent;
  })());
  const usedAssets = new Map();
  const warnings = [];
  let sourceImageCount = 0;
  const baseUrl = new URL(`https://edition.invalid/${mainHtmlPath}`);
  function localImage(reference) {
    let url;
    try { url = new URL(reference, baseUrl); } catch { return null; }
    if (url.origin !== baseUrl.origin || url.search || url.hash) return null;
    let filename;
    try { filename = decodeURIComponent(url.pathname.slice(1)); } catch { return null; }
    if (!entries.has(filename)) return null;
    const replacement = rasterized.get(filename);
    const bytes = replacement?.data || entries.get(filename), mime = imageMime(bytes);
    if (!mime) return null;
    const relative = replacement?.path || path.posix.relative(path.posix.dirname(mainHtmlPath), filename);
    if (!relative || relative.split('/').includes('..') || relative.startsWith('/') || /[\\\u0000-\u001f]/.test(relative)) return null;
    const assetSha256 = sha256(bytes);
    usedAssets.set(relative, { path: relative, sha256: assetSha256, bytes: bytes.length, mime, data: bytes, ...(replacement ? { conversion: replacement.conversion } : {}) });
    return `/api/great-books/edition/${bookId}/assets/${relative.split('/').map(encodeURIComponent).join('/')}?sha=${assetSha256}`;
  }
  function cssValue(value) {
    const decoded = value.replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff))).replace(/\\([^\r\n])/g, '$1');
    if (/expression\s*\(|(?:image|image-set|cross-fade|paint|element)\s*\(|(?:https?:|javascript:|data:|\/\/)/i.test(decoded)) return null;
    let bad = false, replaced = 0;
    const result = decoded.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^()\s]+))\s*\)/gi, (_, double, single, bare) => {
      replaced++; const local = localImage(double ?? single ?? bare);
      if (!local) { bad = true; return ''; }
      return `url("${local}")`;
    });
    return bad || replaced !== (decoded.match(/url\s*\(/gi) || []).length ? null : result;
  }
  function css(source, inline = false) {
    try {
      const sheet = postcss.parse(inline ? `x{${source}}` : source);
      if (inline && (sheet.nodes.length !== 1 || sheet.nodes[0].type !== 'rule' || sheet.nodes[0].selector !== 'x')) return '';
      sheet.walkAtRules(rule => { if (inline || !['media', 'supports'].includes(rule.name.toLowerCase()) || /url\s*\(|https?:|data:|javascript:|\/\//i.test(rule.params)) rule.remove(); });
      sheet.walkComments(comment => comment.remove());
      sheet.walkDecls(decl => {
        if (/^(?:behavior|-moz-binding)$/i.test(decl.prop)) { decl.remove(); return; }
        const value = cssValue(decl.value);
        if (value === null) decl.remove(); else decl.value = value;
      });
      return inline ? sheet.nodes[0].nodes.map(node => node.toString()).join(';') : sheet.toString();
    } catch { warnings.push('Unparseable source CSS removed.'); return ''; }
  }
  const styles = [...document.querySelectorAll('style')].map(style => css(style.textContent));
  for (const style of document.querySelectorAll('style')) style.remove();
  for (const script of document.querySelectorAll('script')) script.remove();
  for (const el of [...document.body.querySelectorAll('*')]) {
    const tag = el.localName.toLowerCase();
    if (!htmlTags.has(tag) && !mathTags.has(tag)) { el.replaceWith(...el.childNodes); continue; }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const own = (tag === 'a' && ['href', 'name'].includes(name))
        || (tag === 'img' && ['src', 'alt', 'width', 'height'].includes(name))
        || (['td', 'th'].includes(tag) && ['colspan', 'rowspan', 'scope', 'headers'].includes(name))
        || (tag === 'ol' && ['start', 'reversed', 'type'].includes(name))
        || (tag === 'li' && name === 'value')
        || (['col', 'colgroup'].includes(tag) && ['span', 'width'].includes(name))
        || (mathTags.has(tag) && mathAttrs.has(name));
      if (name === 'style') {
        const safe = css(attr.value, true);
        if (safe) el.setAttribute('style', safe); else el.removeAttribute('style');
      } else if ((!globalAttrs.has(name) && !own) || name.startsWith('on') || attr.value.length > 4096) el.removeAttribute(attr.name);
    }
    if (tag === 'img') {
      sourceImageCount++;
      const safe = localImage(el.getAttribute('src') || '');
      if (!safe) throw new Error(`Unpackaged or unsupported source image: ${el.getAttribute('src') || '(missing src)'}`);
      el.setAttribute('src', safe); el.setAttribute('loading', 'lazy'); el.setAttribute('decoding', 'async');
      if (!el.getAttribute('alt') && el.getAttribute('title')) el.setAttribute('alt', el.getAttribute('title'));
    }
    if (tag === 'a' && el.hasAttribute('href')) {
      const href = el.getAttribute('href');
      let url; try { url = new URL(href, baseUrl); } catch { /* Invalid links become plain text. */ }
      if (url && url.origin === baseUrl.origin && url.pathname === baseUrl.pathname && url.hash) el.setAttribute('href', url.hash);
      else el.removeAttribute('href');
    }
  }
  // Source body attributes can carry events too; retain only inert presentation.
  for (const attr of [...document.body.attributes]) {
    if (attr.name === 'style') { const value = css(attr.value, true); if (value) document.body.setAttribute('style', value); else document.body.removeAttribute('style'); }
    else if (!['id', 'class', 'lang', 'dir'].includes(attr.name)) document.body.removeAttribute(attr.name);
  }
  const originalIds = [...document.body.querySelectorAll('[id]')];
  const reservedIds = new Set(originalIds.map(el => el.id));
  const ids = new Set(); let duplicateIds = 0;
  for (const el of originalIds) {
    const original = el.id;
    if (ids.has(original)) { let n = 2; while (ids.has(`${original}-duplicate-${n}`) || reservedIds.has(`${original}-duplicate-${n}`)) n++; el.id = `${original}-duplicate-${n}`; duplicateIds++; }
    ids.add(el.id);
  }
  for (const anchor of document.body.querySelectorAll('a[name]')) {
    const name = anchor.getAttribute('name');
    if (!name || ids.has(name)) continue;
    if (!anchor.id) anchor.id = name;
    else { const alias = document.createElement('span'); alias.id = name; anchor.before(alias); }
    ids.add(name);
  }
  if (duplicateIds) warnings.push(`${duplicateIds} duplicate source ids received stable suffixes; links retain their original first target.`);
  // Preserve every source notice/license word. Give parent controls one stable
  // anchor even for editions whose source uses a different footer identifier.
  let footer = document.getElementById('pg-footer');
  if (!footer) {
    footer = [...document.body.querySelectorAll('section,div,pre,p')].reverse().find(el => /(?:START: FULL LICENSE|THE FULL PROJECT GUTENBERG LICENSE)/i.test(el.textContent));
    if (!footer) throw new Error('Full Gutenberg license not found in source');
    if (footer.id) { const alias = document.createElement('span'); alias.id = 'pg-footer'; footer.before(alias); }
    else footer.id = 'pg-footer';
  }
  const noticeNode = [...document.body.querySelectorAll('p,pre,div')].filter(el => el.textContent.includes('This eBook is for the use of anyone anywhere')).sort((a, b) => a.textContent.length - b.textContent.length)[0];
  if (!noticeNode) throw new Error('Source distribution notice not found');
  const noticeText = normalizeText(noticeNode.textContent);
  const noticeStart = noticeText.indexOf('This eBook is for the use of anyone anywhere');
  const noticeEndMatch = noticeText.slice(noticeStart).match(/before using this (?:eBook|ebook)\./i);
  if (!noticeEndMatch) throw new Error('Complete non-US distribution notice not found');
  const licenseNotice = noticeText.slice(noticeStart, noticeStart + noticeEndMatch.index + noticeEndMatch[0].length);
  const blocks = [...document.body.querySelectorAll(blockSelector)].filter(el => normalizeText(el.textContent) && !el.querySelector(blockSelector));
  blocks.forEach((el, index) => el.setAttribute('data-reading-index', String(index)));
  const contents = [];
  for (const heading of document.body.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const label = normalizeText(heading.textContent);
    if (!label || heading.closest('#pg-footer') || contents.length >= 200) continue;
    if (!heading.id) { let id = `reading-heading-${contents.length + 1}`; while (ids.has(id)) id += '-'; heading.id = id; ids.add(id); }
    const ownIndex = heading.getAttribute('data-reading-index');
    const next = ownIndex === null ? heading.querySelector('[data-reading-index]') : heading;
    contents.push({ id: heading.id, label: label.slice(0, 240), level: Number(heading.tagName.slice(1)), readingIndex: next ? Number(next.getAttribute('data-reading-index')) : null });
  }
  document.head.replaceChildren();
  const title = document.createElement('title'); title.textContent = `${bookId} — reviewed reading edition`; document.head.append(title);
  for (const value of [...styles, baseCss, ...(editionCss[bookId] ? [editionCss[bookId]] : [])]) { const style = document.createElement('style'); style.textContent = value; document.head.append(style); }
  for (const attr of [...document.documentElement.attributes]) document.documentElement.removeAttribute(attr.name);
  document.documentElement.setAttribute('lang', 'en');
  const output = '<!doctype html>\n' + document.documentElement.outerHTML + '\n';
  const visibleText = normalizeText(document.body.textContent);
  if (visibleText !== originalText) throw new Error('Source text fidelity check failed');
  dom.window.close();
  return { html: output, charset, assets: [...usedAssets.values()].sort((a, b) => a.path.localeCompare(b.path, 'en')), blockCount: blocks.length, contents, licenseNotice, sourceImageCount, warnings };
}

export async function importEditions({ download = false, only = null } = {}) {
  const results = [];
  for (const edition of EDITIONS.filter(item => !only || item.bookId === only)) {
    const directory = path.join(projectRoot, 'content', 'great-books', edition.bookId);
    const archive = await ensureArchive(edition, directory, download);
    const entries = unpackArchive(archive.filename);
    const htmlEntries = [...entries.entries()].filter(([name]) => /\.(?:html?|xhtml)$/i.test(name)).sort((a, b) => b[1].length - a[1].length);
    if (!htmlEntries.length) throw new Error('Source archive has no HTML document');
    const [mainHtmlPath, sourceHtml] = htmlEntries[0];
    const rasterized = await rasterizeSourceSvg(entries);
    const sanitized = sanitizeEdition({ html: sourceHtml, mainHtmlPath, entries, bookId: edition.bookId, rasterized });
    const readerBytes = Buffer.from(sanitized.html, 'utf8');
    const assets = sanitized.assets.map(asset => Object.fromEntries(Object.entries(asset).filter(([key]) => key !== 'data')));
    const metadata = { sourceTitle: edition.sourceTitle, author: edition.author, translators: edition.translators, editors: edition.editors, illustrators: edition.illustrators,
      rights: { jurisdiction: 'US', status: 'public-domain', authority: 'Project Gutenberg', outsideUS: 'not-assessed', reviewedAt: reviewDate }, licenseUrl, licenseNotice: sanitized.licenseNotice,
      editionNotes: [...edition.editionNotes, ...sanitized.warnings] };
    const reader = { sha256: sha256(readerBytes), bytes: readerBytes.length, blockIndexVersion: BLOCK_INDEX_VERSION, blockCount: sanitized.blockCount, contents: sanitized.contents };
    const editionSha256 = editionIdentity({ sourceArchiveSha256: archive.archiveSha256, metadata, reader, assets });
    const manifest = { schemaVersion: 1, transformVersion: TRANSFORM_VERSION, bookId: edition.bookId, editionId: `pg-${edition.ebookId}-${editionSha256}`, editionSha256,
      source: { provider: 'Project Gutenberg', ebookId: edition.ebookId, landingUrl: `https://www.gutenberg.org/ebooks/${edition.ebookId}`, archiveUrl: archive.archiveUrl, archiveSha256: archive.archiveSha256, archiveBytes: archive.archiveBytes, retrievedAt: archive.retrievedAt, mainHtmlPath, charset: sanitized.charset },
      metadata, reader, assets, fidelity: { canonicalTextSha256: sha256(canonicalBodyText(sourceHtml)), sourceImageCount: sanitized.sourceImageCount } };
    fs.mkdirSync(path.join(directory, 'assets'), { recursive: true });
    for (const asset of sanitized.assets) { const filename = path.join(directory, 'assets', asset.path); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, asset.data); }
    fs.writeFileSync(path.join(directory, 'reader.html'), readerBytes);
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    results.push({ bookId: edition.bookId, editionId: manifest.editionId, archiveBytes: archive.archiveBytes, readerBytes: reader.bytes, images: assets.length, blocks: reader.blockCount, headings: reader.contents.length, sourceHtml: mainHtmlPath, warnings: sanitized.warnings });
    process.stdout.write(JSON.stringify(results.at(-1)) + '\n');
  }
  if (only && !results.length) throw new Error('Unknown reviewed edition');
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const onlyIndex = args.indexOf('--book');
  const allowed = new Set(['--download', '--book', ...(onlyIndex >= 0 ? [args[onlyIndex + 1]] : [])]);
  if (args.some(arg => !allowed.has(arg))) throw new Error('Use --download and/or --book <reviewed-book-id>.');
  await importEditions({ download: args.includes('--download'), only: onlyIndex >= 0 ? args[onlyIndex + 1] : null });
}
