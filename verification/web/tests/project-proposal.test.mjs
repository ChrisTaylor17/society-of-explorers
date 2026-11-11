import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineApp } from './support/offline-app.mjs';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const component = 'components/projects/ProjectProposalForm.tsx';
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

// Actual TSX handlers with the existing offline module loader and a bounded
// hook scheduler. Transport/timers/DOM refs are synthetic; browser checks are separate.
function fixture() {
  const app = offlineApp({ root }), hooks = [], effects = [], cleanups = new Map(), calls = [], timers = new Map();
  let cursor = 0, dirty = true, mounted = true, tree, timerId = 0, updatesAfterUnmount = 0, focused = null;
  let transport = async () => Response.json({ success: true });
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  app.setMock('react', () => ({
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [hooks[i], v => { if (!mounted) { updatesAfterUnmount++; return; } hooks[i] = typeof v === 'function' ? v(hooks[i]) : v; dirty = true; }]; },
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useId() { cursor++; return 'synthetic-proposal'; },
    useEffect(fn, deps) { const i = cursor++; if (!same(hooks[i], deps)) { hooks[i] = deps; effects.push(() => {
      cleanups.get(i)?.(); const cleanup = fn(); if (cleanup) cleanups.set(i, cleanup); else cleanups.delete(i);
    }); } },
  }));
  app.setMock('react/jsx-runtime', () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }));
  app.setMock('@/components/PublicNav', () => ({ default: () => null }));
  app.setMock('@/components/PublicFooter', () => ({ default: () => null }));
  const timer = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; };
  app.context.window = { setTimeout: timer, clearTimeout: id => timers.delete(id) };
  app.context.navigator = { userAgent: 'synthetic' };
  app.context.document = { querySelectorAll: () => [] };
  app.context.IntersectionObserver = class { observe() {} disconnect() {} };
  app.context.fetch = async (url, options = {}) => {
    if (url === '/api/projects' && !options.method) return Response.json({ projects: [] });
    assert.equal(url, '/api/projects/submit'); assert.equal(options.method, 'POST');
    calls.push({ url, options }); return transport(url, options);
  };
  const Form = app.load(fs.existsSync(path.join(root, component)) ? component : 'app/projects/page.tsx').default;
  const walk = (node, result = []) => { if (Array.isArray(node)) node.forEach(n => walk(n, result)); else if (node && typeof node === 'object') { result.push(node); walk(node.props?.children, result); } return result; };
  const nodes = () => walk(tree);
  function render() { cursor = 0; dirty = false; tree = Form(); for (const n of nodes()) if (n.props?.ref && typeof n.props.ref === 'object') n.props.ref.current = { focus: () => { focused = text(n); } }; while (effects.length) effects.shift()(); }
  async function flush() { for (let i = 0; i < 8; i++) { if (mounted && dirty) render(); await new Promise(resolve => setImmediate(resolve)); } }
  const field = key => nodes().find(n => n.props?.name === key || n.props?.placeholder === ({ title: 'Project title', short_description: 'One-line description', description: 'Full description', name: 'Your name', email: 'Your email' }[key]));
  async function fill(key, value) { assert.ok(field(key), key); field(key).props.onChange({ target: { value } }); await flush(); }
  const submit = () => { const form = nodes().find(n => n.type === 'form'); assert.ok(form); return form.props.onSubmit({ preventDefault() {} }); };
  const click = label => { const node = nodes().find(n => n.type === 'button' && text(n).toLowerCase() === label.toLowerCase()); assert.ok(node, label); return node.props.onClick(); };
  const seed = async () => { await flush(); for (const [key, value] of Object.entries({ title: 'Synthetic salon idea', description: 'A synthetic reading project.', name: 'Synthetic Visitor', email: 'visitor@example.invalid' })) await fill(key, value); };
  return { nodes, field, fill, submit, click, seed, flush, calls, text: () => text(tree), focused: () => focused,
    setTransport: fn => { transport = fn; }, fireTimers: () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } },
    timers, unmount() { mounted = false; for (const cleanup of cleanups.values()) cleanup(); }, updatesAfterUnmount: () => updatesAfterUnmount };
}

test('HTTP errors and missing receipts never acknowledge a saved proposal; entered text survives', async () => {
  for (const reply of [() => Response.json({ error: 'validation' }, { status: 400 }), () => Response.json({ error: 'insert' }, { status: 500 }),
    () => Response.json({ success: true }, { status: 503 }), () => Response.json({}), () => Response.json({ success: false }),
    () => Response.json({ success: 'true' }), () => new Response('not-json'), () => new Response(null, { status: 204 })]) {
    const f = fixture(); await f.seed(); f.setTransport(reply); await f.submit(); await f.flush();
    assert.doesNotMatch(f.text(), /submission received/i); assert.ok(f.nodes().some(n => n.props?.role === 'alert'));
    assert.equal(f.field('title').props.value, 'Synthetic salon idea'); assert.equal(f.field('description').props.value, 'A synthetic reading project.'); assert.equal(f.calls.length, 1);
  }
});

test('only an explicit successful receipt shows confirmation and receives focus', async () => {
  const f = fixture(); await f.seed(); await f.submit(); await f.flush();
  assert.match(f.text(), /submission received/i); assert.match(f.focused() || '', /submission received/i);
  assert.equal(f.calls.length, 1); assert.equal(f.nodes().some(n => n.type === 'form'), false);
});

