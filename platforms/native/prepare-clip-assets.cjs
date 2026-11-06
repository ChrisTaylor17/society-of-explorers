'use strict';

/* eslint-disable @typescript-eslint/no-require-imports -- The Expo CommonJS plugin loads this synchronously. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

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
  if (typeof filename !== 'string' || !/^[a-z0-9-]+\.(?:mp4|vtt|json)$/.test(filename)) throw Error('Invalid SoE clip filename');
  const data = resident(path.join(root, 'content/clips', filename), maximum);
  if (data.length !== bytes || createHash('sha256').update(data).digest('hex') !== sha256) throw Error('SoE clip bytes changed');
  return data;
}

function packageClipAssets(destination) {
  const registry = JSON.parse(resident(path.join(root, 'lib/clips/registry.json'), 65536));
  const catalog = JSON.parse(resident(path.join(root, 'platforms/native/clip-catalog.json'), 65536));
  if (catalog.version !== 1 || !Array.isArray(catalog.videos) || catalog.videos.length !== selections.size) throw Error('Invalid SoE clip catalog');
  const assets = Array.from(selections, ([id, resource]) => {
    const clip = catalog.videos.find(item => item.id === id);
    const entry = registry.find(item => item.id === id);
    if (!clip || !entry || entry.status !== 'catalog-approved' || entry.publishable !== true || entry.asset.mime !== 'video/mp4'
        || !entry.review.territories.includes('WORLDWIDE') || !['display', 'commercial', 'captions'].every(value => entry.review.permissions.includes(value))
        || clip.resource !== resource || clip.mediaFile !== entry.asset.path || clip.mediaBytes !== entry.asset.bytes
        || clip.mediaSHA256 !== entry.asset.sha256 || clip.captionsFile !== entry.captions.path
        || clip.captionsBytes !== entry.captions.bytes || clip.captionsSHA256 !== entry.captions.sha256
        || clip.credit !== entry.credit || clip.title !== entry.title || clip.description !== entry.description
        || clip.durationMs !== entry.asset.durationMs || clip.width !== entry.asset.width || clip.height !== entry.asset.height) {
      throw Error('SoE clip review does not match the phone catalog');
    }
    const inspection = JSON.parse(pinned(entry.inspection.path, entry.inspection.bytes, entry.inspection.sha256, 65536));
    const rights = inspection.rights;
    if (inspection.audioTracks !== 0 || (entry.source.kind === 'first-party' ? clip.sourcePage !== null || clip.attribution !== null
        : !rights || clip.sourcePage !== entry.source.pageUrl || clip.attribution?.licenseUrl !== rights.licenseUrl
          || clip.attribution?.edits !== rights.edits || clip.attribution?.referenceUrl !== rights.referenceUrl
          || clip.attribution?.captionPresentation !== 'embedded-text')) {
      throw Error('SoE clip attribution is incomplete');
    }
    const captions = pinned(clip.captionsFile, clip.captionsBytes, clip.captionsSHA256, 65536).toString('utf8');
    const transcript = captions.replace(/\r\n/g, '\n').slice(8).trim().split(/\n{2,}/)
      .map(cue => {
        const lines = cue.split('\n');
        return lines.slice(lines[0].includes('-->') ? 1 : 2).join('\n');
      }).join('\n\n');
    if (transcript !== clip.transcript) throw Error('SoE clip transcript changed');
    return { name: resource + '.mp4', bytes: pinned(clip.mediaFile, clip.mediaBytes, clip.mediaSHA256, 4_000_000) };
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
