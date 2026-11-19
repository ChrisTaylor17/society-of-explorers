import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';

const lib = offlineApp().load('lib/circles/thread.ts');
const circle = '11111111-1111-4111-8111-111111111111', root = '22222222-2222-4222-8222-222222222222';
const child = '33333333-3333-4333-8333-333333333333', grandchild = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555', other = '66666666-6666-4666-8666-666666666666';
const hash = 'a'.repeat(64), key = 'b'.repeat(64);
const message = (id = root, extra = {}) => ({ id, member_name: 'Fictional Reader', content: 'An original human observation.', created_at: '2026-11-03T10:00:00.123456+00:00', is_mine: false,
  visibility: 'visible', parentMessageId: id === root ? null : root, rootMessageId: root, ...extra });
const input = (extra = {}) => ({ requestId, comment: 'My own thought.', parentMessageId: root, expectedParentRevision: 0, expectedParentHash: hash, contentHash: hash, reviewKey: key, ...extra });
const clone = value => JSON.parse(JSON.stringify(value));

test('reply body retains its own words and canonical parent locator without copying parent text or identity', () => {
  const body = lib.formatDiscussionContent(circle, '  A different interpretation.  ', root);
  assert.equal(body, `A different interpretation.\n\nIn reply to message:\n/circles/${circle}/discussion?message=${root}`);
  assert.doesNotMatch(body, /Fictional Reader|original human observation/);
  assert.equal(lib.formatDiscussionContent(circle, 'Standalone discussion.', null), 'Standalone discussion.');
  assert.equal(lib.discussionHref(circle.toUpperCase(), root.toUpperCase()), `/circles/${circle}/discussion?message=${root}`);
});

test('full UTF16 limit includes locator; malformed Unicode, controls and caller destinations are refused', () => {
  const limit = lib.discussionCommentLimit(circle, root);
  assert.equal(lib.formatDiscussionContent(circle, 'x'.repeat(limit), root).length, 2000);
  assert.equal(lib.formatDiscussionContent(circle, 'x'.repeat(limit + 1), root), null);
  assert.equal(lib.formatDiscussionContent(circle, '🙂'.repeat(1000), null).length, 2000);
  for (const comment of ['', '  ', '\uD800', 'broken\uDC00', 'bad\u0000body', 'bad\u000bbody']) assert.equal(lib.formatDiscussionContent(circle, comment, root), null);
  assert.equal(lib.formatDiscussionContent(circle, 'Text', 'https://evil.invalid'), null);
});

test('a plaintext locator is only a bounded canonical hint, never an authoritative relation', () => {
  const content = lib.formatDiscussionContent(circle, 'Text', root);
  assert.deepEqual(clone(lib.discussionMessageHint(content)), { circleId: circle, messageId: root });
  for (const text of [content + '&actor=forged', content + '#fragment', 'https://evil.invalid' + lib.discussionHref(circle, root), content.replace('/discussion?', '/discussion/../?')]) assert.equal(lib.discussionMessageHint(text), null);
});

test('archive and thread query modes roundtrip UUID cursors without timestamp conversion', () => {
  for (const query of [{ kind: 'archive', before: null, limit: 25 }, { kind: 'archive', before: child, limit: 1 }, { kind: 'thread', messageId: grandchild, after: child, limit: 25 }]) {
    assert.deepEqual(clone(lib.parseDiscussionQuery(lib.discussionSearchParams(query))), query);
  }
  assert.deepEqual(clone(lib.parseDiscussionQuery(new URLSearchParams({ requestId }))), { kind: 'receipt', requestId });
});

for (const query of [`message=${root}&before=${child}`, `after=${child}`, `before=${root}&before=${root}`, `message=${root}&message=${root}`, 'limit=0', 'limit=26', 'limit=025', 'limit=1.5', `requestId=${requestId}&limit=25`, `requestId=${requestId}&message=${root}`, 'comment=PRIVATE_DRAFT', 'memberId=forged']) {
  test(`unsupported, mixed or duplicate private query refuses: ${query}`, () => assert.equal(lib.parseDiscussionQuery(new URLSearchParams(query)), null));
}

test('projection strips private authority/evidence and supports arbitrary immediate parents within one canonical root', () => {
  const raw = message(grandchild, { parentMessageId: child, member_id: 'PRIVATE_MEMBER', report_note: 'PRIVATE_REPORT', token: 'PRIVATE_TOKEN', roles: ['admin'] });
  const parsed = lib.parseThreadMessage(raw);
  assert.equal(parsed.parentMessageId, child); assert.equal(parsed.rootMessageId, root);
  assert.doesNotMatch(JSON.stringify(parsed), /PRIVATE_|roles/);
  assert.equal(lib.parseThreadMessage(message(child, { parentMessageId: child })), null);
  assert.equal(lib.parseThreadMessage(message(child, { rootMessageId: child })), null);
  assert.equal(lib.parseThreadMessage(message(root, { rootMessageId: other })), null);
});

