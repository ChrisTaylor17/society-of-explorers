import { readFile } from 'node:fs/promises';
import { PGlite } from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
const ROOT = new URL('../../../../', import.meta.url), SQL = {};
for (const name of ['preflight','apply','rollback']) SQL[name] = await readFile(new URL(`docs/sql/member-profile-${name}.sql`, ROOT), 'utf8');
export const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
export async function profileDb(t,{contained=true}={}) {
 const db=new PGlite();await db.waitReady;t.after(()=>db.close());
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
 CREATE TABLE members(id uuid PRIMARY KEY,supabase_auth_id uuid,display_name text NOT NULL,bio text,discipline text,skills text[],project_description text,seeking text,philosophy text,tier text,exp_tokens integer,email text);
 ALTER TABLE members ENABLE ROW LEVEL SECURITY;CREATE POLICY old_public ON members FOR SELECT USING(true);
 GRANT SELECT,INSERT,UPDATE,DELETE ON members TO service_role;`);
 if(!contained)await db.exec('GRANT SELECT ON members TO anon');
 await db.query("INSERT INTO members(id,display_name,bio,skills,tier,exp_tokens,email) VALUES($1,'Existing A','KEEP_OMITTED_BIO',ARRAY['KEEP_OMITTED_SKILL'],'protected-tier',7,'PRIVATE_SYNTHETIC_EMAIL'),($2,'Existing B',NULL,NULL,'free',3,NULL)",[A,B]);
 return db;
}
export async function runProfileSql(db,name){try{return await db.exec(SQL[name]);}catch(error){await db.exec('ROLLBACK');throw error;}}
export async function updateProfile(db,actor,revision,patch){await db.exec('SET ROLE service_role');try{return(await db.query('SELECT public.soe_member_profile_update($1,$2,$3::jsonb) value',[actor,revision,JSON.stringify(patch)])).rows[0].value;}finally{await db.exec('RESET ROLE');}}
