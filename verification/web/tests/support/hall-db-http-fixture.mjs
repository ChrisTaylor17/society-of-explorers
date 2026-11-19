// Actual cached Supabase URL builder → a narrow local SQL transport. This does
// not emulate a hosted PostgREST server or perform provider authentication.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { offlineApp } from './offline-app.mjs';
import { createArtifactDb, runArtifactSql, asRole } from './artifact-containment-fixture.mjs';
const require=createRequire(new URL('../../../../package.json',import.meta.url));
const {createClient}=require('@supabase/supabase-js');
const SELECT='id,thinker_id,title,description,philosophical_note,is_public';

// Bind an already-created local database without owning its lifecycle or DDL.
export function bindHallDatabase(db) {
    const app=offlineApp(),requests=[],queries=[];
    let authCalls=0;
    for(const name of ['@/lib/getAuthenticatedMember','@/lib/auth/getSession','@/lib/supabase/server'])app.setMock(name,()=>{
      authCalls++;throw Error('Hall must not import authentication');
    });
    async function transport(input,init) {
      const url=new URL(typeof input==='string'?input:input.url),params=url.searchParams;
      assert.equal(url.origin,'https://hall-database-fixture.invalid');
      assert.equal(url.pathname,'/rest/v1/artifacts');assert.equal(init.method,'GET');
      assert.equal(params.get('select'),SELECT);assert.equal(params.get('is_public'),'eq.true');
      assert.equal(params.get('order'),'created_at.desc.nullslast,id.desc');assert.equal(params.get('limit'),'49');
      assert.ok([...params.keys()].every(key=>['select','is_public','thinker_id','order','limit'].includes(key)));
      const thinker=params.get('thinker_id');
      if(thinker)assert.match(thinker,/^eq\.(socrates|plato|nietzsche|aurelius|einstein|jobs)$/);
      requests.push({method:init.method,select:params.get('select'),publication:params.get('is_public'),thinker,
        order:params.get('order'),limit:params.get('limit'),abortSignalPresent:init.signal instanceof AbortSignal});
      const values=[true],predicates=['is_public=$1'];
      if(thinker){values.push(thinker.slice(3));predicates.push('thinker_id=$2');}
      values.push(Number(params.get('limit')));
      const sql=`SELECT ${SELECT} FROM public.artifacts WHERE ${predicates.join(' AND ')} ORDER BY created_at DESC NULLS LAST,id DESC LIMIT $${values.length}`;
      queries.push(sql);
      try {
        if(init.signal.aborted)throw Object.assign(Error('Synthetic query aborted'),{code:'SYNTHETIC_ABORT'});
        const rows=await asRole(db,'service_role',tx=>tx.query(sql,values));
        return Response.json(rows.rows);
      }catch(error){return Response.json({code:error.code,message:'PRIVATE_SQL_DETAILS artifacts schema service_role'}, {status:400});}
    }
    const client=createClient('https://hall-database-fixture.invalid','NONISSUED_SYNTHETIC_SERVICE_KEY',{
      accessToken:async()=> 'NONISSUED_SYNTHETIC_SERVICE_KEY',global:{fetch:transport},
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    });
    app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>client}));
    const route=app.load('app/api/hall/route.ts');
    return {db,app,requests,queries,route,get authCalls(){return authCalls;},
      get:(query='')=>route.GET(new Request('https://soe.invalid/api/hall'+query))};
}

export async function createHallDatabaseFixture(t,{seed=false,contain=true}={}) {
  const db=await createArtifactDb({seed});
  if(t?.after)t.after(()=>db.close());
  try {
    if(contain)await runArtifactSql(db,'docs/sql/artifact-containment-apply.sql');
    return bindHallDatabase(db);
  }catch(error){if(!t?.after)await db.close();throw error;}
}
