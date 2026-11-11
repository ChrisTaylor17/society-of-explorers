import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const file = join(root, 'scripts/external-effect-lazy-clients-smoke.mjs');
const source = readFileSync(file, 'utf8');
const boundary = source.indexOf('const failures = checks.filter');
assert(boundary > 0);
const script = new vm.Script(source.slice(0, boundary)
  .replace(/^#!.*\n/, '').replace(/^import .*;\n/gm, '') + '\nchecks.filter(check => !check.ok).map(check => check.name);');

function run(mutation) {
  let applied = 0;
  const failures = script.runInNewContext({ join, lstatSync, process: { cwd: () => root },
    readFileSync(path, encoding) {
      const text = readFileSync(path, encoding);
      if (!mutation || resolve(path) !== resolve(root, mutation.path)) return text;
      assert.equal(text.split(mutation.from).length - 1, 1, 'Mutation must match exactly one reviewed source span');
      applied++;
      return text.replace(mutation.from, mutation.to);
    },
  }, { timeout: 5000 });
  assert.equal(applied, mutation ? 1 : 0);
  return Array.from(failures);
}

test('the complete static guard accepts the reviewed current source', () => assert.deepEqual(run(), []));

const salon = 'book salon writes check the origin and bind the verified actor';
const dm = 'DM route is signed-in, sender/read-scoped, lazy, and private';
const reading = 'Great Books editions are read-only and bookmarks use explicit authenticated lifetime-guarded calls';
const thinker = 'core thinker and Movement creator helpers use lazy Supabase admin clients';
const legacyRooms = 'live sessions keep their authority checks while legacy room writes stay unavailable';
const cases = [
  { name: 'legacy room creation starts a provider request', path: 'app/api/rooms/route.ts', from: "code: 'legacy_rooms_unavailable'", to: "code: await fetch('https://unreviewed.invalid')", check: legacyRooms },
  { name: 'legacy room actions write with an admin client', path: 'app/api/rooms/[roomId]/route.ts', from: "code: 'legacy_rooms_unavailable'", to: "code: await getSupabaseAdmin().from('room_participants').insert({})", check: legacyRooms },
  { name: 'legacy room creation claims success', path: 'app/api/rooms/route.ts', from: '}, { status: 409 })', to: '}, { status: 200 })', check: legacyRooms },
  { name: 'legacy room actions lose the unavailable receipt', path: 'app/api/rooms/[roomId]/route.ts', from: "code: 'legacy_rooms_unavailable'", to: 'success: true', check: legacyRooms },
  { name: 'retired memory extraction starts a provider request', path: 'app/api/thinker/extract-facts/route.ts', from: 'return privateJson(', to: "fetch('https://unreviewed.invalid'); return privateJson(", check: 'legacy automatic fact extraction is a private 410 with no model or storage effects' },
  { name: 'retired memory saves claim success', path: 'app/api/thinker/memory/route.ts', from: '{ status: 410 }', to: '{ status: 200 }', check: 'legacy unreviewed memory embedding is a private 410 with no model or storage effects' },
  { name: 'proactive job starts external contact', path: 'app/api/cron/proactive/route.ts', from: 'processed: 0', to: "processed: await fetch('https://unreviewed.invalid')", check: 'proactive email stays disabled and onboarding is lazy, private, escaped, and flag-gated' },
  { name: 'proactive job accepts an absent secret', path: 'app/api/cron/proactive/route.ts', from: '!cronSecret || req.headers', to: 'req.headers', check: 'proactive email stays disabled and onboarding is lazy, private, escaped, and flag-gated' },
  { name: 'book salon account loses expected owner binding', path: 'lib/book-salons/browser-account.ts', from: '[EXPECTED_MEMBER_HEADER]: owner.memberId', to: '[EXPECTED_MEMBER_HEADER]: submittedMemberId', check: salon },
  { name: 'salon creation trusts a submitted actor', path: 'app/api/book-salons/route.ts', from: 'p_actor: auth.memberId', to: 'p_actor: body.memberId', check: salon },
  { name: 'salon creation accepts an incomplete receipt', path: 'app/api/book-salons/route.ts', from: 'data.creatorJoined !== true', to: 'false', check: salon },
  { name: 'salon join trusts a submitted actor', path: 'app/api/book-salons/join/route.ts', from: 'p_actor: auth.memberId, p_cohort_id: cohortId', to: 'p_actor: body.memberId, p_cohort_id: cohortId', check: salon },
  { name: 'direct-message read skips authenticated ownership', path: 'app/api/message/route.ts', from: 'const auth = await messageOwner(req)', to: "const auth = { memberId: 'submitted' }", check: dm },
  { name: 'direct-message sender comes from the body', path: 'app/api/message/route.ts', from: 'p_actor: memberId, p_peer: recipientId, p_content: content', to: 'p_actor: body.senderId, p_peer: recipientId, p_content: content', check: dm },
  { name: 'message helper skips the origin gate', path: 'lib/members/direct-message-server.ts', from: 'const originError = circleWriteOrigin(req)', to: 'const originError = null', check: dm },
  { name: 'message helper bypasses controlled SQL', path: 'lib/members/direct-message-server.ts', from: 'getSupabaseAdmin().rpc(name, args)', to: "getSupabaseAdmin().from('direct_messages').select('*')", check: dm },
  { name: 'reading metadata skips Scripture source integrity', path: 'lib/circles/reading-edition-server.ts', from: 'sourceSha256 !== scripture.metadata.sourceSha256', to: 'false', check: reading },
  { name: 'reading metadata introduces remote content', path: 'lib/circles/reading-edition-server.ts', from: 'return scripture.metadata;', to: "return fetch('https://unreviewed.invalid');", check: reading },
  { name: 'Thinker binds identity to the submitted body', path: 'app/api/thinker/route.ts', from: 'const { memberId, member } = auth;', to: 'const { memberId, member } = body;', check: thinker },
  { name: 'private conversation starts sending a model request', path: 'app/members/page.tsx', from: 'Add a prepared question to your draft.', to: "fetch('/api/thinker'", check: thinker },
  { name: 'direct-message request loses its current conversation scope', path: 'app/members/page.tsx', from: 'encodeURIComponent(scope.peerId)', to: 'encodeURIComponent(selectedMemberId)', check: dm },
];

for (const mutation of cases) test('static guard rejects regression: ' + mutation.name, () => {
  assert(run(mutation).includes(mutation.check), 'Expected the corresponding guard to reject this mutation');
});
