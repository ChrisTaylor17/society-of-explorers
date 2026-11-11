// Offline catalog rehearsal, not a database backup or a copy of member data.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';

export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
export const LIVE_CATALOG_SHA256 = 'e6819adff5ff99ff14563eb1636cde1370efe0d3713445b2c4ac7a5760941c67';
const catalogSource = await readFile(new URL('../fixtures/circle-live-catalog-2026-11-04.json', import.meta.url), 'utf8');
if (createHash('sha256').update(catalogSource).digest('hex') !== LIVE_CATALOG_SHA256) throw Error('Live catalog receipt changed; review fixture fidelity first');
const catalogReceipt = JSON.parse(catalogSource);
export const LIVE_CATALOG = catalogReceipt.data;
export const LIVE_TABLES = ['book_cohorts', 'book_cohort_members', 'seminar_messages'];
export const LIVE_FIXTURE_EXCEPTIONS = Object.freeze({
  weeklySchedule: {
    column: 'book_cohorts.weekly_schedule',
    observedExpressionMD5: '8b4b2df56ad0773943ef9179742da01b',
    syntheticDefault: `'{"syntheticFixtureOnly":true}'::jsonb`,
    reason: 'The saved catalog redacts this one JSON literal. It is never reconstructed or executed.',
  },
  externalObjects: 'members is a synthetic minimal prerequisite; postgres/PGlite and synthetic administrative roles are not a hosted Supabase runtime. PGlite records membership grantor web_user rather than observed supabase_admin; the six edges and every option are preserved.',
  incomingForeignKey: 'The receipt proves two book_cohorts NO ACTION FK triggers from book_reflections, but does not collect that child schema or FK column name. A synthetic book_reflections(id,cohort_id) stub reproduces these target trigger semantics; it is not a claim about the live child schema.',
});
export const IDS = Object.freeze({
  host: '11111111-1111-4111-8111-111111111111',
  reviewer: '22222222-2222-4222-8222-222222222222',
  reader: '44444444-4444-4444-8444-444444444444',
  outsider: '66666666-6666-4666-8666-666666666666',
  salon: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  orphanCohort: 'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
  legacyMember: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  legacyThinker: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  legacyUnattributed: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
  legacyNullCohort: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
});
let sequence = 0;
export function requestId() { return `aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12, '0')}`; }
const ident = value => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw Error('Unexpected fixture identifier');
  return `"${value}"`;
};
const knownTypes = new Set(['uuid', 'text', 'integer', 'integer[]', 'jsonb', 'timestamp with time zone']);
const knownDefaults = new Set(['gen_random_uuid()', 'now()', '1', '8', "'{}'::integer[]", "'forming'::text", "'member'::text"]);

export async function runSql(db, path) {
  if (!/^(docs\/sql|supabase\/migrations)\/[a-z0-9_-]+\.sql$/.test(path)) throw Error('Unexpected fixture SQL path');
  return db.exec(await readFile(new URL(path, new URL('../../../../', import.meta.url)), 'utf8'));
}

export async function readLiveFixtureCatalog(db) {
  // This pinned receipt query contains catalog reads only. Execute its original
  // bounded read-only transaction against the disposable local database.
  const results = await db.exec(catalogReceipt.query);
  const metadata = results.flatMap(r => r.rows ?? []).find(r => r.metadata)?.metadata;
  if (!metadata) throw Error('Fixture catalog query returned no metadata');
  return metadata;
}

