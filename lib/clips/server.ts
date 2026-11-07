import 'server-only';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { byteRange } from '@/lib/http/byteRange';
import registry from './registry.json';
import { captionTranscript, mimeMatches, reviewInspection, reviewSource } from './review-policy.cjs';
import { clipHref, isClipId, isSha256, parsePublicMediaClip, record, type PublicMediaClip } from './contracts';

export { captionTranscript };
type FilePin = { path: string; sha256: string; bytes: number };
type Context = { territory: string | null; now?: number };
type VerifiedClip = { public: PublicMediaClip; bytes: Buffer; captions: Buffer };
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
/** No caller paths, remote reads or ambient credentials. The root is injected
 * only by local tests; deployed callers always use versioned content/clips. */
async function verifiedFile(root: string, file: FilePin): Promise<Buffer> {
  const resolved = path.resolve(root), actualRoot = await realpath(resolved);
  if (resolved !== actualRoot) throw Error('Clip storage unavailable');
  const target = await realpath(path.resolve(actualRoot, file.path));
  if (!target.startsWith(actualRoot + path.sep)) throw Error('Clip storage unavailable');
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== file.bytes) throw Error('Clip bytes unavailable');
    const bytes = Buffer.alloc(file.bytes + 1);
    const read = await handle.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== file.bytes || (await handle.stat()).size !== file.bytes) throw Error('Clip bytes changed');
    const bounded = bytes.subarray(0, file.bytes);
    if (sha(bounded) !== file.sha256) throw Error('Clip bytes changed');
    return bounded;
  } finally { await handle.close(); }
}
const decode = (bytes: Buffer): string => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
/** The web gateway and phone packaging use the same source and rights policy.
 * Infrastructure supplies territory; members cannot widen it through a request. */
export async function verifyClip(value: unknown, context: Context, root = path.resolve(process.cwd(), 'content/clips')): Promise<VerifiedClip | null> {
  try {
    if (!record(value) || !record(value.source) || !record(value.asset) || !record(value.captions) || !record(value.review)) return null;
    const reviewed = reviewSource(value, context);
    if (!reviewed) return null;
    const { source, asset, captions, inspection, firstParty, durationMs } = reviewed;
    if (!reviewed.archiveSource) await verifiedFile(root, source);
    const facts: unknown = JSON.parse(decode(await verifiedFile(root, inspection)));
    const inspected = reviewInspection(value, facts, context);
    if (!inspected) return null;
    const mediaBytes = await verifiedFile(root, asset), captionBytes = await verifiedFile(root, captions);
    if (!mimeMatches(mediaBytes, String(value.asset.mime))) return null;
    const transcript = captionTranscript(captionBytes, durationMs);
    // Time-limited reviews can expire while files are being read and hashed.
    if (!transcript || !reviewInspection(value, facts, context)) return null;
    const dto = parsePublicMediaClip({ id: value.id, kind: value.kind, title: value.title, description: value.description, credit: value.credit,
      reviewLabel: firstParty ? 'Original SoE content; local automated checks' : 'Source and derivative rights documentation checked',
      territoryLabel: reviewed.territories.includes('WORLDWIDE') ? 'Reviewed scope: worldwide' : `Reviewed scope: ${context.territory}`,
      checkedAt: value.review.checkedAt, sourcePage: firstParty ? null : value.source.pageUrl, durationMs,
      media: { href: clipHref('media', String(value.id), asset.sha256), sha256: asset.sha256, bytes: asset.bytes, mime: value.asset.mime },
      captions: { href: clipHref('captions', String(value.id), captions.sha256), sha256: captions.sha256, bytes: captions.bytes, language: value.captions.language },
      transcript, ...(inspected.attribution ? { attribution: inspected.attribution } : {}) });
    return dto ? { public: dto, bytes: mediaBytes, captions: captionBytes } : null;
  } catch { return null; }
}
export async function approvedMedia(entries: unknown = registry, context: Context = { territory: null }, root?: string): Promise<PublicMediaClip[]> {
  if (!Array.isArray(entries) || entries.length > 12) return [];
  const ids = new Set<string>(), output: PublicMediaClip[] = [];
  for (const entry of entries) {
    if (record(entry) && entries.filter(other => record(other) && other.id === entry.id).length !== 1) continue;
    const clip = await verifyClip(entry, context, root);
    if (!clip || ids.has(clip.public.id)) continue;
    ids.add(clip.public.id); output.push(clip.public);
  }
  return output;
}
async function verifyRegisteredClip(id: string, entries: unknown, root?: string): Promise<VerifiedClip | null> {
  if (!isClipId(id) || !Array.isArray(entries) || entries.length > 12) return null;
  const selected = entries.filter(entry => record(entry) && entry.id === id);
  return selected.length === 1 ? verifyClip(selected[0], { territory: null }, root) : null;
}
export async function approvedReel(id: string, entries: unknown = registry, root?: string): Promise<PublicMediaClip | null> {
  const clip = await verifyRegisteredClip(id, entries, root);
  return clip?.public.attribution ? clip.public : null;
}
export function clipHeaders(mime: string): Headers {
  return new Headers({ 'Content-Type': mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin' });
}
export async function clipResource(request: Request, id: string, kind: 'media' | 'captions', entries: unknown = registry, root?: string): Promise<Response> {
  const headers = clipHeaders('text/plain; charset=utf-8');
  const fail = (status: number) => new Response(request.method === 'HEAD' ? null : 'The reviewed clip is unavailable.', { status, headers });
  const query = new URL(request.url).searchParams;
  if (!isClipId(id) || Array.from(query.keys()).some(k => k !== 'sha') || query.getAll('sha').length !== 1 || !isSha256(query.get('sha'))) return fail(400);
  const clip = await verifyRegisteredClip(id, entries, root);
  if (!clip) return fail(404);
  const pin = kind === 'media' ? clip.public.media : clip.public.captions, bytes = kind === 'media' ? clip.bytes : clip.captions;
  if (query.get('sha') !== pin.sha256) return fail(409);
  const resultHeaders = clipHeaders(kind === 'media' ? clip.public.media.mime : 'text/vtt; charset=utf-8');
  resultHeaders.set('ETag', `"${pin.sha256}"`); resultHeaders.set('Accept-Ranges', 'bytes');
  const range = byteRange(request.headers.get('range'), bytes.length);
  if (range === 'invalid') { resultHeaders.set('Content-Range', `bytes */${bytes.length}`); return new Response(null, { status: 416, headers: resultHeaders }); }
  const start = range?.[0] ?? 0, end = range?.[1] ?? bytes.length - 1;
  resultHeaders.set('Content-Length', String(end - start + 1));
  if (range) resultHeaders.set('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
  return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes.subarray(start, end + 1)), { status: range ? 206 : 200, headers: resultHeaders });
}
