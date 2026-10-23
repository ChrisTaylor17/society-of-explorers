// G7: the shared UUID pattern accepts real ids, and the project pledge / book-salon /
// salon routes no longer reject every valid id.
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { installMocks, makeReq } from '../security/fakes';

let authed: any = null;
installMocks({ '@/lib/getAuthenticatedMember': () => ({ getAuthenticatedMember: async () => authed }) });

const { UUID_PATTERN, isUuid } = await import('../../lib/ids/uuid.ts');
const { PROJECT_ID_PATTERN } = await import('../../lib/projects/publicProject.ts');
const join_ = await import('../../app/api/book-salons/join/route.ts');

const V4 = '3f2b8c1e-9d4a-4f6b-a2c7-1e5d9b0f4a73';
const BROKEN_LITERAL = '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i';

test('G7a shared pattern accepts v4 (gen_random_uuid), v7 and upper-case ids', () => {
  expect(UUID_PATTERN.test(V4)).toBe(true);
  expect(isUuid('01890a5d-ac96-774b-bcce-b302099a8057')).toBe(true);
  expect(isUuid(V4.toUpperCase())).toBe(true);
});

test('G7b shared pattern rejects malformed ids and injection attempts', () => {
  for (const bad of ['', 'abc', `${V4} `, `${V4}x`, '3f2b8c1e-9d4a-4f6b-a2c71e5d9b0f4a73', '3f2b8c1e-9d4a-0f6b-a2c7-1e5d9b0f4a73', '3f2b8c1e-9d4a-4f6b-c2c7-1e5d9b0f4a73', "1' or '1'='1", null, 42]) {
    expect(isUuid(bad as any)).toBe(false);
  }
});

test('G7c the old copied pattern really never matched a valid id (regression proof)', () => {
  const old = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
  expect(old.test(V4)).toBe(false);
});

test('G7d project pledge / project detail id check accepts a real project id', () => {
  expect(PROJECT_ID_PATTERN.test(V4)).toBe(true);
});

test('G7e book-salon join: a valid cohort id reaches the auth check (401) instead of 400', async () => {
  authed = null;
  const r = await join_.POST(makeReq({ cohortId: V4 }));
  expect(r.status).toBe(401);
  const bad = await join_.POST(makeReq({ cohortId: 'not-a-uuid' }));
  expect(bad.status).toBe(400);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test('G7f fixed routes no longer carry the broken pattern; remaining copies are only the reviewed list', () => {
  const root = process.cwd();
  const offenders = [...walk(join(root, 'app')), ...walk(join(root, 'lib'))]
    .filter((f) => readFileSync(f, 'utf8').includes(BROKEN_LITERAL))
    .map((f) => f.slice(root.length + 1))
    .sort();
  // Deliberately left for a separate review: these routes call external providers
  // (Daily rooms, AI responses, Printful publish) or send invites once ids work.
  expect(offenders).toEqual([
    'app/api/live/[sessionId]/route.ts',
    'app/api/merch/publish/route.ts',
    'app/api/merch/suggestions/[id]/route.ts',
    'app/api/projects/invite/route.ts',
    'app/api/rooms/[roomId]/route.ts',
    'app/api/rooms/route.ts',
    'app/api/twiddle/[id]/react/route.ts',
    'app/api/twiddle/[id]/respond/route.ts',
    'app/api/twiddle/[id]/route.ts',
    'app/api/twiddle/route.ts',
  ]);
  for (const fixed of ['lib/projects/publicProject.ts', 'app/api/book-salons/join/route.ts', 'app/api/book-salons/[cohortId]/route.ts', 'app/api/salons/route.ts']) {
    expect(readFileSync(join(root, fixed), 'utf8')).toContain("from '@/lib/ids/uuid'");
  }
});
