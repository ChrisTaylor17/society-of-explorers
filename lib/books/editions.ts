import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { getBook } from './catalog';
import { isEditionId, parseBookEditionResponse, type BookEditionResponse } from './bookmarks';

type Asset = { path: string; sha256: string; bytes: number; mime: string };
type Manifest = {
  schemaVersion: 1; bookId: string; editionId: string;
  source: { provider: 'Project Gutenberg'; ebookId: number; landingUrl: string; archiveUrl: string; archiveSha256: string; archiveBytes: number; retrievedAt: string };
  metadata: { sourceTitle: string; author: string; translators: Array<{ name: string; appliesTo: string }>; editors: string[]; illustrators: string[];
    rights: BookEditionResponse['edition']['rights']; licenseUrl: string; licenseNotice: string; editionNotes: string[] };
  reader: { sha256: string; bytes: number; blockCount: number; contents: BookEditionResponse['edition']['contents'] };
  assets: Asset[];
};
const SHA = /^[a-f0-9]{64}$/;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const plain = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const size = (v: unknown, max: number): v is number => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= max;
export class EditionUnavailable extends Error { constructor() { super('The verified reading edition is unavailable'); } }
export class EditionMismatch extends Error { constructor() { super('The requested reading edition changed'); } }

function safeAssetPath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 300 && /^[A-Za-z0-9_.\/-]+$/.test(value)
    && !value.split('/').some(part => !part || part === '.' || part === '..');
}
async function localFile(bookId: string, relative: string, limit: number): Promise<Buffer> {
  const root = path.resolve(process.cwd(), 'content', 'great-books');
  const bookRoot = path.resolve(root, bookId);
  const target = path.resolve(bookRoot, relative);
  const realRoot = await realpath(root), realBook = await realpath(bookRoot), realTarget = await realpath(target);
  if (!realBook.startsWith(`${realRoot}${path.sep}`) || !realTarget.startsWith(`${realBook}${path.sep}`)) throw new EditionUnavailable();
  const info = await stat(realTarget);
  if (!info.isFile() || info.size < 1 || info.size > limit) throw new EditionUnavailable();
  const bytes = await readFile(realTarget);
  if (bytes.length > limit) throw new EditionUnavailable();
  return bytes;
}
async function verifiedFile(bookId: string, relative: string, hash: string, length: number, limit: number): Promise<Buffer> {
  const bytes = await localFile(bookId, relative, limit);
  if (bytes.length !== length || createHash('sha256').update(bytes).digest('hex') !== hash) throw new EditionUnavailable();
  return bytes;
}
function project(m: Manifest): BookEditionResponse {
  const book = getBook(m.bookId)!;
  const meta = m.metadata;
  const credits = [meta.sourceTitle, meta.author, ...meta.translators.map(t => `${t.name} (translation: ${t.appliesTo})`),
    ...meta.editors.map(n => `${n} (editor)`), ...meta.illustrators.map(n => `${n} (illustrator)`), `Project Gutenberg ebook ${m.source.ebookId}`];
  const dto = parseBookEditionResponse({ bookId: book.id, title: book.title, author: book.author, edition: {
    editionId: m.editionId, documentUrl: `/api/great-books/edition/${book.id}?edition=${m.editionId}`, downloadUrl: `/api/great-books/edition/${book.id}/download?edition=${m.editionId}`,
    sourceCatalogUrl: m.source.landingUrl, sourceArchiveUrl: m.source.archiveUrl, sourceTitle: meta.sourceTitle, sourceAuthor: meta.author,
    attribution: credits.join(' · '), translators: meta.translators, editors: meta.editors, illustrators: meta.illustrators,
    rights: meta.rights, licenseUrl: meta.licenseUrl, licenseNotice: meta.licenseNotice, editionNotes: meta.editionNotes,
    blockCount: m.reader.blockCount, contents: m.reader.contents,
  } });
  if (!dto) throw new EditionUnavailable();
  return dto;
}
async function manifestFor(bookId: string): Promise<Manifest | null> {
  const book = getBook(bookId); if (!book) return null;
  try {
    const m: unknown = JSON.parse((await localFile(bookId, 'manifest.json', 2_000_000)).toString('utf8'));
    if (!plain(m) || m.schemaVersion !== 1 || m.bookId !== bookId || !isEditionId(m.editionId)
      || !plain(m.source) || m.source.provider !== 'Project Gutenberg' || m.source.ebookId !== Number(book.gutenberg_id)
      || m.source.landingUrl !== `https://www.gutenberg.org/ebooks/${book.gutenberg_id}`
      || typeof m.source.archiveSha256 !== 'string' || !SHA.test(m.source.archiveSha256) || !size(m.source.archiveBytes, 100_000_000)
      || !plain(m.reader) || typeof m.reader.sha256 !== 'string' || !SHA.test(m.reader.sha256) || !size(m.reader.bytes, 30_000_000)
      || !plain(m.metadata) || !Array.isArray(m.assets) || m.assets.length > 2000) throw new EditionUnavailable();
    for (const a of m.assets) {
      if (!plain(a) || !safeAssetPath(a.path) || typeof a.sha256 !== 'string' || !SHA.test(a.sha256)
        || !size(a.bytes, 30_000_000) || typeof a.mime !== 'string' || !IMAGE_TYPES.has(a.mime)) throw new EditionUnavailable();
    }
    if (new Set(m.assets.map(a => (a as Asset).path)).size !== m.assets.length) throw new EditionUnavailable();
    const manifest = m as unknown as Manifest; project(manifest); return manifest;
  } catch { throw new EditionUnavailable(); }
}

