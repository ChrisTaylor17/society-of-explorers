import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { offlineApp } from './support/offline-app.mjs';

const app = offlineApp();
const { toPublicCircle } = app.load('lib/circles/server.ts');
const row = { id: '77777777-7777-4777-8777-777777777777', title: 'A finite starter Circle', description: 'Synthetic public description.',
  max_members: 8, start_date: '2026-08-18', status: 'forming', created_by: null, created_at: '2026-08-18T00:00:00Z',
  circle_format: 'online', circle_city: null, circle_region: null, circle_venue_name: null, circle_venue_type: 'online',
  circle_weekday: 2, circle_time: '19:00', circle_timezone: 'America/New_York', circle_hidden: false };

test('public seats close after the twelfth local meeting day, without mutating the stored row', () => {
  // August18 + 77days = November3. At04:30UTC on November4 it is still
  // November3 in NewYork after the DST boundary; only05:00UTC ends that day.
  const lastDay = toPublicCircle(row, { memberCount: 2, hostName: 'Synthetic Host' }, new Date('2026-11-04T04:30:00Z'));
  assert.equal(lastDay.week, 12); assert.equal(lastDay.status, 'forming'); assert.equal(lastDay.spots_left, 6);
  const ended = toPublicCircle(row, { memberCount: 2, hostName: 'Synthetic Host' }, new Date('2026-11-04T05:00:00Z'));
  assert.equal(ended.week, 13); assert.equal(ended.status, 'completed'); assert.equal(ended.spots_left, 0);
  assert.equal(ended.reading, null); assert.equal(row.status, 'forming');
});

test('explicit host completion immediately removes advertised seats even before the first meeting', () => {
  const result = toPublicCircle({ ...row, status: 'completed', start_date: '2026-12-01' }, { memberCount: 1, hostName: null }, new Date('2026-11-03T12:00:00Z'));
  assert.equal(result.status, 'completed'); assert.equal(result.spots_left, 0);
});

test('public Circle discovery and norms navigation cannot ensure or look up a member', () => {
  for (const filename of ['app/circles/page.tsx', 'app/circles/norms/page.tsx']) {
    const source = fs.readFileSync('../../' + filename, 'utf8');
    assert.match(source, /CircleSafetyNav/);
    assert.doesNotMatch(source, /PublicNav|getMemberSession|ensure-member/);
  }
});
