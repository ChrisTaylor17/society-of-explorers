'use strict';

/* eslint-disable @typescript-eslint/no-require-imports -- The Expo CommonJS plugin loads this synchronously. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { captionTranscript, mimeMatches, reviewInspection, reviewSource } = require('../../lib/clips/review-policy.cjs');

const root = fs.realpathSync(path.resolve(__dirname, '../..'));
const selections = new Map([
  ['how-a-circle-works', 'soe_circle_intro'],
  ['night-sky-traffic', 'soe_night_sky'],
  ['telescope-first-tilt', 'soe_elt_tilt'],
  ['which-height', 'soe_which_height'],
  ['new-species', 'soe_new_species'],
]);

function resident(file, maximum) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || !stat.blocks || stat.size < 1 || stat.size > maximum || fs.realpathSync(file) !== file) {
    throw Error('Invalid SoE clip input ' + path.basename(file));
  }
  const bytes = fs.readFileSync(file);
  if (bytes.length !== stat.size) throw Error('SoE clip input changed');
  return bytes;
}

function pinned(filename, bytes, sha256, maximum) {
  if (typeof filename !== 'string' || !/^[a-z0-9-]+\.(?:mp4|m4v|vtt|json|html)$/.test(filename)) throw Error('Invalid SoE clip filename');
  const data = resident(path.join(root, 'content/clips', filename), maximum);
  if (data.length !== bytes || createHash('sha256').update(data).digest('hex') !== sha256) throw Error('SoE clip bytes changed');
  return data;
}

function packageClipAssets(destination) {
  const registry = JSON.parse(resident(path.join(root, 'lib/clips/registry.json'), 65536));
  const catalog = JSON.parse(resident(path.join(root, 'platforms/native/clip-catalog.json'), 65536));
  if (!Array.isArray(registry) || registry.length > 12 || catalog.version !== 1 || !Array.isArray(catalog.videos)
      || catalog.videos.length !== selections.size) throw Error('Invalid SoE clip catalog');
  const assets = Array.from(selections, ([id, resource]) => {
    const clips = catalog.videos.filter(item => item?.id === id), entries = registry.filter(item => item?.id === id);
    const clip = clips[0], entry = entries[0];
    const context = { territory: null, requireNonExpiring: true };
    const reviewed = reviewSource(entry, context);
    if (clips.length !== 1 || entries.length !== 1 || !reviewed || entry.kind !== 'video' || entry.asset.mime !== 'video/mp4'
        || clip.resource !== resource || clip.mediaFile !== entry.asset.path || clip.mediaBytes !== entry.asset.bytes
        || clip.mediaSHA256 !== entry.asset.sha256 || clip.captionsFile !== entry.captions.path
        || clip.captionsBytes !== entry.captions.bytes || clip.captionsSHA256 !== entry.captions.sha256
        || clip.credit !== entry.credit || clip.title !== entry.title || clip.description !== entry.description
        || clip.durationMs !== entry.asset.durationMs || clip.width !== entry.asset.width || clip.height !== entry.asset.height) {
      throw Error('SoE clip review does not match the phone catalog');
    }
    if (!reviewed.archiveSource) pinned(entry.source.path, entry.source.bytes, entry.source.sha256, 64 * 1024 * 1024);
    const inspection = JSON.parse(pinned(entry.inspection.path, entry.inspection.bytes, entry.inspection.sha256, 65536));
    const inspected = reviewInspection(entry, inspection, context);
    if (!inspected || inspection.audioTracks !== 0 || (reviewed.firstParty ? clip.sourcePage !== null || clip.attribution !== null
        : clip.sourcePage !== entry.source.pageUrl || !inspected.attribution || clip.attribution?.licenseUrl !== inspected.attribution.licenseUrl
          || clip.attribution?.edits !== inspected.attribution.edits || clip.attribution?.referenceUrl !== inspected.attribution.referenceUrl
          || clip.attribution?.captionPresentation !== 'embedded-text')) {
      throw Error('SoE clip attribution is incomplete');
    }
    const captions = pinned(clip.captionsFile, clip.captionsBytes, clip.captionsSHA256, 65536);
    const transcript = captionTranscript(captions, reviewed.durationMs);
    if (!transcript || transcript !== clip.transcript) throw Error('SoE clip transcript changed');
    const bytes = pinned(clip.mediaFile, clip.mediaBytes, clip.mediaSHA256, 4_000_000);
    if (!mimeMatches(bytes, entry.asset.mime) || !reviewInspection(entry, inspection, context)) throw Error('SoE clip review is unavailable');
    return { name: resource + '.mp4', bytes };
  });
  const target = path.resolve(destination);
  fs.mkdirSync(target, { recursive: true });
  if (fs.realpathSync(target) !== target) throw Error('Invalid SoE clip resource directory');
  for (const item of fs.readdirSync(target, { withFileTypes: true })) {
    if (!item.isFile() || !assets.some(asset => asset.name === item.name)) throw Error('Unexpected SoE clip resource');
  }
  const staging = fs.mkdtempSync(path.join(target, '.clips-'));
  try {
    for (const asset of assets) fs.writeFileSync(path.join(staging, asset.name), asset.bytes, { flag: 'wx' });
    for (const asset of assets) fs.renameSync(path.join(staging, asset.name), path.join(target, asset.name));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (require.main === module) {
  if (process.argv.length !== 3) throw Error('Pass the generated SoE clip resource directory');
  packageClipAssets(process.argv[2]);
}
module.exports = { packageClipAssets };
