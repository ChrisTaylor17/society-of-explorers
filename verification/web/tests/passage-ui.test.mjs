import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { passageFixture, mountPassage, reviewPassage, deferred, IDS } from './support/passage-ui.mjs';

test('explicit source → access → comment → preview → confirmation posts the full canonical message through actual HTTP and SQL', async () => {
  const f = await passageFixture(), a = await mountPassage(f);
  try {
    const before = (await f.system.db.query('SELECT count(*)::int n FROM seminar_messages WHERE cohort_id=$1', [IDS.circle])).rows[0].n;
    assert.equal(a.requests.length, 0); assert.equal(document.querySelectorAll('#passage-book option').length, 8);
    await reviewPassage(a); assert.equal(a.requests.filter(r => r.options.method === 'POST').length, 1, 'preview is the only POST before confirmation');
    assert.equal(a.button('Post reviewed message').disabled, true); assert.equal(document.activeElement.textContent, '4. Review the complete message');
    await a.confirm(); const post = a.button('Post reviewed message'); await a.act(async () => { post.click(); post.click(); }); await a.settle();
    const writes = a.requests.filter(r => r.url === `/api/circles/${IDS.circle}/passages` && r.options.method === 'POST'); assert.equal(writes.length, 1);
    const sent = JSON.parse(writes[0].options.body); const saved = (await f.system.db.query('SELECT content FROM seminar_messages WHERE cohort_id=$1', [IDS.circle])).rows;
    assert.equal(saved.length, before + 1); assert.equal(saved.filter(row => row.content === f.books.formatPassageMessage(sent.comment, f.source)).length, 1); assert.match(a.text(), /Posting confirmed/);
    assert.equal(domStorageCount(a), 0); assert.equal(new URL(a.dom.window.location.href).searchParams.has('comment'), false);
    const publicRead = a.requests.find(r => r.url.startsWith('/api/great-books/passage?')); assert.equal(publicRead.options.credentials, 'omit'); assert.equal(publicRead.options.redirect, 'error'); assert.equal(publicRead.options.cache, 'no-store');
  } finally { await a.cleanup(); await f.system.close(); }
});
const domStorageCount = a => a.dom.window.localStorage.length + a.dom.window.sessionStorage.length;

test('changing comment, Circle or reference clears the reviewed message and its checkbox', async () => {
  for (const field of ['passage-comment', 'passage-circle', 'passage-block']) {
    const f = await passageFixture(), a = await mountPassage(f);
    try {
      await reviewPassage(a); await a.confirm(); await a.edit(field, field === 'passage-comment' ? 'Changed human thought.' : field === 'passage-circle' ? IDS.otherCircle : '32');
      assert.equal(a.button('Post reviewed message'), undefined); assert.equal(document.querySelector('input[type="checkbox"]'), null);
      assert.equal(a.requests.filter(r => r.url === `/api/circles/${IDS.circle}/passages` && r.options.method === 'POST').length, 0);
    } finally { await a.cleanup(); await f.system.close(); }
  }
});

test('a lost committed reply has only exact manual retry and receipt lookup; focus never resends', async () => {
  const f = await passageFixture(); let lost = false;
  const a = await mountPassage(f, { respond: async (url, options, dispatch) => {
    const response = await dispatch(url, options);
    if (!lost && url === `/api/circles/${IDS.circle}/passages` && options.method === 'POST') { lost = true; throw Error('Synthetic reply loss after commit'); }
    return response;
  } });
  try {
    const before = (await f.system.db.query('SELECT count(*)::int n FROM seminar_messages WHERE cohort_id=$1', [IDS.circle])).rows[0].n;
    await reviewPassage(a); await a.confirm(); await a.click('Post reviewed message'); assert.match(a.text(), /posting reply was lost/i);
    const first = a.requests.find(r => r.url === `/api/circles/${IDS.circle}/passages` && r.options.method === 'POST');
    const count = a.requests.length; await a.event('focus'); assert.equal(a.requests.length, count);
    assert.equal(document.getElementById('passage-book').disabled, true); assert.equal(document.getElementById('passage-comment').value, '');
    await a.click('Retry exact reviewed post'); const writes = a.requests.filter(r => r.url === `/api/circles/${IDS.circle}/passages` && r.options.method === 'POST');
    assert.equal(writes.length, 2); assert.equal(writes[1].options.body, first.options.body); assert.match(a.text(), /Posting confirmed/);
    assert.equal((await f.system.db.query('SELECT count(*)::int n FROM seminar_messages WHERE cohort_id=$1', [IDS.circle])).rows[0].n, before + 1);
  } finally { await a.cleanup(); await f.system.close(); }
});

