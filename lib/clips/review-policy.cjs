'use strict';

// Node-only review policy shared by the web gateway and both phone packagers.
// File reads, hashing and public display DTOs remain with their callers.
const SOURCE_LIMIT = 64 * 1024 * 1024;
const CLIP_LIMIT = 16 * 1024 * 1024;
const CAPTION_LIMIT = 64 * 1024;
const DURATION_LIMIT = 120_000;
const PERMISSIONS = ['display', 'excerpt', 'reencode', 'captions', 'commercial'];
const CC_BY_4_URL = 'https://creativecommons.org/licenses/by/4.0/';
const ESO_POLICY = 'https://www.eso.org/public/outreach/copyright/';
const PEXELS_LICENSE_URL = 'https://www.pexels.com/terms-of-service/';
const KILAUEA_REPORT_URL = 'https://www.usgs.gov/media/videos/october-17-2026-video-kilauea-summit-lava-fountaining-episode-55';
const NOAA_REUSE_URL = 'https://oceanexplorer.noaa.gov/faqs/';
const NOAA_TRIAL_URL = 'https://oceanexplorer.noaa.gov/expedition/ex2701/';
const LICENSED_REELS = new Map([
  ['https://www.eso.org/public/videos/eso2607d/', {
    media: 'https://cdn.eso.org/videos/medium_podcast/eso2607d.mp4',
    credit: 'B. Häußler/ESO', policyUrl: ESO_POLICY, licenseUrl: CC_BY_4_URL,
    visualChecks: ['landscape-only'],
  }],
  ['https://www.eso.org/public/videos/potw2643a/', {
    media: 'https://cdn.eso.org/videos/hd_and_apple/potw2643a.m4v',
    credit: 'ESO/Cimolai/Apical/G. Vecchia', policyUrl: ESO_POLICY, licenseUrl: CC_BY_4_URL,
    visualChecks: ['no-identifiable-person-or-eso-logo'],
  }],
  ['https://www.pexels.com/video/kilauea-volcano-eruption-in-hawaii-33378632/', {
    media: 'https://videos.pexels.com/video-files/33378632/14210577_2160_3840_30fps.mp4',
    credit: 'James Lee via Pexels', policyUrl: PEXELS_LICENSE_URL, licenseUrl: PEXELS_LICENSE_URL,
    visualChecks: ['landscape-only', 'archive-footage-labeled', 'original-educational-commentary'],
    referenceUrl: KILAUEA_REPORT_URL,
    archiveSource: { path: 'pexels-33378632-source.mp4',
      sha256: 'a0aee5ab007afc52b6d859c6c9880d9dbf0c49340f7acafb87d9e62f4a6f57f6', bytes: 34828800 },
  }],
  ['https://oceanexplorer.noaa.gov/dive-11-ex2606/', {
    media: 'https://oceanexplorer.noaa.gov/wp-content/uploads/2026/10/ex2606-dive11-isopod_HD.mp4',
    credit: 'NOAA Ocean Exploration, 2026 American Samoa ROV + Mapping Exploration',
    policyUrl: NOAA_REUSE_URL, licenseUrl: NOAA_REUSE_URL, basis: 'public-domain',
    visualChecks: ['no-logo-or-identifiable-person', 'archive-footage-labeled', 'original-educational-commentary'],
    referenceUrl: NOAA_TRIAL_URL,
    archiveSource: { path: 'noaa-ex2606-dive11-isopod-source.mp4',
      sha256: '2dc4150cbafc97acb7dc9520daa69da9387e744b3d6bc80a55f0bbab3750698c', bytes: 28243653 },
  }],
]);
const SOURCES = new Map([
  ...Array.from(LICENSED_REELS, ([page, reel]) => [page, new Set([reel.media])]),
  ['https://librivox.org/apology-by-plato/', new Set([
    'https://www.archive.org/download/apology_plato_bn_librivox/apology_01_plato.mp3',
    'https://www.archive.org/download/apology_plato_bn_librivox/apology_02_plato.mp3'])],
  ['https://svs.gsfc.nasa.gov/13326/', new Set([
    'https://svs.gsfc.nasa.gov/vis/a010000/a013300/a013326/BH_Accretion_Disk_Sim_360_1080.mp4',
    'https://svs.gsfc.nasa.gov/vis/a010000/a013300/a013326/BH_Accretion_Disk_Sim_360_1080.webm'])],
]);
const POLICIES = new Set(['https://librivox.org/pages/public-domain/', 'https://www.gutenberg.org/policy/license.html',
  'https://svs.gsfc.nasa.gov/help/', 'https://www.nasa.gov/nasa-brand-center/images-and-media/']);
