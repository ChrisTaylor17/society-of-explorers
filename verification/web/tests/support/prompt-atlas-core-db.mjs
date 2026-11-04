import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
import { pgcrypto } from '../../tooling/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js';

const ROOT = new URL('../../../../', import.meta.url);
const paths = {
  atlas: 'prompts-mvp/supabase/migrations/202606180001_prompt_atlas.sql',
  corePreflight: 'docs/sql/first-release-core-containment-preflight.sql',
  coreApply: 'docs/sql/first-release-core-containment-apply.sql',
  identityPreflight: 'docs/sql/member-identity-preflight.sql',
  identityApply: 'docs/sql/member-identity-unique.sql',
};
const reviewedHashes = {
  atlas: '21ea7ff69810fda715aa3527a2538d419e4265235243c9e5b01d539a60085743',
  corePreflight: '17db6ff8b73d65de0b3d87fb60fc43a84d84437341a062cb2e195f078a2f34d1',
  coreApply: 'b88ffa86bb265f467dbf9fe9d7ba17ce246df8a8d2618db86ade8a6401fb1b1b',
  identityPreflight: '30d7709378c54be2a7259ff0d5cc04b97bf04a79315f72cf9e255ffde7d29a21',
  identityApply: '3d970b0c70ee47e6f073b37251b59a406a9211e03dafda6ccdc6b6ac4a97d4e8',
};
export const SQL = {}, sourceManifest = {};
for (const [name, path] of Object.entries(paths)) {
  const file = new URL(path, ROOT), metadata = await stat(file);
  // Do not hydrate an offloaded source or accept a silently changed reviewed SQL.
  assert.ok(metadata.size > 0 && metadata.blocks > 0, `${path} must already be materialized`);
  const bytes = await readFile(file), sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, reviewedHashes[name], `${path} changed; review before updating the fixture`);
  SQL[name] = bytes.toString('utf8');
  sourceManifest[name] = { path, sha256, bytes: bytes.length };
}
const helperMatch = SQL.atlas.match(/create or replace function public\.current_prompt_member_id\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/);
assert.ok(helperMatch, 'exact archived helper definition must be present');
export const helperSource = {
  characters: helperMatch[1].length,
  md5: createHash('md5').update(helperMatch[1]).digest('hex'),
};
assert.deepEqual(helperSource, { characters: 84, md5: '182a380be15d0befdd53a047060dd37b' });

export const CORE_TABLES = ['members', 'reading_progress', 'book_highlights', 'great_books_progress', 'great_books_highlights', 'book_reflections', 'thinker_memory'];
export const ATLAS_TABLES = ['prompts', 'prompt_favorites', 'prompt_votes', 'prompt_entitlements', 'prompt_runs'];
export const IDS = {
  memberA: '11111111-1111-4111-8111-111111111111',
  memberB: '22222222-2222-4222-8222-222222222222',
  walletA: '33333333-3333-4333-8333-333333333333',
  walletB: '44444444-4444-4444-8444-444444444444',
  subjectA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  subjectB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  unknownSubject: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  published: '50000000-0000-4000-8000-000000000001',
  privateA: '50000000-0000-4000-8000-000000000002',
  privateB: '50000000-0000-4000-8000-000000000003',
  unlistedA: '50000000-0000-4000-8000-000000000004',
  futureB: '50000000-0000-4000-8000-000000000005',
  unpublishedB: '50000000-0000-4000-8000-000000000006',
  runA: '60000000-0000-4000-8000-000000000001',
  runB: '60000000-0000-4000-8000-000000000002',
  created: '70000000-0000-4000-8000-000000000001',
};

export async function runSource(db, name) {
  try { return await db.exec(SQL[name]); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}

// Local SET ROLE + setting is an explicit auth.uid() test double. It does NOT
// verify a JWT, Supabase session, wallet, device, provider, or production role.
export async function asRole(db, role, subject, query, params = []) {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [subject ?? '']);
  await db.exec(`SET ROLE ${role}`);
  try { return await db.query(query, params); }
  finally {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
  }
}

