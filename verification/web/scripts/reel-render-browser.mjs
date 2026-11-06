import assert from 'node:assert/strict';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [editFile, sourceFile, destination, ...extra] = process.argv.slice(2);
assert(editFile && sourceFile && destination && !extra.length);
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
const resident = file => {
  const info = lstatSync(file);
  assert(info.isFile() && info.blocks && info.size, file);
  return file;
};
const require = createRequire(resident('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json'));
const executablePath = resident('/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const edit = JSON.parse(readFileSync(resident(editFile)));
const sourceBytes = readFileSync(resident(sourceFile));
const origin = 'https://soe-reel-render.test';
const external = [], errors = [];
const browser = await require('playwright').chromium.launch({
  executablePath, headless: true, timeout: 12000,
  env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: '/Users/christaylor' },
  args: ['--disable-background-networking', '--disable-component-update', '--no-first-run',
    '--disable-accelerated-video-decode', '--host-resolver-rules=MAP * ~NOTFOUND'],
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || route.request().method() !== 'GET') { external.push(url.origin + url.pathname); await route.abort(); return; }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Offline reel rendering</title>' });
    if (url.pathname === '/samples.json') return route.fulfill({ contentType: 'application/json', body: sourceBytes });
    return route.abort();
  });
  await page.goto(origin);
  const result = await page.evaluate(async edit => {
    const source = await (await fetch('/samples.json', { cache: 'no-store', credentials: 'omit', redirect: 'error' })).json();
    const step = 1_000_000 / edit.fps;
    const { width, height, layout, scenes } = edit;
    const [vx, vy, vw, vh] = layout.videoRect;
    const sourceFps = edit.source.fps ?? edit.fps;
    const audioMatches = edit.source.audioTracks === undefined ? source.audioTracks > 0 : source.audioTracks === edit.source.audioTracks;
    if (source.width * vh !== source.height * vw || source.fps !== sourceFps || !audioMatches) throw Error('Unexpected original footage');
    const count = edit.source.outFrame - edit.source.inFrame;
    const firstPresentationFrame = edit.source.firstPresentationFrame ?? 0;
    const sourceTime = index => {
      const frame = firstPresentationFrame + Math.floor((edit.source.inFrame + index) * sourceFps / edit.fps);
      return Math.round(frame * 1_000_000 / sourceFps);
    };
    const license = new Map([
      ['https://www.pexels.com/terms-of-service/', 'Pexels License'],
      ['https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0'],
    ]).get(edit.source.license);
    if (!license) throw Error('Unknown editorial license');
    const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d', { alpha: false });
    const overlays = scenes.map((scene, index) => {
      const layer = new OffscreenCanvas(width, height), c = layer.getContext('2d', { alpha: false });
      c.fillStyle = layout.background; c.fillRect(0, 0, width, height);
      const rule = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
      const text = (value, x, y, font, color) => {
        c.font = font; c.fillStyle = color;
        if (c.measureText(value).width > width - x - 45 || y > height - 90) throw Error('Text outside safe frame: ' + value);
        c.fillText(value, x, y);
      };
      c.fillStyle = layout.accent;
      c.beginPath();
      for (const [i, point] of [[58,63],[63,75],[75,80],[63,85],[58,97],[53,85],[41,80],[53,75]].entries()) {
        if (!i) c.moveTo(...point); else c.lineTo(...point);
      }
      c.closePath(); c.fill();
      text(edit.series.toUpperCase(), 87, 89, '700 27px system-ui', layout.accent);
      text('FIELD NOTE ' + (edit.fieldNote ?? '01'), 484, 89, '600 23px system-ui', '#d2c6ae');
      rule(40, 120, 640, 2, '#77674a');
      scene.titleLines.forEach((line, i) => text(line, 53, 205 + i * 77, layout.fontTitle, layout.ink));
      text(layout.label, 53, 350, '600 23px system-ui', layout.accent);
      rule(vx - 2, vy - 2, vw + 4, vh + 4, '#8c7952');
      const creditY = layout.creditY ?? 781;
      const [bodyX, bodyY] = layout.bodyAt ?? [53, 909];
      text(edit.source.credit, 53, creditY, '700 30px system-ui', layout.ink);
      text(license + '  ·  ' + layout.modifications, 53, creditY + 39, '500 21px system-ui', '#d9cdb6');
      scene.bodyLines.forEach((line, i) => text(line, bodyX, bodyY + i * 47, layout.fontBody, layout.ink));
      rule(53, 1061, 614, 1, '#77674a');
      text('SOCIETY OF EXPLORERS', 53, 1109, '700 25px system-ui', layout.accent);
      scenes.forEach((_, i) => rule(542 + i * 33, 1096, 24, 5, i === index ? layout.accent : '#445253'));
      return layer;
    });
    const asBytes = value => Uint8Array.from(atob(value), letter => letter.charCodeAt(0));
    const base64 = bytes => {
      let value = '';
      for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(value);
    };
    const png = async canvas => base64(new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()));
    const codec = { codec: 'avc1.42001f', width, height, framerate: edit.fps, bitrate: edit.bitrate,
      latencyMode: 'realtime', avc: { format: 'avc' }, hardwareAcceleration: 'prefer-software' };
    if (!(await VideoEncoder.isConfigSupported(codec)).supported) throw Error('Local H.264 encoder unavailable');
    const samples = [], sourceTimes = [], previews = [];
    let error, avc, color = null;
    const contact = new OffscreenCanvas(6 * 224, 9 * 143), sheet = contact.getContext('2d', { alpha: false });
    sheet.fillStyle = '#101b1c'; sheet.fillRect(0, 0, contact.width, contact.height);
    const encoder = new VideoEncoder({
      output(chunk, metadata) {
        if (metadata?.decoderConfig?.description) avc = base64(new Uint8Array(metadata.decoderConfig.description));
        const bytes = new Uint8Array(chunk.byteLength); chunk.copyTo(bytes);
        samples.push({ pts: chunk.timestamp, duration: chunk.duration, key: chunk.type === 'key', bytes: base64(bytes) });
      }, error(reason) { error = reason; },
    });
    encoder.configure(codec);
    const decoder = new VideoDecoder({
      output(frame) {
        try {
          const n = sourceTimes.length;
          if (n >= count || error || frame.timestamp < sourceTime(0)) return;
          const expected = sourceTime(n);
          if (sourceFps > edit.fps && frame.timestamp < expected) return;
          if (frame.timestamp !== expected) throw Error('Decoded source frame changed at index ' + n);
          sourceTimes.push(frame.timestamp);
          color ??= frame.colorSpace.toJSON();
          const scene = scenes.findIndex(cue => n >= cue.start && n < cue.end);
          if (scene < 0) throw Error('Uncovered title interval');
          ctx.drawImage(overlays[scene], 0, 0);
          ctx.drawImage(frame, vx, vy, vw, vh);
          if (n % 12 === 0) {
            const i = n / 12, x = (i % 6) * 224, y = Math.floor(i / 6) * 143;
            const sampleWidth = 121.5 * vw / vh;
            sheet.drawImage(frame, x + (216 - sampleWidth) / 2, y, sampleWidth, 121.5);
            sheet.fillStyle = layout.ink; sheet.font = '13px monospace';
            sheet.fillText((frame.timestamp / 1_000_000).toFixed(2) + ' s source', x, y + 138);
          }
          if (n === scenes[scene].start || n === count - 1) {
            const copy = new OffscreenCanvas(width, height);
            copy.getContext('2d').drawImage(canvas, 0, 0);
            previews.push(png(copy));
          }
          const composed = new VideoFrame(canvas, { timestamp: n * step, duration: step });
          try { encoder.encode(composed, { keyFrame: n % edit.fps === 0 || n === scenes[scene].start }); }
          finally { composed.close(); }
        } catch (reason) { error = reason; }
        finally { frame.close(); }
      }, error(reason) { error = reason; },
    });
    const description = asBytes(source.avc);
    const profile = Array.from(description.subarray(1, 4), value => value.toString(16).padStart(2, '0')).join('');
    decoder.configure({ codec: 'avc1.' + profile, description, hardwareAcceleration: 'prefer-software' });
    try {
      for (const sample of source.samples) {
        while (!error && (decoder.decodeQueueSize > 12 || encoder.encodeQueueSize > 24)) {
          await new Promise(resolve => setTimeout(resolve, 3));
        }
        if (error) throw error;
        decoder.decode(new EncodedVideoChunk({ type: sample.key ? 'key' : 'delta', timestamp: sample.pts,
          duration: sample.duration, data: asBytes(sample.bytes) }));
      }
      await decoder.flush();
      await encoder.flush();
      if (error) throw error;
      if (!avc || sourceTimes.length !== count || samples.length !== count ||
          samples.some((frame, i) => frame.pts !== i * step || frame.duration !== step)) {
        throw Error('Encoded video does not match the editorial timeline');
      }
      return { video: { width, height, fps: edit.fps, durationMs: count * step / 1000, audioTracks: 0, avc, samples },
        contact: await png(contact), previews: await Promise.all(previews),
        timing: { sourceTimes, sourceDurationMs: source.durationMs, sourceColor: color, sourceAudioTracks: source.audioTracks,
          encoder: codec.codec, sourceCodec: 'avc1.' + profile } };
    } finally {
      if (decoder.state !== 'closed') decoder.close();
      if (encoder.state !== 'closed') encoder.close();
    }
  }, edit);
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  const write = (name, bytes) => writeFileSync(resolve(destination, name), bytes, { flag: 'wx' });
  write('encoded-samples.json', JSON.stringify(result.video));
  write('decoded-source-contact.png', Buffer.from(result.contact, 'base64'));
  result.previews.forEach((frame, i) => write(`render-preview-${i + 1}.png`, Buffer.from(frame, 'base64')));
  write('render-timing.json', JSON.stringify({ ...result.timing, chromium: browser.version(), external, errors }, null, 2) + '\n');
} finally { await browser.close(); }
