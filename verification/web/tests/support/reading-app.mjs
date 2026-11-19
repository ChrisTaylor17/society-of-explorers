import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { offlineApp } from './offline-app.mjs';
const require = createRequire(path.resolve('tooling/package.json'));
const { PGlite } = require('@electric-sql/pglite');
const ADA = '11111111-1111-4111-8111-111111111111';
const JULES = '22222222-2222-4222-8222-222222222222';

export async function readingApp() {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec(fs.readFileSync('../../supabase/great_books.sql', 'utf8'));
  await db.exec(fs.readFileSync('../../docs/sql/great-books-private-data.sql', 'utf8'));
  const app = offlineApp();
  let actor = ADA;
  // Synthetic canonical identity only. The existing security suite tests the
  // actual identity resolver; this test exercises actual HTTP -> PostgreSQL.
  app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: async () => actor ? { memberId: actor } : null }));
  const calls = [];
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => ({ from(table) {
    assert.equal(table, 'reading_progress');
    const filters = [];
    const query = { select(columns) { assert.equal(columns, 'book_id,section_id,paragraph_index,completed,updated_at'); return query; },
      eq(column, value) { filters.push([column, value]); return query; },
      in(column, value) { filters.push([column, value]); return query; },
      async then(resolve, reject) {
        const params = [], where = filters.map(([column, value]) => {
          assert.ok(['member_id', 'book_id'].includes(column));
          params.push(value); return Array.isArray(value) ? `${column}=ANY($${params.length}::text[])` : `${column}=$${params.length}`;
        }).join(' AND ');
        calls.push({ action: 'select', filters });
        try {
          await db.exec('SET ROLE service_role');
          const result = await db.query(`SELECT book_id,section_id,paragraph_index,completed,updated_at::text FROM reading_progress WHERE ${where}`, params);
          resolve({ data: result.rows, error: null });
        } catch (error) { if (reject) reject(error); }
        finally { await db.exec('RESET ROLE'); }
      },
      async upsert(value, options) {
        assert.equal(options.onConflict, 'member_id,book_id');
        calls.push({ action: 'upsert', member: value.member_id });
        try {
          await db.exec('SET ROLE service_role');
          await db.query('INSERT INTO reading_progress(member_id,book_id,section_id,paragraph_index,completed,updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(member_id,book_id) DO UPDATE SET section_id=EXCLUDED.section_id,paragraph_index=EXCLUDED.paragraph_index,completed=EXCLUDED.completed,updated_at=EXCLUDED.updated_at',
            [value.member_id, value.book_id, value.section_id, value.paragraph_index, value.completed, value.updated_at]);
          return { error: null };
        } finally { await db.exec('RESET ROLE'); }
      } };
    return query;
  } }) }));
  const route = app.load('app/api/great-books/progress/route.ts');
  const edition = await app.load('lib/books/editions.ts').readBookEdition('hamlet');
  const request = (body, query = '?bookId=hamlet') => app.fakes.makeReq(body, { url: `https://offline.invalid/api/great-books/progress${query}`, headers: { origin: 'https://offline.invalid', authorization: 'Bearer SYNTHETIC_TEST_ONLY', 'content-type': 'application/json' } });
  return { db, app, route, edition: edition.edition, request, calls, actor: value => { actor = value; } };
}

