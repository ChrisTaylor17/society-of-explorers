import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync } from 'node:fs';
const file = new URL('./load-source.mjs', import.meta.url), info = lstatSync(file);
assert.ok(info.isFile() && !info.isSymbolicLink() && info.blocks);
const { sourceLoader } = await import('./load-source.mjs');
const load = sourceLoader(), { createCircleDirectory } = load('platforms/shared/circle-directory.ts');
const { defaultDiscoveryPageRequest } = load('lib/circles/discovery-page.ts');
const { parseCircleAttendanceMutation, circleAttendanceMutationBody } = load('lib/circles/membership.ts');
const ORIGIN = 'https://attendance.invalid', CIRCLE = '11111111-1111-4111-8111-111111111111';
const MEMBER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', DAY = '2030-01-01';
const clone = x => JSON.parse(JSON.stringify(x)), tick = () => new Promise(r => setTimeout(r, 0));
const deferred = () => { let resolve; return { promise: new Promise(r => { resolve = r; }), resolve }; };
function detail({ revision = 5, member = true, status = null, hidden = false, ended = false, date = DAY } = {}) {
  return { ready: true, circle: { id: CIRCLE, title: 'Synthetic attendance Circle', description: null, format: 'in_person', format_label: 'In person', city: 'Synthetic City', region: null,
    venue_name: 'Public library', venue_label: 'Library', meeting_label: 'Tuesday', weekday: 2, time: '19:00', timezone: 'America/New_York', start_date: DAY, first_meeting: DAY,
    next_meeting: hidden || ended ? null : date, week: 1, reading: null, reading_program: null, program_length: 12, member_count: member ? 1 : 0, max_members: 8,
    spots_left: ended ? 0 : member ? 7 : 8, status: ended ? 'completed' : 'forming', host_name: 'Synthetic host', going_next: null, hidden }, revision,
    viewer: { signed_in: true, is_member: member, is_host: false }, ended,
    capabilities: { canJoin: !member && !hidden && !ended, canLeave: member, canRsvp: member && !hidden && !ended, canComplete: false, canReadConversation: member && !hidden },
    meetings: hidden || ended ? [] : [{ date, going: status === 'going' && member ? 1 : 0, my_status: member ? status : null }], online_url: null };
}
/** Independent in-memory request-key/CAS oracle; actual HTTP/SQL composition is
 * verified separately. Every new accepted RSVP key consumes one revision. */
function fixture({ memberId = MEMBER, attendance = true, keys = true, timeoutMs = 100 } = {}) {
  let current = detail(), scope = 'verified-owner', before = null, after = null, bodyHook = null, bearerHook = null, keyHook = null, allocated = 0;
  const calls = [], owners = new Set(), receipts = new Map();
  const owner = { scope: () => scope, subscribe(fn) { owners.add(fn); return () => owners.delete(fn); }, async bearer() { return bearerHook ? bearerHook() : 'NONISSUED_ATTENDANCE_TOKEN'; } };
  const response = (url, body, status = 200) => ({ url, status, redirected: false, json: async () => bodyHook ? bodyHook(body) : clone(body) });
  const snapshot = () => ({ revision: current.revision, isMember: current.viewer.is_member, isHost: false, hidden: current.circle.hidden,
    completed: current.ended, ended: current.ended, ...current.capabilities });
  const management = () => ({ kind: 'management', circle: { id: CIRCLE, title: current.circle.title, hidden: current.circle.hidden }, revision: current.revision,
    viewer: current.viewer, capabilities: { canLeave: current.viewer.is_member, canComplete: false } });
  const normal = (url, options) => {
    if (options.method === 'GET') return response(url, url.endsWith('/mine') ? { items: [{ ...current, kind: 'circle' }], nextCursor: null }
      : url.endsWith('/membership') ? management() : current);
    assert.ok(url.endsWith('/rsvp'), 'Attendance never changes membership');
    const mutation = parseCircleAttendanceMutation(JSON.parse(options.body)); assert.ok(mutation); assert.equal(options.body, circleAttendanceMutationBody(mutation));
    const old = receipts.get(mutation.requestId);
    if (old && old.body !== options.body || !old && (mutation.expectedMemberId !== MEMBER || mutation.expectedRevision !== current.revision)) return response(url, { error: 'conflict' }, 409);
    if (!old) {
      if (!current.capabilities.canRsvp || !current.meetings.some(m => m.date === mutation.date)) return response(url, { error: 'unavailable' }, 403);
      current = detail({ revision: current.revision + 1, status: mutation.status, date: mutation.date });
      receipts.set(mutation.requestId, { body: options.body, event: { action: 'rsvp', joined: true, completed: false, date: mutation.date, status: mutation.status } });
    }
    return response(url, { memberId: MEMBER, requestId: mutation.requestId, circleId: CIRCLE, receipt: receipts.get(mutation.requestId).event, state: snapshot(), replayed: Boolean(old) });
  };
  const transport = lane => async (url, options) => {
    calls.push({ lane, url, options }); if (before) { const value = before(url, options, lane); if (value !== undefined) return value; }
    const result = normal(url, options); return after ? after(result, url, options) : result;
  };
  const directory = createCircleDirectory({ origin: ORIGIN, owner, memberId, transport: transport('member'),
    ...(attendance ? { attendanceTransport: transport('attendance') } : {}), initialOnline: true, timeoutMs,
    ...(keys ? { newRequestId: async () => { allocated++; return keyHook ? keyHook() : 'cccccccc-cccc-4ccc-8ccc-' + String(allocated).padStart(12, '0'); } } : {}) });
  directory.connect();
  return { directory, calls, response, normal, get allocated() { return allocated; }, row: () => clone(current), set: value => { current = clone(value); },
    before: fn => { before = fn; }, after: fn => { after = fn; }, body: fn => { bodyHook = fn; }, bearer: fn => { bearerHook = fn; }, key: fn => { keyHook = fn; },
    notify() { scope += '-replacement'; for (const fn of [...owners]) fn(); },
    async selected() { await directory.mine(); await directory.select(CIRCLE); }, close() { directory.close(); } };
}
async function review(f, status = 'going') { await f.directory.prepareAttendance(DAY, status); assert.equal(f.directory.model().phase, 'review'); }
const posts = f => f.calls.filter(c => c.options.method === 'POST');

