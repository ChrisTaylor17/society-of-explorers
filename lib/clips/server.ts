import 'server-only';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import registry from './registry.json';
import { CC_BY_4_URL, KILAUEA_REPORT_URL, PEXELS_LICENSE_URL, clipHref, integer, isClipId, isSha256, MAX_CAPTION_BYTES, MAX_CLIP_BYTES, MAX_CLIP_DURATION_MS,
  parsePublicMediaClip, plain, record, type PublicMediaClip } from './contracts';

const SOURCE_LIMIT = 64 * 1024 * 1024;
const PERMISSIONS = ['display', 'excerpt', 'reencode', 'captions', 'commercial'];
const ESO_POLICY = 'https://www.eso.org/public/outreach/copyright/';
const LICENSED_REELS = new Map<string, {
  media: string; credit: string; policyUrl: string;
  licenseUrl: typeof CC_BY_4_URL | typeof PEXELS_LICENSE_URL;
  visualChecks: string[]; referenceUrl?: typeof KILAUEA_REPORT_URL; archiveSource?: FilePin;
}>([
  ['https://www.eso.org/public/videos/eso2607d/', {
    media: 'https://cdn.eso.org/videos/medium_podcast/eso2607d.mp4',
    credit: 'B. Häußler/ESO',
    policyUrl: ESO_POLICY,
    licenseUrl: CC_BY_4_URL,
    visualChecks: ['landscape-only'],
  }],
  ['https://www.eso.org/public/videos/potw2643a/', {
    media: 'https://cdn.eso.org/videos/hd_and_apple/potw2643a.m4v',
    credit: 'ESO/Cimolai/Apical/G. Vecchia',
    policyUrl: ESO_POLICY,
    licenseUrl: CC_BY_4_URL,
    visualChecks: ['no-identifiable-person-or-eso-logo'],
  }],
  ['https://www.pexels.com/video/kilauea-volcano-eruption-in-hawaii-33378632/', {
    media: 'https://videos.pexels.com/video-files/33378632/14210577_2160_3840_30fps.mp4',
    credit: 'James Lee via Pexels',
    policyUrl: PEXELS_LICENSE_URL,
    licenseUrl: PEXELS_LICENSE_URL,
    visualChecks: ['landscape-only', 'archive-footage-labeled', 'original-educational-commentary'],
    referenceUrl: KILAUEA_REPORT_URL,
    archiveSource: {
      path: 'pexels-33378632-source.mp4',
      sha256: 'a0aee5ab007afc52b6d859c6c9880d9dbf0c49340f7acafb87d9e62f4a6f57f6',
      bytes: 34828800,
    },
  }],
]);
const SOURCES = new Map([
  ...Array.from(LICENSED_REELS, ([page, reel]): [string, Set<string>] => [page, new Set([reel.media])]),
  ['https://librivox.org/apology-by-plato/', new Set([
    'https://www.archive.org/download/apology_plato_bn_librivox/apology_01_plato.mp3',
    'https://www.archive.org/download/apology_plato_bn_librivox/apology_02_plato.mp3'])],
  ['https://svs.gsfc.nasa.gov/13326/', new Set([
    'https://svs.gsfc.nasa.gov/vis/a010000/a013300/a013326/BH_Accretion_Disk_Sim_360_1080.mp4',
    'https://svs.gsfc.nasa.gov/vis/a010000/a013300/a013326/BH_Accretion_Disk_Sim_360_1080.webm'])],
]);
const POLICIES = new Set(['https://librivox.org/pages/public-domain/', 'https://www.gutenberg.org/policy/license.html',
  'https://svs.gsfc.nasa.gov/help/', 'https://www.nasa.gov/nasa-brand-center/images-and-media/']);
type FilePin = { path: string; sha256: string; bytes: number };
type Context = { territory: string | null; now?: number };
type VerifiedClip = { public: PublicMediaClip; bytes: Buffer; captions: Buffer };
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const safePath = (value: unknown): value is string => typeof value === 'string' && value.length <= 240
  && /^[A-Za-z0-9_.\/-]+$/u.test(value) && !value.startsWith('/') && !value.split('/').some(p => !p || p === '.' || p === '..');