test('held and malformed legacy messages never carry raw body or a fabricated timestamp', () => {
  for (const visibility of ['hidden', 'withdrawn', 'unavailable']) {
    const parsed = lib.parseThreadMessage(message(root, { visibility, content: null, created_at: null }));
    assert.equal(parsed.content, null); assert.equal(parsed.created_at, null); assert.equal(parsed.visibility, visibility);
    assert.equal(lib.parseThreadMessage(message(root, { visibility, content: 'PRIVATE_RETAINED_BODY' })), null);
  }
  assert.equal(lib.parseThreadMessage(message(root, { created_at: null })), null);
  const longName = lib.parseThreadMessage(message(root, { member_name: 'x'.repeat(199) + '🙂' }));
  assert.equal(longName.member_name.length, 199);
  assert.equal(lib.parseThreadMessage(message(root, { member_name: 'private@example.invalid' })).member_name, 'Explorer');
});

test('archive cursor must identify the last full-page item and never repeat the requested anchor', () => {
  const page = { kind: 'archive', circleId: circle, items: [message(root), message(child)], nextCursor: child, limit: 2, members: ['PRIVATE_ROSTER'] };
  assert.ok(lib.parseDiscussionPage(page, { circleId: circle, kind: 'archive', limit: 2 }));
  assert.equal(lib.parseDiscussionPage({ ...page, nextCursor: root }), null);
  assert.equal(lib.parseDiscussionPage({ ...page, items: [message(root), message(root)] }), null);
  assert.equal(lib.parseDiscussionPage(page, { before: child }), null);
  assert.equal(lib.parseDiscussionPage(page, { circleId: other }), null);
  assert.doesNotMatch(JSON.stringify(lib.parseDiscussionPage(page)), /PRIVATE_ROSTER/);
});

test('thread pages bind root, requested focus, descendant identities and page cursor separately', () => {
  const page = { kind: 'thread', circleId: circle, root: message(root), focus: message(grandchild, { parentMessageId: child }), items: [message(child)], nextCursor: child, limit: 1 };
  const parsed = lib.parseDiscussionPage(page, { circleId: circle, messageId: grandchild, kind: 'thread' });
  assert.equal(parsed.focus.id, grandchild, 'focus survives even when outside the current bounded reply page');
  assert.equal(lib.parseDiscussionPage(page, { messageId: root }), null);
  assert.equal(lib.parseDiscussionPage({ ...page, items: [message(root)] }), null);
  assert.equal(lib.parseDiscussionPage({ ...page, items: [message(other, { rootMessageId: other, parentMessageId: null })] }), null);
  assert.equal(lib.parseDiscussionPage(page, { after: child }), null);
});

test('fresh target cannot expose held body or confer parent authority from arbitrary caller fields', () => {
  const target = { circleId: circle, target: { message: message(root), revision: 0, contentHash: hash } };
  assert.ok(lib.parseDiscussionTarget(target));
  assert.equal(lib.parseDiscussionTarget({ ...target, target: { ...target.target, message: message(root, { visibility: 'hidden', content: null }) } }), null);
  assert.equal(lib.validateDiscussionPreviewInput({ requestId, comment: 'Text', parentMessageId: root, actor: other }).ok, false);
  for (const extra of [{ expectedParentHash: null }, { expectedParentRevision: -1 }, { expectedParentRevision: Number.MAX_SAFE_INTEGER + 1 }, { parentMessageId: null }]) assert.equal(lib.validateDiscussionPostInput(input(extra)).ok, false);
  assert.equal(lib.validateDiscussionPostInput(input({ parentMessageId: null, expectedParentRevision: null, expectedParentHash: null })).ok, true);
});

test('preview roundtrip binds full canonical content, exact parent and actual comment allowance', () => {
  const content = lib.formatDiscussionContent(circle, 'Human comment.', root);
  const preview = { circleId: circle, requestId, comment: 'Human comment.', parentMessageId: root, content, contentHash: hash, reviewKey: key,
    parent: { message: message(root), revision: 0, contentHash: hash }, commentLimit: lib.discussionCommentLimit(circle, root) };
  assert.ok(lib.parseDiscussionPreview(preview));
  for (const extra of [{ content: content + 'forged' }, { parentMessageId: child }, { commentLimit: 2000 }, { parent: null }]) assert.equal(lib.parseDiscussionPreview({ ...preview, ...extra }), null);
});

test('receipt confirmation remains actor-owned, scope-bound and withheld after recovery', () => {
  const receipt = { outcome: 'confirmed', circleId: circle, requestId, replayed: true, message: message(child, { is_mine: true, visibility: 'withdrawn', content: null }) };
  const lookup = { circleId: circle, requestId, receipt };
  assert.equal(lib.parseDiscussionLookup(lookup).receipt.message.content, null);
  assert.equal(lib.parseDiscussionLookup({ ...lookup, requestId: other }), null);
  assert.equal(lib.parseDiscussionLookup({ ...lookup, receipt: { ...receipt, replayed: false } }), null);
  assert.equal(lib.parseDiscussionReceipt({ ...receipt, message: message(child, { is_mine: false }) }), null);
  assert.equal(lib.parseDiscussionReceipt({ ...receipt, message: message(child, { is_mine: true, visibility: 'withdrawn', content: 'PRIVATE_BODY' }) }), null);
});