test('attendance is inert and unavailable without a valid bound member, optional lane and request keys', async () => {
  for (const options of [{ memberId: null }, { memberId: MEMBER.toUpperCase() }, { memberId: 'bad' }, { attendance: false }, { keys: false }]) {
    const f = fixture(options); try { assert.equal(f.calls.length, 0); await f.selected(); assert.equal(f.directory.model().canPrepareAttendance, false);
      const count = f.calls.length; await f.directory.prepareAttendance(DAY, 'going'); assert.equal(f.calls.length, count); assert.equal(posts(f).length, 0);
    } finally { f.close(); }
  }
});
test('fresh review binds owner, meeting, response and revision; confirmation uses only the attendance lane and a fresh readback', async () => {
  const f = fixture(); try {
    await f.selected(); f.set(detail({ revision: 8, status: 'not_going' })); await review(f);
    const m = f.directory.model(); assert.deepEqual(clone(m.attendanceReview), { date: DAY, status: 'going', previousStatus: 'not_going', circleTitle: 'Synthetic attendance Circle', time: '19:00', timezone: 'America/New_York' });
    m.attendanceReview.status = 'not_going'; m.attendanceReview.date = '2099-01-01'; m.detail.revision = 100;
    assert.equal(posts(f).length, 0); await f.directory.confirm();
    assert.equal(posts(f)[0].lane, 'attendance'); assert.equal(posts(f)[0].url, ORIGIN + '/api/circles/' + CIRCLE + '/rsvp');
    assert.deepEqual(JSON.parse(posts(f)[0].options.body), { expectedMemberId: MEMBER, requestId: 'cccccccc-cccc-4ccc-8ccc-000000000001', expectedRevision: 8, date: DAY, status: 'going' });
    assert.deepEqual(f.calls.slice(-2).map(c => [c.lane, c.options.method]), [['attendance', 'POST'], ['member', 'GET']]);
    assert.equal(f.directory.model().detail.meetings[0].my_status, 'going'); assert.equal(f.directory.model().detail.revision, 9); assert.equal(f.directory.model().attendanceReview, null);
  } finally { f.close(); }
});
test('a new same-response intent consumes a fresh revision and Not going remains an explicit response', async () => {
  const f = fixture(); try { await f.selected(); await review(f); await f.directory.confirm(); await review(f); await f.directory.confirm();
    assert.equal(f.row().revision, 7); assert.equal(f.allocated, 2); await review(f, 'not_going'); await f.directory.confirm();
    assert.equal(f.row().revision, 8); assert.equal(f.row().meetings[0].my_status, 'not_going'); assert.equal(f.row().meetings[0].going, 0);
  } finally { f.close(); }
});
test('every review freezes navigation, refresh and other intentions while cancellation remains available', async () => {
  const f = fixture(); try { await f.selected(); await review(f); const count = f.calls.length, m = f.directory.model();
    for (const key of ['canNavigate', 'canBack', 'canRefresh', 'canSearch', 'canMine', 'canPrepareJoin', 'canPrepareLeave', 'canPrepareAttendance', 'canOpenDiscussion']) assert.equal(m[key], false, key);
    assert.equal(m.canCancel, true); await f.directory.prepareAttendance(DAY, 'not_going'); await f.directory.prepare('leave'); await f.directory.refresh();
    await f.directory.mine(); await f.directory.search(defaultDiscoveryPageRequest()); f.directory.back(); assert.equal(f.calls.length, count);
    assert.equal(f.directory.model().attendanceReview.status, 'going'); f.directory.cancel(); assert.equal(f.directory.model().phase, 'ready');
    assert.equal(f.directory.model().attendanceReview, null); await f.directory.confirm(); assert.equal(posts(f).length, 0);
    await f.directory.prepare('leave'); assert.equal(f.directory.model().canNavigate, false); assert.equal(f.directory.model().canCancel, true);
  } finally { f.close(); }
});
test('invalid or unlisted meeting dates and unsupported clearing status never prepare a request', async () => {
  const f = fixture(); try { await f.selected(); const count = f.calls.length;
    for (const [date, status] of [['2030-02-30', 'going'], ['2030-01-02', 'going'], [DAY, null], [DAY, 'maybe'], [DAY, 'remove']]) await f.directory.prepareAttendance(date, status);
    assert.equal(f.calls.length, count); assert.equal(f.directory.model().attendanceReview, null);
  } finally { f.close(); }
});
for (const kind of ['meeting changed', 'membership lost', 'hidden', 'ended', 'malformed calendar']) test(`fresh ${kind} cannot inherit an earlier RSVP permission`, async () => {
  const f = fixture(); try { await f.selected();
    if (kind === 'meeting changed') f.set(detail({ date: '2030-01-08' }));
    if (kind === 'membership lost') f.set(detail({ member: false }));
    if (kind === 'hidden') f.set(detail({ hidden: true }));
    if (kind === 'ended') f.set(detail({ ended: true }));
    if (kind === 'malformed calendar') f.before((url, options) => options.method === 'GET' && url.endsWith(CIRCLE) ? f.response(url, { error: 'calendar' }, 503) : undefined);
    await f.directory.prepareAttendance(DAY, 'going'); assert.notEqual(f.directory.model().phase, 'review'); assert.equal(f.directory.model().attendanceReview, null); assert.equal(posts(f).length, 0);
    if (kind === 'malformed calendar') { assert.ok(f.directory.model().management); assert.equal(f.directory.model().canPrepareAttendance, false); }
  } finally { f.close(); }
});
test('a lost committed response retains exact review and only deliberate same-key retry can settle it', async () => {
  const f = fixture(); try { await f.selected(); await review(f); let lost = true;
    f.after((result, url, options) => { if (options.method === 'POST' && lost) { lost = false; throw Error('Synthetic lost committed reply'); } return result; });
    await f.directory.confirm(); const exact = posts(f)[0].options.body, count = f.calls.length;
    assert.equal(f.directory.model().phase, 'unknown'); assert.equal(f.directory.model().attendanceReview.circleTitle, 'Synthetic attendance Circle'); assert.equal(f.directory.model().canNavigate, false);
    await tick(); await f.directory.refresh(); await f.directory.prepareAttendance(DAY, 'not_going'); f.directory.cancel(); assert.equal(f.calls.length, count);
    await f.directory.confirm(); assert.equal(posts(f)[1].options.body, exact); assert.equal(f.allocated, 1); assert.equal(f.row().revision, 6); assert.equal(f.directory.model().phase, 'ready');
  } finally { f.close(); }
});
test('historical retry acceptance shows a later current response rather than claiming the earlier Going is current', async () => {
  const f = fixture(); try { await f.selected(); await review(f); let lost = true;
    f.after((result, url, options) => { if (options.method === 'POST' && lost) { lost = false; throw Error('lost'); } return result; });
    await f.directory.confirm(); f.set(detail({ revision: 7, status: 'not_going' })); await f.directory.confirm();
    assert.equal(f.directory.model().detail.meetings[0].my_status, 'not_going'); assert.match(f.directory.model().message, /earlier receipt does not override/); assert.equal(f.row().revision, 7);
  } finally { f.close(); }
});
for (const status of [401, 409, 429]) test(`a refused ${status} retry cannot settle an earlier unknown request`, async () => {
  const f = fixture(); try { await f.selected(); await review(f); f.before((url, options) => { if (options.method === 'POST') throw Error('Lost delivery'); });
    await f.directory.confirm(); const exact = posts(f)[0].options.body; f.before((url, options) => options.method === 'POST' ? f.response(url, { error: 'refused' }, status) : undefined);
    await f.directory.confirm(); assert.equal(f.directory.model().phase, 'unknown'); assert.equal(posts(f)[1].options.body, exact); assert.equal(f.allocated, 1);
  } finally { f.close(); }
});
test('an initial known refusal requires a new fresh review and never reports a saved response', async () => {
  const f = fixture(); try { await f.selected(); await review(f); f.before((url, options) => options.method === 'POST' ? f.response(url, { error: 'conflict' }, 409) : undefined);
    await f.directory.confirm(); assert.equal(f.directory.model().phase, 'unavailable'); assert.equal(f.directory.model().attendanceReview, null); assert.equal(f.directory.model().canRetry, false);
    f.before(null); await f.directory.refresh(); await review(f, 'not_going'); await f.directory.confirm(); assert.equal(f.allocated, 2); assert.equal(f.row().meetings[0].my_status, 'not_going');
  } finally { f.close(); }
});
for (const field of ['memberId', 'circleId', 'requestId', 'date', 'status', 'action', 'revision', 'missing owner']) test(`a wrong ${field} receipt remains unknown and grants no attendance state`, async () => {
  const f = fixture(); try { await f.selected(); await review(f); f.after(async (result, url, options) => {
    if (options.method !== 'POST') return result; const value = await result.json();
    if (['memberId', 'circleId', 'requestId'].includes(field)) value[field] = OTHER;
    else if (field === 'date') value.receipt.date = '2030-01-08'; else if (field === 'status') value.receipt.status = 'not_going';
    else if (field === 'action') value.receipt.action = 'join'; else if (field === 'revision') value.state.revision = 5; else delete value.memberId;
    return f.response(url, value);
  }); await f.directory.confirm(); assert.equal(f.directory.model().phase, 'unknown'); assert.equal(f.directory.model().detail, null); assert.equal(f.calls.at(-1).options.method, 'POST');
  } finally { f.close(); }
});
test('a successful receipt with failed or regressed readback cannot claim current attendance', async () => {
  const f = fixture(); try { await f.selected(); await review(f); f.after((result, url, options) => {
    if (options.method === 'POST') f.set(detail({ revision: 5 })); return result;
  }); await f.directory.confirm(); assert.equal(f.directory.model().phase, 'unavailable'); assert.equal(f.directory.model().detail, null); assert.equal(f.directory.model().attendanceReview, null); assert.equal(f.directory.model().canRetry, false);
  } finally { f.close(); }
});
for (const stage of ['key', 'bearer', 'transport', 'json']) test(`${stage} deadline fences late completion and never automatically retries`, async () => {
  const f = fixture({ timeoutMs: 15 }), held = deferred(); try { await f.selected(); await review(f);
    if (stage === 'key') f.key(() => held.promise); else if (stage === 'bearer') f.bearer(() => held.promise);
    else if (stage === 'transport') f.before((url, options) => options.method === 'POST' ? held.promise : undefined); else f.body(() => held.promise);
    await f.directory.confirm(); assert.equal(f.directory.model().phase, stage === 'key' ? 'unavailable' : 'unknown');
    const count = f.calls.length; held.resolve(stage === 'key' ? OTHER : stage === 'bearer' ? 'TOKEN' : stage === 'transport' ? f.response(ORIGIN + '/api/circles/' + CIRCLE + '/rsvp', {}) : {});
    await tick(); assert.equal(f.calls.length, count); assert.equal(f.directory.model().detail, null); if (stage === 'key' || stage === 'bearer') assert.equal(posts(f).length, 0);
  } finally { f.close(); }
});
for (const event of ['owner', 'inactive', 'offline', 'disconnect', 'close']) test(`${event} retires visible review and local pending without late restoration or automatic recovery`, async () => {
  const f = fixture(), held = deferred(); try { await f.selected(); await review(f); f.before((url, options) => options.method === 'POST' ? held.promise : undefined);
    const sending = f.directory.confirm(); await tick();
    if (event === 'owner') f.notify(); else if (event === 'inactive') f.directory.activity(false); else if (event === 'offline') f.directory.connectivity(false); else f.directory[event]();
    assert.equal(posts(f)[0].options.signal.aborted, true); held.resolve(f.normal(posts(f)[0].url, posts(f)[0].options)); await sending;
    assert.equal(f.directory.model().attendanceReview, null); assert.equal(f.directory.model().detail, null); assert.equal(f.directory.model().canRetry, false);
    const count = f.calls.length; f.directory.activity(true); f.directory.connectivity(true); f.directory.connect(); await tick(); assert.equal(f.calls.length, count);
  } finally { f.close(); }
});
test('later new same-response intent fences an older held opposite response after local recovery is closed', async () => {
  const f = fixture(); let delayed; try { await f.selected(); await review(f, 'not_going'); f.before((url, options) => { if (options.method === 'POST') { delayed = { url, options }; throw Error('held'); } });
    await f.directory.confirm(); f.directory.activity(false); f.directory.activity(true); f.before(null); await f.selected(); await review(f, 'going'); await f.directory.confirm();
    assert.equal(f.row().revision, 6); assert.equal(f.normal(delayed.url, delayed.options).status, 409); assert.equal(f.row().meetings[0].my_status, 'going');
  } finally { f.close(); }
});