test('network failure preserves text and explains that saving is unconfirmed', async () => {
  const f = fixture(); await f.seed(); f.setTransport(async () => { throw Error('SYNTHETIC_PRIVATE_FAILURE'); }); await f.submit(); await f.flush();
  assert.match(f.text(), /may have been saved/i); assert.doesNotMatch(f.text(), /SYNTHETIC_PRIVATE_FAILURE/);
  assert.equal(f.field('email').props.value, 'visitor@example.invalid'); assert.equal(f.calls.length, 1);
});

test('two immediate submissions create one request and lock the submitted snapshot', async () => {
  const f = fixture(), gate = deferred(); await f.seed(); f.setTransport(() => gate.promise);
  const first = f.submit(), second = f.submit(); await f.flush(); assert.equal(f.calls.length, 1);
  assert.ok(f.nodes().some(n => n.type === 'fieldset' && n.props.disabled));
  assert.equal(JSON.parse(f.calls[0].options.body).title, 'Synthetic salon idea'); gate.resolve(Response.json({ success: true })); await Promise.all([first, second]); await f.flush();
  assert.match(f.text(), /submission received/i);
});

test('stop waiting keeps text; a late success cannot replace the uncertain result', async () => {
  const f = fixture(), gate = deferred(); await f.seed(); f.setTransport(() => gate.promise);
  const pending = f.submit(); await f.flush(); f.click('Stop waiting'); await f.flush();
  assert.equal(f.calls[0].options.signal.aborted, true); assert.match(f.text(), /may have been saved/i);
  gate.resolve(Response.json({ success: true })); await pending; await f.flush();
  assert.doesNotMatch(f.text(), /submission received/i); assert.equal(f.field('title').props.value, 'Synthetic salon idea');
});

test('timeout retires a request without automatic retry or late acknowledgement', async () => {
  const f = fixture(), gate = deferred(); await f.seed(); f.setTransport(() => gate.promise);
  const pending = f.submit(); await f.flush(); f.fireTimers(); await f.flush();
  assert.match(f.text(), /may have been saved/i); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].options.signal.aborted, true); gate.resolve(Response.json({ success: true })); await pending; await f.flush();
  assert.doesNotMatch(f.text(), /submission received/i); assert.equal(f.timers.size, 0);
});

test('a late first request cannot overwrite a deliberate second attempt', async () => {
  const f = fixture(), old = deferred(), current = deferred(); await f.seed(); f.setTransport(() => old.promise);
  const one = f.submit(); await f.flush(); f.click('Stop waiting'); await f.flush();
  await f.fill('title', 'Revised synthetic idea'); f.setTransport(() => current.promise); const two = f.submit(); await f.flush();
  old.resolve(Response.json({ success: true })); await one; await f.flush(); assert.doesNotMatch(f.text(), /submission received/i);
  assert.ok(f.nodes().some(n => n.type === 'fieldset' && n.props.disabled));
  current.resolve(Response.json({ error: 'bad input' }, { status: 400 })); await two; await f.flush();
  assert.equal(f.field('title').props.value, 'Revised synthetic idea'); assert.match(f.text(), /check/i); assert.equal(f.calls.length, 2);
});

test('unmount aborts transport and ignores delayed body completion', async () => {
  const f = fixture(), body = deferred(); await f.seed(); f.setTransport(async () => ({ ok: true, status: 200, json: () => body.promise }));
  const pending = f.submit(); await f.flush(); f.unmount(); assert.equal(f.calls[0].options.signal.aborted, true);
  body.resolve({ success: true }); await pending; assert.equal(f.updatesAfterUnmount(), 0); assert.equal(f.timers.size, 0);
});

test('validation recovery sends edited input only on a new explicit submit', async () => {
  const f = fixture(); await f.seed(); f.setTransport(async () => Response.json({ error: 'validation' }, { status: 400 })); await f.submit(); await f.flush();
  await f.fill('email', 'corrected@example.invalid'); assert.equal(f.calls.length, 1);
  f.setTransport(async () => Response.json({ success: true })); await f.submit(); await f.flush();
  assert.equal(JSON.parse(f.calls[1].options.body).email, 'corrected@example.invalid'); assert.match(f.text(), /submission received/i);
});

test('every field has a visible associated label and errors have an announcement', async () => {
  const f = fixture(); await f.seed();
  const fields = f.nodes().filter(n => ['input', 'textarea', 'select'].includes(n.type)); assert.equal(fields.length, 7);
  for (const n of fields) assert.ok(n.props.id && f.nodes().some(l => l.type === 'label' && l.props.htmlFor === n.props.id && text(l).trim()));
  assert.ok(f.nodes().some(n => n.props?.role === 'status'));
  f.setTransport(async () => { throw Error('offline'); }); await f.submit(); await f.flush();
  const error = f.nodes().find(n => n.props?.role === 'alert'); assert.ok(error?.props.id);
});

test('blank required text is rejected locally without sending or clearing other fields', async () => {
  const f = fixture(); await f.seed(); await f.fill('title', '   '); await f.submit(); await f.flush();
  assert.equal(f.calls.length, 0); assert.ok(f.nodes().some(n => n.props?.role === 'alert')); assert.equal(f.field('name').props.value, 'Synthetic Visitor');
});