test('receipt lookup is read-only and a withdrawn receipt never resurrects the preview or quotation', async () => {
  const f = await passageFixture(); let saved;
  const a = await mountPassage(f, { respond: async (url, options, dispatch) => {
    const response = await dispatch(url, options);
    if (url === `/api/circles/${IDS.circle}/passages` && options.method === 'POST') { saved = await response.json(); throw Error('Lost committed response'); }
    if (url.includes('/passages?requestId=')) { const value = await response.json(); return Response.json({ ...value, receipt: { ...value.receipt, message: { ...value.receipt.message, content: null, visibility: 'withdrawn' } } }); }
    return response;
  } });
  try {
    await reviewPassage(a, 'PRIVATE_COMMENT_TO_CLEAR'); await a.confirm(); await a.click('Post reviewed message'); assert.ok(saved);
    await a.click('Check posting receipt'); assert.match(a.text(), /currently withdrawn/); assert.doesNotMatch(a.text(), /PRIVATE_COMMENT_TO_CLEAR/); assert.equal(a.button('Retry exact reviewed post'), undefined);
    assert.equal(a.requests.filter(r => r.url === `/api/circles/${IDS.circle}/passages` && r.options.method === 'POST').length, 1);
  } finally { await a.cleanup(); await f.system.close(); }
});

test('activity, identity and unmount fence private drafts, pending keys and late posting replies', async () => {
  for (const retire of [a => a.event('blur'), a => a.auth('SIGNED_OUT'), a => a.event('storage'), async a => { Object.defineProperty(a.dom.window.document, 'visibilityState', { configurable: true, value: 'hidden' }); await a.event('visibilitychange', a.dom.window.document); }]) {
    const f = await passageFixture(), delayed = deferred(); let posting;
    const a = await mountPassage(f, { respond: (url, options, dispatch) => {
      if (url === `/api/circles/${IDS.circle}/passages` && options.method === 'POST') { posting = { url, options }; return delayed.promise; }
      return dispatch(url, options);
    } });
    try {
      await reviewPassage(a, 'PRIVATE_RETIREMENT_DRAFT'); await a.confirm(); await a.click('Post reviewed message', false); assert.ok(posting); await retire(a);
      assert.equal(posting.options.signal.aborted, true); assert.equal(a.button('Retry exact reviewed post'), undefined); assert.equal(document.getElementById('passage-comment'), null); assert.doesNotMatch(a.text(), /PRIVATE_RETIREMENT_DRAFT/);
      await a.act(async () => delayed.resolve(await f.dispatch(posting.url, posting.options))); await a.settle(); assert.doesNotMatch(a.text(), /Posting confirmed|PRIVATE_RETIREMENT_DRAFT/);
      const count = a.requests.length; await a.event('focus'); assert.equal(a.requests.length, count);
    } finally { delayed.resolve(Response.json({})); await a.cleanup(); await f.system.close(); }
  }
});