export async function fixture(t, { contained = true } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.waitReady;
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    -- These seven minimal tables are labeled prerequisites, not recovered DDL.
    CREATE TABLE public.members(
      id uuid PRIMARY KEY, supabase_auth_id uuid, display_name text,
      email text, private_text text
    );
    ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "SYNTHETIC permissive legacy member read" ON public.members
      FOR SELECT USING(true);
  `);
  for (const table of CORE_TABLES.slice(1)) await db.exec(`CREATE TABLE public.${table}(id uuid PRIMARY KEY,member_id uuid,private_text text);`);
  await db.exec(`GRANT ALL ON ${CORE_TABLES.join(',')} TO anon,authenticated,service_role;`);
  await db.query('INSERT INTO members VALUES($1,$2,$3,$4,$5),($6,$7,$8,$9,$10),($11,NULL,$12,NULL,NULL),($13,NULL,$14,NULL,NULL)', [
    IDS.memberA, IDS.subjectA, 'SYNTHETIC A', 'FICTIONAL_PRIVATE_A', 'SYNTHETIC_PRIVATE_A',
    IDS.memberB, IDS.subjectB, 'SYNTHETIC B', 'FICTIONAL_PRIVATE_B', 'SYNTHETIC_PRIVATE_B',
    IDS.walletA, 'SYNTHETIC NULL SUBJECT A', IDS.walletB, 'SYNTHETIC NULL SUBJECT B',
  ]);
  for (const table of CORE_TABLES.slice(1)) await db.query(`INSERT INTO ${table} VALUES($1,$1,$2),($3,$3,$4)`, [IDS.memberA, 'SYNTHETIC_PRIVATE_A', IDS.memberB, 'SYNTHETIC_PRIVATE_B']);

  // The COMPLETE reviewed migration executes byte-for-byte, including pgcrypto,
  // five tables, trigger/RPC definitions, helper, eight policies and invoker view.
  await runSource(db, 'atlas');
  // The archived migration does not establish base-table grants. These explicit
  // fixture grants let actual RLS exercise each policy; no live ACL equivalence.
  await db.exec(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${ATLAS_TABLES.join(',')} TO anon,authenticated,service_role;`);
  // The archived view grants only anon/authenticated SELECT; the service read
  // grant below is also a labeled fixture prerequisite, not migration output.
  await db.exec('GRANT SELECT ON prompt_community_leaderboard TO service_role');
  for (const [id, title, owner, visibility, published] of [
    [IDS.published, 'Published public fixture', IDS.memberB, 'public', 'past'],
    [IDS.privateA, 'Private fixture A', IDS.memberA, 'private', null],
    [IDS.privateB, 'Private fixture B', IDS.memberB, 'private', null],
    [IDS.unlistedA, 'Unlisted fixture A', IDS.memberA, 'unlisted', 'past'],
    [IDS.futureB, 'Future fixture B', IDS.memberB, 'public', 'future'],
    [IDS.unpublishedB, 'Unpublished fixture B', IDS.memberB, 'public', null],
  ]) {
    await db.query(`INSERT INTO prompts(id,title,description,category,prompt_text,created_by,slug,visibility,published_at)
      VALUES($1,$2,'SYNTHETIC description only','think','SYNTHETIC prompt text only',$3,$4,$5,
      CASE $6::text WHEN 'past' THEN now()-interval '1 day' WHEN 'future' THEN now()+interval '1 day' ELSE NULL END)`, [id,title,owner,id,visibility,published]);
  }
  for (const table of ['prompt_favorites', 'prompt_votes']) await db.query(`INSERT INTO ${table}(member_id,prompt_id) VALUES($1,$3),($2,$3)`, [IDS.memberA,IDS.memberB,IDS.published]);
  await db.query(`INSERT INTO prompt_entitlements(member_id,stripe_customer_id) VALUES($1,'FICTIONAL_ENTITLEMENT_A'),($2,'FICTIONAL_ENTITLEMENT_B')`, [IDS.memberA,IDS.memberB]);
  await db.query(`INSERT INTO prompt_runs(id,member_id,prompt_id,input_hash) VALUES($1,$2,$5,$6),($3,$4,$5,$6)`, [IDS.runA,IDS.memberA,IDS.runB,IDS.memberB,IDS.published,'0'.repeat(64)]);
  if (contained) await contain(db);
  return db;
}

export async function contain(db) {
  // Identity index is installed first, so the containment receipt fingerprints it.
  await runSource(db, 'identityPreflight');
  await runSource(db, 'identityApply');
  await runSource(db, 'corePreflight');
  await runSource(db, 'coreApply');
}

export async function atlasCatalog(db) {
  return {
    helper: (await db.query(`SELECT p.oid,md5(p.prosrc) body_md5,length(p.prosrc) body_characters,
      p.prosecdef,p.provolatile,p.proconfig,p.proacl::text,pg_get_userbyid(p.proowner) owner
      FROM pg_proc p WHERE p.oid='public.current_prompt_member_id()'::regprocedure`)).rows,
    policies: (await db.query(`SELECT p.oid,c.relname,p.polname,p.polcmd,p.polroles::text,
      pg_get_expr(p.polqual,p.polrelid) qual,pg_get_expr(p.polwithcheck,p.polrelid) check_expr
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      WHERE c.relname=ANY($1::text[]) ORDER BY c.relname,p.polname`, [ATLAS_TABLES])).rows,
    view: (await db.query(`SELECT c.oid,c.reloptions,c.relacl::text,pg_get_viewdef(c.oid) definition
      FROM pg_class c WHERE c.oid='public.prompt_community_leaderboard'::regclass`)).rows,
  };
}

export async function atlasDigests(db) {
  return {
    postgres: (await db.query('SELECT version() version')).rows[0].version,
    helper: (await db.query(`SELECT md5(prosrc) body_md5,length(prosrc) body_characters
      FROM pg_proc WHERE oid='public.current_prompt_member_id()'::regprocedure`)).rows[0],
    policies: (await db.query(`SELECT n.nspname schema,c.relname "table",p.polname name,
      p.polcmd command,p.polpermissive permissive,p.polroles::text roles,
      md5(pg_get_expr(p.polqual,p.polrelid)) using_md5,
      md5(pg_get_expr(p.polwithcheck,p.polrelid)) check_md5,
      c.relrowsecurity rls,c.relforcerowsecurity force_rls
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_policy'::regclass
        AND d.objid=p.oid AND d.refclassid='pg_proc'::regclass
        AND d.refobjid='public.current_prompt_member_id()'::regprocedure)
      ORDER BY c.relname,p.polname`)).rows,
    leaderboard: (await db.query(`SELECT n.nspname schema,c.relname name,c.relkind kind,
      pg_get_userbyid(c.relowner) owner,c.reloptions options,
      md5(pg_get_viewdef(c.oid,false)) definition_md5
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.oid='public.prompt_community_leaderboard'::regclass`)).rows[0],
  };
}
