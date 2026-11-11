import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const React = require('react');
const ts = require('typescript');
const root = new URL('../../../', import.meta.url);
const source = ts.transpileModule(fs.readFileSync(new URL('app/waddle/CopyWaddleButton.tsx', root), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const descendants = value => Array.isArray(value) ? value.flatMap(descendants) : React.isValidElement(value) ? [value, ...descendants(value.props.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : React.isValidElement(value) ? text(value.props.children) : value ?? '';

function fixture(writeText, transcription = 'A local test reflection.') {
  const slots = [], timers = [], states = [], writes = [];
  let index = 0, cleanup, effectReady = false;
  const react = {
    ...React,
    useState: initial => { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = next; states.push(next); }]; },
    useRef: initial => { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect: setup => { if (!effectReady) { effectReady = true; cleanup = setup(); } },
  };
  const loaded = { exports: {} };
  const context = { navigator: { clipboard: writeText ? { writeText: value => { writes.push(value); return writeText(value); } } : undefined },
    setTimeout: callback => { const timer = { callback, canceled: false }; timers.push(timer); return timer; },
    clearTimeout: timer => { timer.canceled = true; },
  };
  new vm.Script(`(function(require,module,exports){${source}\n})`).runInNewContext(context)(name => {
    assert.ok(['react', 'react/jsx-runtime'].includes(name), `Unexpected dependency ${name}`);
    return name === 'react' ? react : require(name);
  }, loaded, loaded.exports);
  const render = () => { index = 0; return loaded.exports.default({ transcription }); };
  const nodes = () => descendants(render());
  return { render, nodes, writes, states, timers, unmount: () => cleanup(),
    click: () => nodes().find(node => node.type === 'button').props.onClick(),
    status: () => text(nodes().find(node => node.props.role === 'status')),
    button: () => nodes().find(node => node.type === 'button'),
    expected: loaded.exports.waddleShareText(transcription),
  };
}

test('copy remains pending until the actual clipboard promise fulfills and ignores duplicate clicks', async () => {
  let resolve;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  const pending = f.click();
  assert.equal(text(f.button()), 'Copying…');
  assert.equal(f.button().props.disabled, true);
  assert.equal(f.states.includes('copied'), false);
  await f.click();
  assert.equal(f.writes.length, 1);
  resolve(); await pending;
  assert.equal(text(f.button()), 'Copied');
  assert.match(f.status(), /Text copied/);
  assert.deepEqual(f.writes, [f.expected]);
});

test('a rejected clipboard promise gives a manual-copy recovery and never says copied', async () => {
  const f = fixture(() => Promise.reject(new Error('NotAllowedError')));
  await f.click();
  assert.equal(f.states.includes('copied'), false);
  assert.match(f.status(), /Automatic copying failed/);
  const field = f.nodes().find(node => node.type === 'textarea');
  assert.equal(field.props.readOnly, true);
  assert.equal(field.props.value, f.expected);
  assert.equal(f.button().props.disabled, false);
});

test('absent and synchronously failing clipboard APIs both expose the same truthful fallback', async () => {
  for (const write of [undefined, () => { throw Error('Unavailable'); }]) {
    const f = fixture(write);
    await f.click();
    assert.match(f.status(), /Select and copy the text below/);
    assert.equal(f.states.includes('copied'), false);
    assert.equal(f.nodes().filter(node => node.type === 'textarea').length, 1);
  }
});

test('retry can succeed after denial and clears the manual-copy field', async () => {
  let attempt = 0;
  const f = fixture(() => ++attempt === 1 ? Promise.reject(Error('Denied')) : Promise.resolve());
  await f.click(); await f.click();
  assert.equal(text(f.button()), 'Copied');
  assert.equal(f.nodes().some(node => node.type === 'textarea'), false);
  f.timers.at(-1).callback();
  assert.equal(text(f.button()), 'Copy text');
});

test('retired components do not display late clipboard success and clear their reset timer', async () => {
  let resolve;
  const pendingFixture = fixture(() => new Promise(done => { resolve = done; }));
  const pending = pendingFixture.click(); pendingFixture.unmount(); resolve(); await pending;
  assert.equal(pendingFixture.states.includes('copied'), false);
  const completedFixture = fixture(() => Promise.resolve());
  await completedFixture.click(); completedFixture.unmount();
  assert.equal(completedFixture.timers[0].canceled, true);
});

test('share copy preserves the reflection without an invented venue or broken public Waddle link', async () => {
  const reflection = 'A question with <angle brackets> and “quotes”.';
  const f = fixture(() => Promise.resolve(), reflection);
  await f.click();
  assert.ok(f.writes[0].startsWith(`"${reflection}"`));
  assert.ok(f.writes[0].endsWith('https://www.societyofexplorers.com'));
  assert.doesNotMatch(f.writes[0], /temple|\/waddle/);
  const page = fs.readFileSync(new URL('app/waddle/page.tsx', root), 'utf8');
  assert.match(page, /<CopyWaddleButton key=\{transcription\} transcription=\{transcription\} \/>/);
  assert.doesNotMatch(page, /setCopied\(true\)|execCommand\('copy'\)/);
});