test('source controls remain usable without auth, duplicate hints never imply a verified reference', async () => {
  const f = await passageFixture(), a = await mountPassage(f, { authThrows: true, props: { search: f.search + '&block=30' } });
  try {
    assert.equal(a.requests.length, 0); assert.match(a.text(), /invalid|cleared/); assert.equal(a.button('Verify source').disabled, false);
    await a.click('Verify source'); assert.match(a.text(), /Source verified/); assert.equal(a.button('Check current Circle access').disabled, true);
    assert.equal(a.requests.every(r => r.url.startsWith('/api/great-books/passage?')), true);
  } finally { await a.cleanup(); await f.system.close(); }
});

test('message source verification compares the complete footer, rejects forged text and stays within visibility gate', async () => {
  for (const forged of [false, true]) {
    const f = await passageFixture(); const content = f.books.formatPassageMessage('Human comment.', f.source).replace(forged ? f.source.quote : 'NEVER_MATCH', 'FORGED_SOURCE_TEXT');
    const message = { id: '55555555-5555-4555-8555-555555555555', member_name: 'Explorer', content, created_at: '2026-11-03T12:00:00Z', is_mine: true };
    const a = await mountPassage(f, { view: 'message', props: { message } });
    try {
      assert.equal(a.requests.length, 0); await a.click('Verify message source');
      assert.match(a.text(), forged ? /does not match this edition/ : /Source footer verified/);
      await a.render({ active: false }); assert.equal(document.querySelector('aside[aria-label="Passage source"]'), null); assert.doesNotMatch(a.text(), /Human comment|FORGED_SOURCE_TEXT|Source footer verified/);
      await a.render({ active: true, message: { ...message, content: null } }); assert.equal(document.querySelector('aside[aria-label="Passage source"]'), null);
      await a.render({ message: { ...message, content: 'https://example.invalid\n/great-books/hamlet?edition=javascript:alert(1)&passageBlock=0' } }); assert.equal(document.querySelector('aside[aria-label="Passage source"]'), null);
    } finally { await a.cleanup(); await f.system.close(); }
  }
});

test('selection proof compares the actual selected words; nontext has an honest source-link alternative', async () => {
  for (const mode of ['valid', 'tampered', 'math']) {
    const f = await passageFixture(), a = await mountPassage(f, { view: 'tools', props: { capture: () => mode === 'math' ? { ok: false, reference: { ...f.reference, start: null, end: null }, reason: 'Equation: use a source link.' } : { ok: true, reference: f.reference, selectedText: mode === 'tampered' ? 'Altered iframe words' : f.source.quote } } });
    try {
      assert.equal(a.requests.length, 0); await a.click('Capture selected passage'); await a.act(async () => new Promise(resolve => setTimeout(resolve, 40)));
      assert.equal(Boolean([...document.querySelectorAll('a')].find(el => el.textContent === 'Verify selected passage and write a comment')), mode === 'valid');
      assert.ok([...document.querySelectorAll('a')].find(el => el.textContent === 'Use current block as a source link'));
      if (mode === 'tampered') assert.match(a.text(), /do not match this edition/); if (mode === 'math') assert.match(a.text(), /Equation/);
      assert.equal(a.requests.some(r => r.url.includes('/api/circles')), false);
    } finally { await a.cleanup(); await f.system.close(); }
  }
});

test('reader source intent verifies before a manual jump and mixed planning contexts refuse all jumps', async () => {
  for (const mixed of [false, true]) {
    const f = await passageFixture(), a = await mountPassage(f, { view: 'context', props: { search: new URL(f.source.readerHref, 'https://offline.invalid').search + (mixed ? `&from=1&to=2&circle=${IDS.circle}` : '') } });
    try {
      assert.equal(a.requests.length, 0); assert.deepEqual(a.jumped, []);
      if (mixed) { assert.equal(a.button('Verify and open referenced block'), undefined); assert.match(a.text(), /mixes a passage/); }
      else { await a.click('Verify and open referenced block'); await a.act(async () => new Promise(resolve => setTimeout(resolve, 40))); assert.deepEqual(a.jumped, [30]); assert.match(a.text(), /Verified reference/); }
    } finally { await a.cleanup(); await f.system.close(); }
  }
});