const MIMES = new Set(['audio/wav', 'audio/mpeg', 'audio/ogg', 'video/webm', 'video/mp4']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, low, high) => typeof value === 'number' && Number.isSafeInteger(value) && value >= low && value <= high;
const plain = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const timestamp = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) && Number.isFinite(Date.parse(value));
const permissions = value => Array.isArray(value) && PERMISSIONS.every(p => value.includes(p)) && value.every(p => PERMISSIONS.includes(p));
const safePath = value => typeof value === 'string' && value.length <= 240
  && /^[A-Za-z0-9_.\/-]+$/u.test(value) && !value.startsWith('/') && !value.split('/').some(p => !p || p === '.' || p === '..');
function pin(value, maximum) {
  return record(value) && safePath(value.path) && typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/u.test(value.sha256)
    && integer(value.bytes, 1, maximum) ? { path: value.path, sha256: value.sha256, bytes: value.bytes } : null;
}
function territories(value, territory) {
  return Array.isArray(value) && value.length > 0 && value.length <= 20 && new Set(value).size === value.length
    && value.every(p => typeof p === 'string' && /^(?:WORLDWIDE|[A-Z]{2})$/u.test(p))
    && (value.includes('WORLDWIDE') || territory !== null && value.includes(territory));
}

function reviewSource(value, context) {
  if (!record(context) || context.territory !== null && (typeof context.territory !== 'string' || !/^[A-Z]{2}$/u.test(context.territory))) return null;
  const now = context.now ?? Date.now();
  if (!Number.isFinite(now) || !record(value) || value.version !== 1 || value.status !== 'catalog-approved' || value.publishable !== true
    || typeof value.id !== 'string' || value.id.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value.id)
    || !['audio', 'video'].includes(value.kind) || !plain(value.title, 160) || !plain(value.description, 600) || !plain(value.credit, 1000)
    || !record(value.source) || !record(value.asset) || !record(value.captions) || !record(value.review)) return null;
  const source = pin(value.source, SOURCE_LIMIT), asset = pin(value.asset, CLIP_LIMIT);
  const captions = pin(value.captions, CAPTION_LIMIT), inspection = pin(value.inspection, CAPTION_LIMIT);
  if (!source || !asset || !captions || !inspection || new Set([source.path, asset.path, captions.path, inspection.path]).size !== 4
    || !integer(value.asset.durationMs, 1, DURATION_LIMIT) || !MIMES.has(value.asset.mime) || !value.asset.mime.startsWith(value.kind + '/')
    || !timestamp(value.review.checkedAt) || Date.parse(value.review.checkedAt) > now + 300_000
    || !territories(value.review.territories, context.territory) || !permissions(value.review.permissions)
    || !integer(value.review.sourceStartMs, 0, 86_400_000) || !integer(value.review.sourceEndMs, 1, 86_400_000)
    || value.review.sourceEndMs - value.review.sourceStartMs !== value.asset.durationMs
    || typeof value.captions.language !== 'string' || !/^[a-z]{2}(?:-[A-Z]{2})?$/u.test(value.captions.language)) return null;
  const firstParty = value.source.kind === 'first-party';
  if (firstParty ? value.review.mode !== 'automated-first-party' : value.source.kind !== 'third-party' || value.review.mode !== 'documentary-rights'
    || typeof value.source.pageUrl !== 'string' || typeof value.source.mediaUrl !== 'string' || !SOURCES.get(value.source.pageUrl)?.has(value.source.mediaUrl)) return null;
  const reel = firstParty ? undefined : LICENSED_REELS.get(value.source.pageUrl);
  const archived = reel?.archiveSource;
  if (archived && (source.path !== archived.path || source.sha256 !== archived.sha256 || source.bytes !== archived.bytes)) return null;
  return { source, asset, captions, inspection, firstParty, durationMs: value.asset.durationMs,
    territories: [...value.review.territories], ...(archived ? { archiveSource: { ...archived } } : {}) };
}

