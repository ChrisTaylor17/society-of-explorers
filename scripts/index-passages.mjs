import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';

// Offline derivative of the reviewed editions. This script never downloads,
// executes source scripts, changes reader documents, or rewrites their notices.
const root = path.resolve('.');
const tooling = createRequire(path.join(root, '..', 'tooling', 'package.json'));
const project = createRequire(path.join(root, 'package.json'));
const { JSDOM } = tooling('jsdom'), ts = project('typescript');
const checkOnly = process.argv.includes('--check');
const updateOwned = process.argv.includes('--update-owned') && !checkOnly;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const source = await fs.readFile(path.join(root, 'lib/books/passage-text.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiledModule = { exports: {} };
new vm.Script(`(function(exports,module){${compiled}\n})`).runInNewContext()(compiledModule.exports, compiledModule);
const { canonicalPassageText, passageBlockReason, PASSAGE_EXTRACTION_VERSION } = compiledModule.exports;
const editions = JSON.parse(await fs.readFile(path.join(root, 'lib/circles/reading-program-editions.json'), 'utf8'));
const pins = [];
async function output(filename, bytes) {
  try {
    const old = await fs.readFile(filename);
    if (!old.equals(bytes)) {
      if (!updateOwned) throw Error('Existing passage derivative differs: ' + path.relative(root, filename));
      await fs.writeFile(filename, bytes);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (checkOnly) throw Error('Missing passage derivative: ' + path.relative(root, filename));
    await fs.writeFile(filename, bytes, { flag: 'wx' });
  }
}
for (const edition of editions) {
  const folder = path.join(root, 'content/great-books', edition.bookId);
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
  const bytes = await fs.readFile(path.join(folder, 'reader.html'));
  if (manifest.bookId !== edition.bookId || manifest.editionId !== edition.editionId
    || manifest.reader.blockCount !== edition.blockCount || manifest.reader.bytes !== bytes.length
    || manifest.reader.sha256 !== digest(bytes) || manifest.reader.blockIndexVersion !== 'leaf-text-blocks-v1') throw Error('Edition pin mismatch');
  const dom = new JSDOM(bytes.toString('utf8'));
  try {
    const elements = [...dom.window.document.querySelectorAll('[data-reading-index]')];
    if (elements.length !== edition.blockCount || elements.some((element, index) => element.dataset.readingIndex !== String(index))) throw Error('Invalid block inventory');
    const blocks = elements.map(element => {
      const reason = passageBlockReason(element), text = canonicalPassageText(element);
      return { text: reason || !text ? null : text, reason: reason || (text ? null : 'empty') };
    });
    const meta = manifest.metadata;
    const metadataSha256 = digest(Buffer.from(JSON.stringify([meta.sourceTitle, meta.author, meta.translators, meta.editors,
      meta.illustrators, meta.rights, meta.licenseUrl, meta.licenseNotice, meta.editionNotes, manifest.source.landingUrl, manifest.source.archiveUrl])));
    const index = { version: 1, bookId: edition.bookId, editionId: edition.editionId,
      documentSha256: manifest.reader.sha256, metadataSha256, extractionVersion: PASSAGE_EXTRACTION_VERSION, blocks };
    const indexed = Buffer.from(JSON.stringify(index, null, 2) + '\n');
    await output(path.join(folder, 'passages.json'), indexed);
    pins.push({ bookId: edition.bookId, editionId: edition.editionId, blockCount: edition.blockCount,
      documentSha256: manifest.reader.sha256, metadataSha256, indexSha256: digest(indexed), indexBytes: indexed.length });
  } finally { dom.window.close(); }
}
await output(path.join(root, 'lib/books/passage-indexes.json'), Buffer.from(JSON.stringify(pins, null, 2) + '\n'));
process.stdout.write(JSON.stringify({ status: 'PASS', mode: checkOnly ? 'check' : updateOwned ? 'update-owned' : 'create-missing-only', editions: pins.length,
  blocks: pins.reduce((sum, pin) => sum + pin.blockCount, 0), sourceDocumentsChanged: false, network: 'denied by caller preload' }) + '\n');
