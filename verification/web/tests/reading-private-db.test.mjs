import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('tooling/package.json'));
const { PGlite } = require('@electric-sql/pglite');
const sql = fs.readFileSync('../../docs/sql/great-books-private-data.sql', 'utf8');
const member = '11111111-1111-4111-8111-111111111111';

async function fixture() {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec(fs.readFileSync('../../supabase/great_books.sql', 'utf8'));
  await db.exec('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;');
  await db.query('INSERT INTO reading_progress(member_id,book_id,section_id) VALUES ($1,$2,$3)', [member, 'hamlet', '2']);
  await db.query('INSERT INTO book_highlights(member_id,book_id,passage) VALUES ($1,$2,$3)', [member, 'hamlet', 'PRIVATE_SYNTHETIC_PASSAGE']);
  return db;
}
async function roleQuery(db, role, query) {
  await db.exec(`SET ROLE ${role}`);
  try { return await db.query(query); }
  finally { await db.exec('RESET ROLE'); }
}

test('actual SQL removes historical open access, preserves data, and permits server upsert', async () => {
  const db = await fixture();
  try {
    assert.equal((await roleQuery(db, 'anon', 'SELECT * FROM reading_progress')).rows.length, 1);
    await db.exec(sql);
    await db.exec(sql); // Re-reviewing the same candidate is idempotent.
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['reading_progress', 'book_highlights']) {
        for (const query of [`SELECT * FROM ${table}`, `DELETE FROM ${table}`, `UPDATE ${table} SET book_id='forged'`, `TRUNCATE ${table}`]) {
          await assert.rejects(roleQuery(db, role, query), /permission denied/);
        }
      }
      await assert.rejects(roleQuery(db, role, `INSERT INTO reading_progress(member_id,book_id) VALUES ('${member}','forged')`), /permission denied/);
    }
    await roleQuery(db, 'service_role', `INSERT INTO reading_progress(member_id,book_id,section_id) VALUES ('${member}','hamlet','edition-aware-fixture') ON CONFLICT(member_id,book_id) DO UPDATE SET section_id=EXCLUDED.section_id`);
    assert.equal((await db.query('SELECT section_id FROM reading_progress')).rows[0].section_id, 'edition-aware-fixture');
    assert.equal((await db.query('SELECT passage FROM book_highlights')).rows[0].passage, 'PRIVATE_SYNTHETIC_PASSAGE');
    assert.equal((await db.query("SELECT * FROM pg_policies WHERE tablename IN ('reading_progress','book_highlights')")).rows.length, 0);
  } finally { await db.close(); }
});

test('an unknown policy blocks the entire transaction without deleting historical data', async () => {
  const db = await fixture();
  try {
    await db.exec('CREATE POLICY unexpected_live_policy ON book_highlights FOR SELECT USING(true)');
    await assert.rejects(db.exec(sql), /Unrecognized Great Books policies/);
    await db.exec('ROLLBACK');
    assert.equal((await roleQuery(db, 'anon', 'SELECT * FROM reading_progress')).rows.length, 1);
    assert.equal((await roleQuery(db, 'anon', 'SELECT * FROM book_highlights')).rows.length, 1);
  } finally { await db.close(); }
});

test('inherited grants require explicit reconciliation rather than partial success', async () => {
  const db = await fixture();
  try {
    await db.exec('CREATE ROLE inherited_reader; GRANT SELECT ON book_highlights TO inherited_reader; GRANT inherited_reader TO authenticated');
    await assert.rejects(db.exec(sql), /Inherited or column-level Great Books grants/);
    await db.exec('ROLLBACK');
    assert.equal((await roleQuery(db, 'authenticated', 'SELECT * FROM reading_progress')).rows.length, 1);
  } finally { await db.close(); }
});