function reviewInspection(value, facts, context) {
  const reviewed = reviewSource(value, context);
  if (!reviewed || !record(facts) || facts.version !== 1 || facts.assetSha256 !== reviewed.asset.sha256
    || facts.sourceSha256 !== reviewed.source.sha256 || facts.captionsSha256 !== reviewed.captions.sha256
    || facts.durationMs !== reviewed.durationMs || !integer(facts.audioTracks, 0, 1) || !integer(facts.videoTracks, 0, 1)
    || !Array.isArray(facts.checks) || !['tracks-inspected', 'captions-checked'].every(p => facts.checks.includes(p))
    || value.kind === 'audio' && (facts.audioTracks !== 1 || facts.videoTracks !== 0)
    || value.kind === 'video' && (facts.videoTracks !== 1 || facts.width !== value.asset.width || facts.height !== value.asset.height
      || !integer(facts.width, 1, 4096) || !integer(facts.height, 1, 4096) || !facts.checks.includes('frames-reviewed'))) return null;
  if (reviewed.firstParty) {
    return facts.externalAssets === false && facts.checks.includes('source-created-locally') && reviewed.source.bytes <= 1_000_000
      && value.review.sourceStartMs === 0 && value.review.sourceEndMs === reviewed.durationMs ? {} : null;
  }
  const rights = facts.rights, now = context.now ?? Date.now();
  if (!record(rights) || rights.decision !== 'approved' || rights.sourcePage !== value.source.pageUrl || rights.sourceMedia !== value.source.mediaUrl
    || rights.credit !== value.credit || !timestamp(rights.checkedAt) || rights.checkedAt !== value.review.checkedAt
    || rights.validUntil !== null && (!timestamp(rights.validUntil) || Date.parse(rights.validUntil) <= now)
    || context.requireNonExpiring === true && rights.validUntil !== null
    || !Array.isArray(rights.components) || facts.sourceStartMs !== value.review.sourceStartMs || facts.sourceEndMs !== value.review.sourceEndMs
    || !integer(facts.sourceDurationMs, value.review.sourceEndMs, 86_400_000)) return null;
  const reel = LICENSED_REELS.get(value.source.pageUrl);
  const required = value.kind === 'audio' ? ['text', 'performance'] : facts.audioTracks === 0 ? ['visuals'] : ['visuals', 'soundtrack', 'performance'];
  for (const kind of required) {
    const component = rights.components.find(c => record(c) && c.kind === kind);
    if (!record(component) || !['public-domain', 'licensed'].includes(component.basis)
      || (reel ? component.policyUrl !== reel.policyUrl || component.basis !== (reel.basis ?? 'licensed') : !POLICIES.has(component.policyUrl))
      || !permissions(component.permissions) || !territories(component.territories, context.territory)) return null;
  }
  if (value.source.pageUrl === 'https://svs.gsfc.nasa.gov/13326/' && (facts.audioTracks !== 0 || !facts.checks.includes('all-audio-removed'))) return null;
  if (!reel) return {};
  if (value.kind !== 'video' || facts.audioTracks !== 0 || value.credit !== reel.credit || reviewed.asset.bytes > 4_000_000
    || !['all-audio-removed', 'visible-source-credit', 'embedded-text', ...reel.visualChecks].every(check => facts.checks.includes(check))
    || rights.licenseUrl !== reel.licenseUrl || rights.referenceUrl !== reel.referenceUrl || !plain(rights.edits, 240)) return null;
  return { attribution: { licenseUrl: reel.licenseUrl, edits: rights.edits, captionPresentation: 'embedded-text',
    ...(reel.referenceUrl ? { referenceUrl: reel.referenceUrl } : {}) } };
}

function time(value) {
  const match = /^(\d{2}):([0-5]\d):([0-5]\d)\.(\d{3})$/u.exec(value);
  return match ? ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]) : NaN;
}
function captionTranscript(bytes, duration) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/gu, '\n');
    if (!text.startsWith('WEBVTT\n\n') || text.length > CAPTION_LIMIT) return null;
    const blocks = text.slice(8).trim().split(/\n{2,}/u), transcript = [];
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
function mimeMatches(bytes, mime) {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === 'audio/wav') return data.length >= 44 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE';
  if (mime === 'audio/mpeg') return data.length >= 4 && (data.toString('ascii', 0, 3) === 'ID3' || data[0] === 255 && (data[1] & 224) === 224);
  if (mime === 'audio/ogg') return data.toString('ascii', 0, 4) === 'OggS';
  if (mime === 'video/webm') return data.length >= 16 && data.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  if (mime === 'video/mp4') return data.length >= 16 && data.toString('ascii', 4, 8) === 'ftyp';
  return false;
}

module.exports = { reviewSource, reviewInspection, captionTranscript, mimeMatches };
