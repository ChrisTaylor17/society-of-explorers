export const MAX_CLIP_BYTES = 16 * 1024 * 1024;
export const MAX_CAPTION_BYTES = 64 * 1024;
export const MAX_CLIP_DURATION_MS = 120_000;
export const CC_BY_4_URL = 'https://creativecommons.org/licenses/by/4.0/';
export const PEXELS_LICENSE_URL = 'https://www.pexels.com/terms-of-service/';
export const KILAUEA_REPORT_URL = 'https://www.usgs.gov/media/videos/october-17-2026-video-kilauea-summit-lava-fountaining-episode-55';
type ReviewedVideoLicense = typeof CC_BY_4_URL | typeof PEXELS_LICENSE_URL;
export type ClipKind = 'audio' | 'video';
export type PublicMediaClip = {
  id: string; kind: ClipKind; title: string; description: string; credit: string;
  reviewLabel: string; territoryLabel: string; checkedAt: string;
  sourcePage: string | null; durationMs: number;
  media: { href: string; sha256: string; bytes: number; mime: string };
  captions: { href: string; sha256: string; bytes: number; language: string };
  transcript: string;
  attribution?: { licenseUrl: ReviewedVideoLicense; edits: string; captionPresentation: 'embedded-text';
    referenceUrl?: typeof KILAUEA_REPORT_URL };
};
export type TextClip = {
  id: string; title: string; quote: string; credit: string; readerHref: string; discussHref: string;
  licenseNotice: string; licenseUrl: string; sourcePage: string;
};
export type ClipCatalog = { version: 1; texts: TextClip[]; media: PublicMediaClip[] };
export const isClipId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) && value.length <= 80;
export const isSha256 = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
export const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const integer = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= low && value <= high;
export const plain = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
export const clipHref = (kind: 'media' | 'captions', id: string, sha: string): string => `/clips/${kind}/${id}?sha=${sha}`;
const mimes = new Set(['audio/wav', 'audio/mpeg', 'audio/ogg', 'video/webm', 'video/mp4']);

/** Only the bounded local gateway can become a media source, never caller URLs. */
export function parsePublicMediaClip(value: unknown): PublicMediaClip | null {
  if (!record(value) || !isClipId(value.id) || !['audio', 'video'].includes(String(value.kind))
    || !plain(value.title, 160) || !plain(value.description, 600) || !plain(value.credit, 1000)
    || !plain(value.reviewLabel, 160) || !plain(value.territoryLabel, 120) || !plain(value.checkedAt, 40)
    || !Number.isFinite(Date.parse(value.checkedAt)) || !integer(value.durationMs, 1, MAX_CLIP_DURATION_MS)
    || !plain(value.transcript, 20_000) || !record(value.media) || !record(value.captions)
    || !isSha256(value.media.sha256) || !integer(value.media.bytes, 1, MAX_CLIP_BYTES)
    || !mimes.has(String(value.media.mime)) || !String(value.media.mime).startsWith(`${value.kind}/`)
    || value.media.href !== clipHref('media', value.id, value.media.sha256)
    || !isSha256(value.captions.sha256) || !integer(value.captions.bytes, 1, MAX_CAPTION_BYTES)
    || value.captions.href !== clipHref('captions', value.id, value.captions.sha256)
    || typeof value.captions.language !== 'string' || !/^[a-z]{2}(?:-[A-Z]{2})?$/u.test(value.captions.language)
    || value.sourcePage !== null && (typeof value.sourcePage !== 'string' || !/^https:\/\/[^\s?#@]+\/[A-Za-z0-9_./-]*$/u.test(value.sourcePage))) return null;
  let attribution: PublicMediaClip['attribution'];
  if (value.attribution !== undefined) {
    const review = value.attribution;
    if (value.kind !== 'video' || !value.sourcePage || !record(review) || !plain(review.edits, 240)
      || review.captionPresentation !== 'embedded-text'
      || (review.licenseUrl !== CC_BY_4_URL && review.licenseUrl !== PEXELS_LICENSE_URL)
      || review.referenceUrl !== (review.licenseUrl === PEXELS_LICENSE_URL ? KILAUEA_REPORT_URL : undefined)) return null;
    attribution = { licenseUrl: review.licenseUrl, edits: review.edits, captionPresentation: 'embedded-text',
      ...(review.licenseUrl === PEXELS_LICENSE_URL ? { referenceUrl: KILAUEA_REPORT_URL } : {}) };
  }
  return { id: value.id, kind: value.kind as ClipKind, title: value.title, description: value.description, credit: value.credit,
    reviewLabel: value.reviewLabel, territoryLabel: value.territoryLabel, checkedAt: value.checkedAt, sourcePage: value.sourcePage as string | null,
    durationMs: value.durationMs, transcript: value.transcript,
    media: { href: value.media.href, sha256: value.media.sha256, bytes: value.media.bytes, mime: String(value.media.mime) },
    captions: { href: value.captions.href, sha256: value.captions.sha256, bytes: value.captions.bytes, language: value.captions.language },
    ...(attribution ? { attribution } : {}) };
}