export async function readBookEdition(bookId: string): Promise<BookEditionResponse | null> {
  const m = await manifestFor(bookId); if (!m) return null;
  try { await verifiedFile(bookId, 'reader.html', m.reader.sha256, m.reader.bytes, 30_000_000); }
  catch { throw new EditionUnavailable(); }
  return project(m);
}
export async function readEditionDocument(bookId: string, expectedEditionId?: string): Promise<{ bytes: Buffer; sha256: string; editionId: string } | null> {
  const m = await manifestFor(bookId); if (!m) return null;
  if (expectedEditionId !== undefined && m.editionId !== expectedEditionId) throw new EditionMismatch();
  try { return { bytes: await verifiedFile(bookId, 'reader.html', m.reader.sha256, m.reader.bytes, 30_000_000), sha256: m.reader.sha256, editionId: m.editionId }; }
  catch { throw new EditionUnavailable(); }
}
export async function readEditionAsset(bookId: string, assetPath: string, expectedSha?: string): Promise<{ bytes: Buffer; sha256: string; mime: string } | null> {
  if (!getBook(bookId) || !safeAssetPath(assetPath)) return null;
  const m = await manifestFor(bookId); if (!m) return null;
  const a = m.assets.find(asset => asset.path === assetPath); if (!a) return null;
  if (expectedSha !== undefined && expectedSha !== a.sha256) throw new EditionMismatch();
  try { return { bytes: await verifiedFile(bookId, `assets/${a.path}`, a.sha256, a.bytes, 30_000_000), sha256: a.sha256, mime: a.mime }; }
  catch { throw new EditionUnavailable(); }
}
export async function readEditionDownload(bookId: string, expectedEditionId?: string): Promise<{ bytes: Buffer; sha256: string; filename: string } | null> {
  const m = await manifestFor(bookId); if (!m) return null;
  if (expectedEditionId !== undefined && expectedEditionId !== m.editionId) throw new EditionMismatch();
  try { return { bytes: await verifiedFile(bookId, 'original.zip', m.source.archiveSha256, m.source.archiveBytes, 100_000_000),
    sha256: m.source.archiveSha256, filename: `${bookId}-gutenberg-${m.source.ebookId}-original.zip` }; }
  catch { throw new EditionUnavailable(); }
}
export function editionHeaders(mime: string, sha256?: string): Headers {
  const headers = new Headers({ 'Content-Type': mime, 'Cache-Control': 'public, max-age=0, must-revalidate',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox allow-same-origin; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' });
  if (sha256) headers.set('ETag', `"${sha256}"`);
  return headers;
}