test('new controls have labels, no HTML injection and 44px focusable narrow-screen styles', () => {
  const css = fs.readFileSync('../../app/circles/passages/passage.module.css', 'utf8'); assert.match(css, /min-height: 44px/); assert.match(css, /:focus-visible/); assert.match(css, /max-width: 380px/);
  for (const file of ['../../app/circles/passages/PassageComposer.tsx', '../../app/great-books/PassageContext.tsx', '../../app/great-books/PassageTools.tsx']) { const source = fs.readFileSync(file, 'utf8'); assert.doesNotMatch(source, /dangerouslySetInnerHTML|localStorage|sessionStorage|location\.(?:assign|replace)|router\.(?:push|replace)/); }
});

test('every public verification timeout permits a manual retry and fences a late body that ignores abort', async () => {
  for (const view of ['composer', 'message', 'tools', 'context']) {
    const f = await passageFixture(), delayed = deferred(); let first = true;
    const a = await mountPassage(f, { view, respond: (url, options, dispatch) => {
      if (first && url.startsWith('/api/great-books/passage?')) { first = false; return delayed.promise; }
      return dispatch(url, options);
    } });
    const name = view === 'composer' ? 'Verify source' : view === 'message' ? 'Verify message source' : view === 'tools' ? 'Capture selected passage' : 'Verify and open referenced block';
    try {
      await a.click(name, false); const firstRequest = a.requests[0]; await a.act(async () => a.deadlines.find(timer => !timer.cleared).fn());
      assert.equal(firstRequest.options.signal.aborted, true); assert.equal(a.button(name).disabled, false);
      await a.click(name); assert.equal(a.requests.length, 2);
      const text = a.text(); await a.act(async () => delayed.resolve(Response.json({ ...f.source, quote: 'WRONG_LATE_QUOTE' }))); await a.settle();
      assert.equal(a.text(), text); if (view === 'context') assert.deepEqual(a.jumped, [30]);
    } finally { delayed.resolve(Response.json({})); await a.cleanup(); await f.system.close(); }
  }
});

test('a delayed source verification cannot restore a source panel after the message becomes withdrawn', async () => {
  const f = await passageFixture(), delayed = deferred();
  const message = { id: '55555555-5555-4555-8555-555555555555', member_name: 'Explorer', content: f.books.formatPassageMessage('PRIVATE_VISIBLE_COMMENT', f.source), created_at: '2026-11-03T12:00:00Z', is_mine: true };
  const a = await mountPassage(f, { view: 'message', props: { message }, respond: () => delayed.promise });
  try {
    await a.click('Verify message source', false); await a.render({ message: { ...message, content: null } }); assert.equal(a.requests[0].options.signal.aborted, true);
    await a.act(async () => delayed.resolve(Response.json(f.source))); await a.settle();
    assert.equal(document.querySelector('aside[aria-label="Passage source"]'), null); assert.doesNotMatch(a.text(), /PRIVATE_VISIBLE_COMMENT|Verified edition reference|passageBlock/);
  } finally { delayed.resolve(Response.json({})); await a.cleanup(); await f.system.close(); }
});