function pin(value: unknown, maximum: number): FilePin | null {
  return record(value) && safePath(value.path) && isSha256(value.sha256) && integer(value.bytes, 1, maximum)
    ? { path: value.path, sha256: value.sha256, bytes: value.bytes } : null;
}

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
const timestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) && Number.isFinite(Date.parse(value));
const permissions = (value: unknown): boolean => Array.isArray(value) && PERMISSIONS.every(p => value.includes(p)) && value.every(p => PERMISSIONS.includes(p));
function territories(value: unknown, territory: string | null): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 20 && new Set(value).size === value.length
    && value.every(p => typeof p === 'string' && /^(?:WORLDWIDE|[A-Z]{2})$/u.test(p))
    && (value.includes('WORLDWIDE') || territory !== null && value.includes(territory));
}
function time(value: string): number {
  const match = /^(\d{2}):([0-5]\d):([0-5]\d)\.(\d{3})$/u.exec(value);
  return match ? ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]) : NaN;
}
export function captionTranscript(bytes: Uint8Array, duration: number): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/gu, '\n');
    if (!text.startsWith('WEBVTT\n\n') || text.length > MAX_CAPTION_BYTES) return null;
    const blocks = text.slice(8).trim().split(/\n{2,}/u), transcript: string[] = [];
    let previous = 0;
    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length > 1 && !lines[0].includes('-->') && /^[A-Za-z0-9_-]{1,40}$/u.test(lines[0])) lines.shift();
      const match = /^(\S+) --> (\S+)$/u.exec(lines.shift() ?? '');
      if (!match) return null;
      const start = time(match[1]), end = time(match[2]), words = lines.join('\n');
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < previous || start > previous + 250
        || end <= start || end > duration + 250 || !plain(words, 4000) || /[<>]/u.test(words)) return null;
      previous = end; transcript.push(words);
    }
    const result = transcript.join('\n\n');
    return previous >= duration - 250 && plain(result, 20_000) ? result : null;
  } catch { return null; }
}
function mimeMatches(bytes: Buffer, mime: string): boolean {
  if (mime === 'audio/wav') return bytes.length >= 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
  if (mime === 'audio/mpeg') return bytes.length >= 4 && (bytes.toString('ascii', 0, 3) === 'ID3' || bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (mime === 'audio/ogg') return bytes.toString('ascii', 0, 4) === 'OggS';
  if (mime === 'video/webm') return bytes.length >= 16 && bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  if (mime === 'video/mp4') return bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp';
  return false;
}

/** Approval is a bound set of artifacts and review facts, never publishable:true.
 * The trusted territory must come from server infrastructure, not a query/header
 * supplied by a member. Unknown territory permits WORLDWIDE reviews only. */
export async function verifyClip(value: unknown, context: Context, root = path.resolve(process.cwd(), 'content/clips')): Promise<VerifiedClip | null> {
  try {
    if (!record(value) || value.version !== 1 || value.status !== 'catalog-approved' || value.publishable !== true || !isClipId(value.id) || !['audio', 'video'].includes(String(value.kind))
      || !plain(value.title, 160) || !plain(value.description, 600) || !plain(value.credit, 1000)
      || !record(value.source) || !record(value.asset) || !record(value.captions) || !record(value.review)) return null;
    const source = pin(value.source, SOURCE_LIMIT), asset = pin(value.asset, MAX_CLIP_BYTES), captions = pin(value.captions, MAX_CAPTION_BYTES), inspection = pin(value.inspection, MAX_CAPTION_BYTES);
    if (!source || !asset || !captions || !inspection || new Set([source.path, asset.path, captions.path, inspection.path]).size !== 4
      || !integer(value.asset.durationMs, 1, MAX_CLIP_DURATION_MS) || !timestamp(value.review.checkedAt)
      || Date.parse(value.review.checkedAt) > (context.now ?? Date.now()) + 300_000
      || !territories(value.review.territories, context.territory) || !permissions(value.review.permissions)
      || !integer(value.review.sourceStartMs, 0, 86_400_000) || !integer(value.review.sourceEndMs, 1, 86_400_000)
      || value.review.sourceEndMs - value.review.sourceStartMs !== value.asset.durationMs
      || typeof value.captions.language !== 'string' || !/^[a-z]{2}(?:-[A-Z]{2})?$/u.test(value.captions.language)) return null;
    const firstParty = value.source.kind === 'first-party';
    if (firstParty ? value.review.mode !== 'automated-first-party' : value.source.kind !== 'third-party' || value.review.mode !== 'documentary-rights'
      || typeof value.source.pageUrl !== 'string' || typeof value.source.mediaUrl !== 'string' || !SOURCES.get(value.source.pageUrl)?.has(value.source.mediaUrl)) return null;
    const reel = firstParty ? undefined : LICENSED_REELS.get(String(value.source.pageUrl));
    const archived = reel?.archiveSource;
    if (archived) {
      if (source.path !== archived.path || source.sha256 !== archived.sha256 || source.bytes !== archived.bytes) return null;
    } else await verifiedFile(root, source);
    const inspectionBytes = await verifiedFile(root, inspection);
    const facts: unknown = JSON.parse(decode(inspectionBytes));
    if (!record(facts) || facts.version !== 1 || facts.assetSha256 !== asset.sha256 || facts.sourceSha256 !== source.sha256
      || facts.captionsSha256 !== captions.sha256 || facts.durationMs !== value.asset.durationMs
      || !integer(facts.audioTracks, 0, 1) || !integer(facts.videoTracks, 0, 1)
      || !Array.isArray(facts.checks)) return null;
    const checks = facts.checks;
    if (!['tracks-inspected', 'captions-checked'].every(p => checks.includes(p))
      || value.kind === 'audio' && (facts.audioTracks !== 1 || facts.videoTracks !== 0)
      || value.kind === 'video' && (facts.videoTracks !== 1 || facts.width !== value.asset.width || facts.height !== value.asset.height
        || !integer(facts.width, 1, 4096) || !integer(facts.height, 1, 4096) || !checks.includes('frames-reviewed'))) return null;
    let attribution: PublicMediaClip['attribution'];
    if (firstParty) {
      if (facts.externalAssets !== false || !checks.includes('source-created-locally') || source.bytes > 1_000_000
        || value.review.sourceStartMs !== 0 || value.review.sourceEndMs !== value.asset.durationMs) return null;
    } else {
      if (!record(facts.rights) || facts.rights.decision !== 'approved' || facts.rights.sourcePage !== value.source.pageUrl
        || facts.rights.sourceMedia !== value.source.mediaUrl || facts.rights.credit !== value.credit
        || !timestamp(facts.rights.checkedAt) || facts.rights.checkedAt !== value.review.checkedAt
        || facts.rights.validUntil !== null && (!timestamp(facts.rights.validUntil) || Date.parse(facts.rights.validUntil) <= (context.now ?? Date.now()))
        || !Array.isArray(facts.rights.components) || facts.sourceStartMs !== value.review.sourceStartMs
        || facts.sourceEndMs !== value.review.sourceEndMs || !integer(facts.sourceDurationMs, value.review.sourceEndMs, 86_400_000)) return null;
      const required = value.kind === 'audio' ? ['text', 'performance'] : facts.audioTracks === 0 ? ['visuals'] : ['visuals', 'soundtrack', 'performance'];
      for (const kind of required) {
        const component = facts.rights.components.find(c => record(c) && c.kind === kind);
        if (!record(component) || !['public-domain', 'licensed'].includes(String(component.basis))
          || (reel ? component.policyUrl !== reel.policyUrl || component.basis !== 'licensed' : !POLICIES.has(String(component.policyUrl)))
          || !permissions(component.permissions) || !territories(component.territories, context.territory)) return null;
      }
      if (value.source.pageUrl === 'https://svs.gsfc.nasa.gov/13326/' && (facts.audioTracks !== 0 || !checks.includes('all-audio-removed'))) return null;
      if (reel) {
        if (value.kind !== 'video' || facts.audioTracks !== 0 || value.credit !== reel.credit || asset.bytes > 4_000_000
          || !['all-audio-removed', 'visible-source-credit', 'embedded-text', ...reel.visualChecks].every(check => checks.includes(check))
          || facts.rights.licenseUrl !== reel.licenseUrl || facts.rights.referenceUrl !== reel.referenceUrl
          || !plain(facts.rights.edits, 240)) return null;
        attribution = { licenseUrl: reel.licenseUrl, edits: facts.rights.edits, captionPresentation: 'embedded-text',
          ...(reel.referenceUrl ? { referenceUrl: reel.referenceUrl } : {}) };
      }
    }
    const mediaBytes = await verifiedFile(root, asset), captionBytes = await verifiedFile(root, captions);
    if (!mimeMatches(mediaBytes, String(value.asset.mime))) return null;
    const transcript = captionTranscript(captionBytes, value.asset.durationMs);
    if (!transcript) return null;
    const dto = parsePublicMediaClip({ id: value.id, kind: value.kind, title: value.title, description: value.description, credit: value.credit,
      reviewLabel: firstParty ? 'Original SoE content; local automated checks' : 'Source and derivative rights documentation checked',
      territoryLabel: value.review.territories.includes('WORLDWIDE') ? 'Reviewed scope: worldwide' : `Reviewed scope: ${context.territory}`,
      checkedAt: value.review.checkedAt, sourcePage: firstParty ? null : value.source.pageUrl, durationMs: value.asset.durationMs,
      media: { href: clipHref('media', value.id, asset.sha256), sha256: asset.sha256, bytes: asset.bytes, mime: value.asset.mime },
      captions: { href: clipHref('captions', value.id, captions.sha256), sha256: captions.sha256, bytes: captions.bytes, language: value.captions.language },
      transcript, ...(attribution ? { attribution } : {}) });
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
export function byteRange(value: string | null, length: number): [number, number] | null | 'invalid' {
  if (value === null) return null;
  const match = /^bytes=(0|[1-9]\d*)?-(0|[1-9]\d*)?$/u.exec(value);
  if (!match || !match[1] && !match[2]) return 'invalid';
  const first = match[1] === undefined ? Math.max(0, length - Number(match[2])) : Number(match[1]);
  const last = match[1] === undefined || match[2] === undefined ? length - 1 : Math.min(Number(match[2]), length - 1);
  return !Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first >= length || first > last || match[1] === undefined && Number(match[2]) === 0 ? 'invalid' : [first, last];
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
