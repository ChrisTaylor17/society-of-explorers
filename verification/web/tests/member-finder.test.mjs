import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';

const finder = offlineApp().load('lib/members/finder.ts');
const owner = '11111111-1111-4111-8111-111111111111';
const profile = (n, extra = {}) => ({ id: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`,
  display_name: 'Fictional explorer ' + n, bio: null, discipline: null, skills: [],
  project_description: null, seeking: null, philosophy: null, ...extra });
const plain = value => JSON.parse(JSON.stringify(value));

test('published keyword results explain field matches, exclude self and do not infer traits', () => {
  const people = [profile(1, { id: owner, skills: ['history', 'design'] }),
    profile(2, { display_name: 'Zoë', bio: 'History of architecture', skills: ['design'] }),
    profile(3, { display_name: 'Ábel', project_description: 'History reading group' }),
    profile(4, { display_name: 'Zulu', discipline: 'History' }), profile(5, { skills: ['carpentry'] })];
  const result = plain(finder.findPublishedMembers(people, 'Looking for history and DESIGN', owner.toUpperCase()));
  assert.deepEqual(result.map(row => row.member.display_name), ['Zoë', 'Ábel', 'Zulu']);
  assert.deepEqual(result[0].reasons, [{ field: 'Skills', terms: ['design'] }, { field: 'About', terms: ['history'] }]);
  assert.deepEqual(Object.keys(result[0]).sort(), ['matchedTerms', 'member', 'reasons']);
  assert.deepEqual(plain(finder.findPublishedMembers(people, 'and the with', owner)), []);
});

test('accent folding, technology punctuation and word prefixes work without arbitrary substring matches', () => {
  const people = [profile(1, { display_name: 'José', skills: ['C++', 'C#', '.NET', 'TypeScript'], discipline: 'Architecture' })];
  assert.deepEqual(plain(finder.findPublishedMembers(people, 'jose c++ c# .net type arch', owner))[0].matchedTerms,
    ['jose', 'c++', 'c#', 'net', 'type', 'arch']);
  assert.equal(finder.findPublishedMembers(people, 'script', owner).length, 0);
  assert.deepEqual(plain(finder.finderTerms('HISTORY history History')), ['history']);
  assert.equal(finder.finderTerms('x'.repeat(160) + ' private_suffix').includes('private_suffix'), false);
  assert.equal(finder.finderTerms(Array.from({ length: 20 }, (_, i) => 'term' + i).join(' ')).length, 12);
});

test('only a bounded, exact public DTO is accepted; private extras, malformed rows, duplicates and overfull pages fail closed', () => {
  const good = profile(1);
  assert.deepEqual(plain(finder.parsePublishedDirectory({ members: [good] })), [good]);
  assert.deepEqual(plain(finder.parsePublishedDirectory({ members: [] })), []);
  for (const value of [null, [], {}, { members: [good], private: 'PRIVATE_CANARY' },
    { members: [{ ...good, email: 'PRIVATE_CANARY' }] }, { members: [{ ...good, profile_visibility: 'public' }] },
    { members: [{ ...good, bio: {} }] }, { members: [good, good] }, { members: Array.from({ length: 51 }, (_, i) => profile(i)) }]) {
    assert.equal(finder.parsePublishedDirectory(value), null);
  }
  assert.equal(finder.parsePublishedDirectory({ members: Array.from({ length: 50 }, (_, i) => profile(i)) }).length, 50);
});