test('account-free sign-in return preserves only validated public source coordinates and an optional valid Circle', async () => {
  const f = await passageFixture(); f.system.setActor(null);
  const a = await mountPassage(f);
  try {
    await a.click('Verify source');
    const readReturn = () => {
      const link = [...document.querySelectorAll('a')].find(element => element.textContent === 'Sign in or create an account'); assert.ok(link);
      const login = new URL(link.href); assert.equal(login.pathname, '/login'); assert.deepEqual([...login.searchParams.keys()], ['next']);
      const next = new URL(login.searchParams.get('next'), 'https://offline.invalid'); assert.equal(next.pathname, '/circles/passages'); return next.searchParams;
    };
    const publicHint = readReturn(); assert.deepEqual([...publicHint.keys()].sort(), ['book', 'edition', 'block', 'start', 'end', 'circle'].sort());
    assert.equal(publicHint.get('circle'), IDS.circle); assert.equal(publicHint.get('book'), f.reference.bookId); assert.equal(publicHint.get('edition'), f.reference.editionId);
    assert.equal(publicHint.get('block'), String(f.reference.blockIndex)); assert.equal(publicHint.get('start'), String(f.reference.start)); assert.equal(publicHint.get('end'), String(f.reference.end));
    await a.edit('passage-circle', 'javascript:INVALID_PRIVATE_HINT'); const withoutCircle = readReturn(); assert.equal(withoutCircle.has('circle'), false); assert.equal(withoutCircle.get('edition'), f.reference.editionId);
    assert.equal(a.requests.every(request => request.url.startsWith('/api/great-books/passage?')), true, 'reading the return link performs no private read or mutation');
    f.system.setActor(IDS.reader); await a.edit('passage-circle', IDS.circle); await a.click('Check current Circle access'); await a.edit('passage-comment', 'PRIVATE_COMMENT_NEVER_IN_RETURN'); await a.click('Prepare server preview'); await a.confirm();
    const reviewedReturn = readReturn(); assert.deepEqual([...reviewedReturn.keys()].sort(), [...publicHint.keys()].sort());
    assert.doesNotMatch(reviewedReturn.toString(), /PRIVATE_COMMENT|comment|requestId|reviewKey|contentHash/);
  } finally { await a.cleanup(); await f.system.close(); }
});

test('a refused retry cannot discard a previously committed lost-reply key; its receipt recovers the single saved post', async () => {
  const f = await passageFixture(); let attempts = 0;
  const a = await mountPassage(f, { respond: async (url, options, dispatch) => {
    if (url === `/api/circles/${IDS.circle}/passages` && options.method === 'POST') {
      attempts++;
      if (attempts === 2) return Response.json({ error: 'Synthetic current-attempt rate limit.', outcome: 'not_attempted' }, { status: 429 });
      const response = await dispatch(url, options); assert.equal(response.status, 200);
      throw Error('Lost response after the first attempt committed');
    }
    return dispatch(url, options);
  } });
  try {
    await reviewPassage(a, 'Recover this same reviewed message after a refused retry.'); await a.confirm(); await a.click('Post reviewed message');
    const first = a.requests.find(request => request.url === `/api/circles/${IDS.circle}/passages` && request.options.method === 'POST'); assert.ok(first);
    await a.click('Retry exact reviewed post'); assert.match(a.text(), /current attempt was refused/); assert.match(a.text(), /earlier attempt may still have been saved/);
    assert.doesNotMatch(a.text(), /write a new review/); assert.ok(a.button('Check posting receipt')); assert.ok(a.button('Retry exact reviewed post'));
    assert.equal(document.getElementById('passage-book').disabled, true); assert.equal(a.button('Prepare server preview'), undefined);
    const writes = a.requests.filter(request => request.url === `/api/circles/${IDS.circle}/passages` && request.options.method === 'POST'); assert.equal(writes.length, 2); assert.equal(writes[1].options.body, first.options.body);
    assert.equal((await f.system.db.query('SELECT count(*)::int n FROM circle_passage_post_receipts')).rows[0].n, 1);
    await a.click('Check posting receipt'); assert.match(a.text(), /Posting confirmed/); assert.equal(a.button('Retry exact reviewed post'), undefined);
    assert.equal(a.requests.filter(request => request.url === `/api/circles/${IDS.circle}/passages` && request.options.method === 'POST').length, 2);
    assert.equal((await f.system.db.query('SELECT count(*)::int n FROM circle_passage_post_receipts')).rows[0].n, 1);
  } finally { await a.cleanup(); await f.system.close(); }
});