export async function createLiveDb({ seed = true, db = new PGlite() } = {}) {
  await db.waitReady;
  try {
    await db.exec(`CREATE ROLE postgres NOLOGIN SUPERUSER;
      CREATE ROLE anon NOLOGIN INHERIT; CREATE ROLE authenticated NOLOGIN INHERIT;
      CREATE ROLE service_role NOLOGIN INHERIT BYPASSRLS;
      CREATE ROLE supabase_admin NOLOGIN SUPERUSER; CREATE ROLE authenticator NOLOGIN NOINHERIT;
      SET ROLE postgres;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE public.members(id uuid PRIMARY KEY, display_name text, profile_visibility text NOT NULL DEFAULT 'private');
      GRANT SELECT ON public.members TO service_role;`);
    // Reproduce the six observed edges, including non-inheriting authenticator
    // membership. Administrative roles are explicitly synthetic local stubs.
    await db.exec('SET ROLE supabase_admin');
    for (const edge of LIVE_CATALOG.role_memberships) {
      await db.exec(`GRANT ${ident(edge.granted_role)} TO ${ident(edge.member_role)} WITH ADMIN ${edge.admin}, INHERIT ${edge.inherit}, SET ${edge.set}`);
    }
    await db.exec('SET ROLE postgres');
    // These broad defaults are deliberately retained throughout the rehearsal.
    // Every new migration object must close its own inherited browser authority.
    const groups = new Map();
    for (const acl of LIVE_CATALOG.default_acls) {
      if (acl.schema !== 'public' || acl.grantable) throw Error('Unexpected default ACL receipt');
      const key = JSON.stringify([acl.owner, acl.object_type, acl.grantee]);
      groups.set(key, [...(groups.get(key) ?? []), acl.privilege]);
    }
    for (const [key, privileges] of groups) {
      const [owner, type, grantee] = JSON.parse(key);
      const object = { r: 'TABLES', S: 'SEQUENCES', f: 'FUNCTIONS' }[type];
      if (!object || privileges.some(p => !/^[A-Z]+$/.test(p))) throw Error('Unexpected default privilege');
      await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(owner)} IN SCHEMA public GRANT ${privileges.join(',')} ON ${object} TO ${ident(grantee)}`);
    }
    for (const table of LIVE_TABLES) {
      const columns = LIVE_CATALOG.columns.filter(c => c.table === table).sort((a, b) => a.number - b.number);
      const definitions = columns.map(c => {
        if (!knownTypes.has(c.type) || c.generated || c.identity || c.acl.length) throw Error('Unsupported catalog column');
        let defaultSQL = c.default_expression;
        if (table === 'book_cohorts' && c.name === 'weekly_schedule') defaultSQL = LIVE_FIXTURE_EXCEPTIONS.weeklySchedule.syntheticDefault;
        else if (defaultSQL !== null && !knownDefaults.has(defaultSQL)) throw Error('Unreviewed catalog default');
        return `${ident(c.name)} ${c.type}${c.not_null ? ' NOT NULL' : ''}${defaultSQL === null ? '' : ` DEFAULT ${defaultSQL}`}`;
      });
      await db.exec(`CREATE TABLE public.${ident(table)}(${definitions.join(',')})`);
    }
    for (const constraint of [...LIVE_CATALOG.constraints].sort((a, b) => Number(a.type === 'f') - Number(b.type === 'f'))) {
      if (!['p', 'u', 'f'].includes(constraint.type) || constraint.deferrable || !constraint.validated || /REDACTED/.test(constraint.definition)) throw Error('Unsupported catalog constraint');
      await db.exec(`ALTER TABLE public.${ident(constraint.table)} ADD CONSTRAINT ${ident(constraint.name)} ${constraint.definition}`);
    }
    const constraintIndexes = new Set(LIVE_CATALOG.constraints.filter(c => ['p', 'u'].includes(c.type)).map(c => c.name));
    for (const index of LIVE_CATALOG.indexes) {
      if (!constraintIndexes.has(index.name)) await db.exec(index.definition);
    }
    await db.exec(`CREATE TABLE public.book_reflections(id uuid PRIMARY KEY, cohort_id uuid REFERENCES public.book_cohorts(id));
      REVOKE ALL ON public.book_reflections FROM PUBLIC, anon, authenticated, service_role`);
    if (seed) await seedLiveDb(db);
    return db;
  } catch (error) { await db.close(); throw error; }
}

export async function seedLiveDb(db) {
  await db.query('INSERT INTO members(id,display_name) SELECT unnest($1::uuid[]),unnest($2::text[])', [
    [IDS.host, IDS.reviewer, IDS.reader, IDS.outsider], ['Synthetic host', 'Synthetic reviewer', 'Synthetic reader', 'Synthetic outsider'],
  ]);
  await db.query(`INSERT INTO book_cohorts(id,book_id,thinker_id,title,description,created_by,created_at)
    VALUES ($1,'synthetic-ordinary-book','socrates','Synthetic ordinary salon','Fixture only',$2,'2026-01-01T00:00:00Z'),
           ($3,'synthetic-nullable-salon','synthetic-thinker',NULL,NULL,NULL,NULL)`, [IDS.salon, IDS.host, IDS.orphanCohort]);
  // Orphan member ids and nullable cohort ids are intentional observed schema
  // capabilities. No unobserved members FK is manufactured by this fixture.
  await db.query(`INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2),(NULL,$3)`, [IDS.salon, IDS.host, 'ffffffff-ffff-4fff-8fff-ffffffffffff']);
  await db.query(`INSERT INTO seminar_messages(id,cohort_id,member_id,thinker_id,sender_type,sender_name,content,passage_reference,created_at)
    VALUES ($1,$5,$6,NULL,'member','Synthetic legacy member label','Synthetic historical member text','Synthetic passage A','2026-01-02T00:00:00Z'),
           ($2,$5,NULL,'socrates','thinker','Synthetic legacy thinker label','Synthetic historical thinker text','Synthetic passage B','2026-01-03T00:00:00Z'),
           ($3,$5,NULL,NULL,'member',NULL,'Synthetic unattributed historical text',NULL,NULL),
           ($4,NULL,NULL,'synthetic-thinker','thinker','Synthetic orphan label','Synthetic null-cohort historical text',NULL,'2026-01-04T00:00:00Z')`,
    [IDS.legacyMember, IDS.legacyThinker, IDS.legacyUnattributed, IDS.legacyNullCohort, IDS.salon, IDS.host]);
}

export async function snapshotLegacyRows(db) {
  const result = {};
  for (const table of LIVE_TABLES) {
    const columns = LIVE_CATALOG.columns.filter(c => c.table === table).sort((a, b) => a.number - b.number).map(c => ident(c.name));
    result[table] = (await db.query(`SELECT ${columns.join(',')} FROM public.${ident(table)} ORDER BY id`)).rows;
  }
  return result;
}

// A single PGlite backend proves SQL behavior and transaction rollback, not
// hosted PostgREST availability or concurrent multi-backend lock scheduling.
export async function asRole(db, role, fn) {
  if (!['anon', 'authenticated', 'service_role'].includes(role)) throw Error('Unexpected fixture role');
  return db.transaction(async tx => { await tx.exec(`SET LOCAL ROLE ${role}`); return fn(tx); });
}
export async function rpc(db, name, params = [], role = 'service_role') {
  if (!/^soe_(circle|book_salon)_[a-z_]+$/.test(name)) throw Error('Unexpected fixture RPC');
  return asRole(db, role, async tx => (await tx.query(`SELECT public.${name}(${params.map((_, i) => `$${i + 1}`).join(',')}) AS result`, params)).rows[0].result);
}

export const CIRCLE_SQL_CHAIN = Object.freeze([
  'supabase/migrations/20261027_soe_circles.sql',
  'docs/sql/circle-moderation.sql',
  'docs/sql/circle-message-moderation.sql',
  'docs/sql/circle-participation.sql',
  'docs/sql/circle-reading-programs.sql',
  'docs/sql/circle-passage-posts.sql',
  'docs/sql/circle-indexed-passage-guard-apply.sql',
  'docs/sql/circle-luke-good-samaritan-edition-apply.sql',
  'docs/sql/circle-discussion-threads.sql',
  'docs/sql/circle-discovery-unicode.sql',
  'docs/sql/circle-discovery-search.sql',
]);
export async function installCircleChain(db) {
  await runSql(db, 'docs/sql/circle-legacy-baseline-preflight.sql');
  await runSql(db, 'docs/sql/circle-legacy-baseline-apply.sql');
  for (const path of CIRCLE_SQL_CHAIN) await runSql(db, path);
  return db;
}
