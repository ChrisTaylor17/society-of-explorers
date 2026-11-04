// Synthetic offline rehearsal of sanitized catalog metadata, not a database backup.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
export const HALL_CATALOG_SHA256='11a86194c0ebbef4cb2454aed760e6e64bd3d3896298469514d7fff02caed8e4';
export const HALL_SUPPLEMENT_SHA256='0a1e2bf6b9c67666949906a154733e50b5da97249551521913560eac8f09902e';
const source=await readFile(new URL('../fixtures/hall-catalog-2026-11-04.json',import.meta.url),'utf8');
const supplementSource=await readFile(new URL('../fixtures/hall-catalog-supplement-2026-11-04.json',import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
if(hash(source)!==HALL_CATALOG_SHA256||hash(supplementSource)!==HALL_SUPPLEMENT_SHA256)throw Error('Hall metadata receipt changed; review fixture fidelity');
export const HALL_CATALOG=JSON.parse(source).data;
export const HALL_SUPPLEMENT=JSON.parse(supplementSource).data;
export const FIXTURE_EXCEPTIONS=Object.freeze({
 theme:{observedDefaultMD5:'f3db357cf4f4a03883484fa3281a056c',syntheticDefault:'\'{"syntheticFixtureOnly":true}\'::jsonb',
  reason:'Unknown live JSON default is represented by a marked synthetic default; raw literal/redaction marker is never executed or inferred.'},
 members:'Only id and display_name are synthetic prerequisite columns; no full members schema/account data is represented.',
 externalChildren:'nft_mints and artifact_merch contain synthetic id/artifact_id only. Observed incoming FK actions are reproduced; their actual child column names, full schemas, rows and grants were not collected.',
 defaults:'After target objects exist, synthetic broad new-table default grants stress owner-only receipt creation; these are not a Hall-specific observation of global/default ACLs.',
 runtime:'Synthetic local postgres superuser is used because PGlite starts with a different administrative role; hosted Supabase identity/runtime behavior is not represented.',
});
export const ARTIFACT_IDS=Object.freeze({
 member:'11111111-1111-4111-8111-111111111111',
 other:'22222222-2222-4222-8222-222222222222',
 public:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 private:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
 nullOwner:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
 dependency:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
});
const knownTypes=new Set(['uuid','text','jsonb','boolean','timestamp with time zone']);
const privileges=new Set(['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']);
const identifier=value=>{
 if(!/^[a-z_][a-z0-9_]*$/.test(value))throw Error('Unexpected fixture identifier');
 return '"'+value+'"';
};
export async function runArtifactSql(db,path){
 if(!/^docs\/sql\/artifact-containment-(preflight|apply|rollback)\.sql$/.test(path))throw Error('Unexpected artifact SQL path');
 try{return await db.exec(await readFile(new URL(path,new URL('../../../../',import.meta.url)),'utf8'));}
 catch(error){await db.exec('ROLLBACK');throw error;}
}
export async function createArtifactDb({seed=true,broadReceiptDefaults=true}={}){
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec('CREATE ROLE postgres NOLOGIN SUPERUSER;CREATE ROLE anon NOLOGIN INHERIT;CREATE ROLE authenticated NOLOGIN INHERIT;CREATE ROLE service_role NOLOGIN INHERIT BYPASSRLS;CREATE ROLE unrelated_reader NOLOGIN;SET ROLE postgres;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role,unrelated_reader;CREATE TABLE public.members(id uuid PRIMARY KEY,display_name text);');
  const defaults=new Map(HALL_SUPPLEMENT.defaults.map(d=>[d.column,d]));
  const columns=HALL_CATALOG.columns.map(c=>{
   if(!knownTypes.has(c.type))throw Error('Unsupported Hall column type');
   const entry=defaults.get(c.name);let expression;
   if(entry){
    if(entry.md5!==c.default_md5)throw Error('Default metadata receipts disagree');
    if(c.name==='theme')expression=FIXTURE_EXCEPTIONS.theme.syntheticDefault;
    else{
     if(!['gen_random_uuid()','true','now()'].includes(entry.expression)||createHash('md5').update(entry.expression).digest('hex')!==entry.md5)throw Error('Unreviewed Hall default');
     expression=entry.expression;
    }
   }else if(c.default_md5!==null)throw Error('Missing Hall default metadata');
   return identifier(c.name)+' '+c.type+(c.not_null?' NOT NULL':'')+(expression===undefined?'':' DEFAULT '+expression);
  });
  await db.exec('CREATE TABLE public.artifacts('+columns.join(',')+')');
  for(const c of HALL_CATALOG.constraints.filter(c=>c.type==='p'))await db.exec('ALTER TABLE public.artifacts ADD CONSTRAINT '+identifier(c.name)+' '+c.definition);
  for(const c of HALL_CATALOG.constraints.filter(c=>c.type==='f'))await db.exec('ALTER TABLE public.artifacts ADD CONSTRAINT '+identifier(c.name)+' '+c.definition);
  if(HALL_CATALOG.table.rls)await db.exec('ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY');
  if(HALL_CATALOG.table.force_rls)await db.exec('ALTER TABLE public.artifacts FORCE ROW LEVEL SECURITY');
  if(JSON.stringify(HALL_CATALOG.policies)!==JSON.stringify([
   {name:'Members insert own artifacts',check:'true',roles:['public'],using:null,command:'INSERT',permissive:'PERMISSIVE'},
   {name:'Public artifacts visible to all',check:null,roles:['public'],using:'(is_public = true)',command:'SELECT',permissive:'PERMISSIVE'},
  ]))throw Error('Unreviewed Hall policies');
  await db.exec('CREATE POLICY "Members insert own artifacts" ON public.artifacts FOR INSERT TO PUBLIC WITH CHECK(true);CREATE POLICY "Public artifacts visible to all" ON public.artifacts FOR SELECT TO PUBLIC USING(is_public=true);');
  const groups=new Map();
  for(const a of HALL_SUPPLEMENT.acl){
   if(a.grantor!=='postgres'||a.grantable||!privileges.has(a.privilege)||!['postgres','anon','authenticated','service_role'].includes(a.grantee))throw Error('Unreviewed Hall table ACL');
   groups.set(a.grantee,[...(groups.get(a.grantee)??[]),a.privilege]);
  }
  for(const[role,items]of groups)await db.exec('GRANT '+items.join(',')+' ON TABLE public.artifacts TO '+identifier(role));
  // Minimal declared external stubs reproduce all six target RI trigger semantics.
  await db.exec('CREATE TABLE public.nft_mints(id uuid PRIMARY KEY,artifact_id uuid REFERENCES public.artifacts(id) ON DELETE CASCADE);CREATE TABLE public.artifact_merch(id uuid PRIMARY KEY,artifact_id uuid REFERENCES public.artifacts(id));');
  await db.exec('REVOKE ALL ON public.members,public.nft_mints,public.artifact_merch FROM PUBLIC,anon,authenticated,service_role;');
  // Stress default privilege scrubbing without changing observed artifact ACLs.
  if(broadReceiptDefaults)await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role,unrelated_reader;');
  if(seed)await seedArtifactDb(db);
  return db;
 }catch(error){await db.close();throw error;}
}
export async function seedArtifactDb(db){
 await db.query('INSERT INTO public.members(id,display_name) VALUES($1,$2),($3,$4)',[ARTIFACT_IDS.member,'Synthetic member',ARTIFACT_IDS.other,'Synthetic other']);
 await db.query('INSERT INTO public.artifacts(id,member_id,thinker_id,title,description,philosophical_note,prompt_used,image_url,thumbnail_url,conversation_context,is_public) VALUES($1,$5,\'socrates\',\'Synthetic public artifact\',\'Synthetic public description\',\'Synthetic public philosophy\',\'PRIVATE_SYNTHETIC_PROMPT\',\'https://media.soe.invalid/public.png\',NULL,\'PRIVATE_SYNTHETIC_CONTEXT\',true),($2,$5,\'socrates\',\'Synthetic private artifact\',NULL,NULL,\'PRIVATE_SYNTHETIC_PRIVATE_PROMPT\',NULL,NULL,\'PRIVATE_SYNTHETIC_PRIVATE_CONTEXT\',false),($3,NULL,\'synthetic-thinker\',\'Synthetic ownerless artifact\',NULL,NULL,NULL,NULL,NULL,NULL,NULL),($4,$6,\'socrates\',\'Synthetic dependent artifact\',NULL,NULL,NULL,NULL,NULL,NULL,false)',
  [ARTIFACT_IDS.public,ARTIFACT_IDS.private,ARTIFACT_IDS.nullOwner,ARTIFACT_IDS.dependency,ARTIFACT_IDS.member,ARTIFACT_IDS.other]);
 await db.query('INSERT INTO public.nft_mints(id,artifact_id) VALUES($1,$2)',[ARTIFACT_IDS.member,ARTIFACT_IDS.dependency]);
 await db.query('INSERT INTO public.artifact_merch(id,artifact_id) VALUES($1,$2)',[ARTIFACT_IDS.member,ARTIFACT_IDS.dependency]);
}
export async function asRole(db,role,fn){
 if(!['anon','authenticated','service_role','unrelated_reader'].includes(role))throw Error('Unexpected fixture role');
 return db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+identifier(role));return fn(tx);});
}
export async function snapshotArtifactRows(db){
 return (await db.query('SELECT '+HALL_CATALOG.columns.map(c=>identifier(c.name)).join(',')+' FROM public.artifacts ORDER BY id')).rows;
}
