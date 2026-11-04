import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const IDS = {
  host: '11111111-1111-4111-8111-111111111111',
  reviewer: '22222222-2222-4222-8222-222222222222',
  reviewer2: '33333333-3333-4333-8333-333333333333',
  reporter: '44444444-4444-4444-8444-444444444444',
  reporter2: '55555555-5555-4555-8555-555555555555',
  ordinary: '66666666-6666-4666-8666-666666666666',
  circle: '77777777-7777-4777-8777-777777777777',
  circle2: '88888888-8888-4888-8888-888888888888',
  report: '99999999-9999-4999-8999-999999999999',
};
let sequence = 0;
export function requestId() {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12, '0')}`;
}

export async function createDb() {
  const db = new PGlite();
  await db.waitReady;
  // Only disposable in-memory PostgreSQL roles. No real service credential,
  // project connection, socket listener or issued token enters this fixture.
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE TABLE public.members(id uuid PRIMARY KEY, display_name text);
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
  // Execute the actual historical cohort and Circle SQL, rather than a JavaScript
  // database mock. Members use only the existing columns this candidate touches.
  for (const path of ['../../supabase/book_cohorts.sql', '../../supabase/migrations/20261027_soe_circles.sql', '../../docs/sql/circle-moderation.sql']) {
    await db.exec(await readFile(new URL(path, new URL('../../', import.meta.url)), 'utf8'));
  }
  const unseeded = await db.query('SELECT count(*)::int AS count FROM circle_reviewer_grants');
  if (unseeded.rows[0].count !== 0) throw new Error('Schema candidate must not provision reviewers');
  await db.query(`INSERT INTO members(id,display_name) SELECT unnest($1::uuid[]), unnest($2::text[])`, [
    [IDS.host, IDS.reviewer, IDS.reviewer2, IDS.reporter, IDS.reporter2, IDS.ordinary],
    ['Fictional Host', 'Fictional Reviewer', 'Fictional Reviewer Two', 'Reporter', 'Reporter Two', 'Ordinary'],
  ]);
  await addCircle(db, IDS.circle);
  await db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES ($1,$2),($1,$3)', [IDS.circle, IDS.reviewer, IDS.reviewer2]);
  return db;
}

export async function addCircle(db, id, { host = IDS.host, title = 'Fictional public reading circle', hidden = false } = {}) {
  await db.query(`INSERT INTO book_cohorts(id,book_id,title,description,created_by,circle_hidden)
    VALUES ($1,'soe-circles-path',$2,'Public description for a fictional reading circle.',$3,$4)`, [id, title, host, hidden]);
}

// PGlite owns one PostgreSQL session. transaction() queues exclusive operations;
// Promise.all contention tests therefore prove real SQL serialized outcomes,
// rollback and revision/receipt behavior, not multi-backend lock scheduling.
export async function asRole(db, role, fn) {
  if (!['anon', 'authenticated', 'service_role'].includes(role)) throw new Error('Unexpected fixture role');
  return db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return fn(tx);
  });
}

export async function rpc(db, name, params = [], role = 'service_role') {
  if (!/^soe_circle_[a-z_]+$/.test(name)) throw new Error('Unexpected fixture RPC');
  return asRole(db, role, async tx => {
    const slots = params.map((_, i) => `$${i + 1}`).join(',');
    const result = await tx.query(`SELECT public.${name}(${slots}) AS result`, params);
    return result.rows[0].result;
  });
}

export function decide(db, { actor = IDS.reviewer, circle = IDS.circle, revision = 0, key = requestId(), action = 'hide',
  reason = action === 'hide' ? 'misleading' : 'resolved', summary = 'The reviewed listing has been checked by a human.', reportId = null,
  excerpt = action === 'hide' ? 'Fictional public' : null } = {}) {
  return rpc(db, 'soe_circle_review_decide', [actor, circle, revision, key, action, reason, summary, reportId, excerpt]);
}

export function report(db, { actor = IDS.reporter, reporterKey = null, circle = IDS.circle, reason = 'spam', note = 'Fictional report note with exact evidence.', key = requestId() } = {}) {
  return rpc(db, 'soe_circle_report', [actor, reporterKey, circle, reason, note, key]);
}

export async function state(db, circle = IDS.circle) {
  const result = await db.query('SELECT circle_hidden AS hidden, circle_review_revision::text AS revision FROM book_cohorts WHERE id=$1', [circle]);
  return { hidden: result.rows[0].hidden, revision: Number(result.rows[0].revision) };
}

export async function count(db, table, where = '') {
  if (!['circle_reports', 'circle_review_decisions', 'circle_report_receipts', 'circle_reviewer_grants'].includes(table)) throw new Error('Unexpected fixture table');
  const result = await db.query(`SELECT count(*)::int AS count FROM ${table} ${where}`);
  return result.rows[0].count;
}
