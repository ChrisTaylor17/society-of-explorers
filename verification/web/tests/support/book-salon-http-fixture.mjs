// Reusable actual-route/SQL transport adapted from book-salon-conversation.test.
// Only identity verification and the SDK wire protocol are explicit local doubles.
import assert from 'node:assert/strict';
import { offlineApp } from './offline-app.mjs';
import { createLiveDb, installCircleChain, runSql, rpc, asRole, IDS } from './circle-live-db.mjs';

export function bookSalonRequest(body, { method = body === undefined ? 'GET' : 'POST', headers = {}, raw,
  url = `https://soe.invalid/api/book-salons/${IDS.salon}` } = {}) {
  const request = new Request(url, { method, headers: { origin:new URL(url).origin, 'content-type':'application/json', ...headers },
    ...(method === 'POST' ? { body:raw ?? JSON.stringify(body), duplex:'half' } : {}) });
  request.cookies = { get:() => undefined };
  return request;
}

export function salonRouteFixture(db) {
  const app = offlineApp(), calls = [];
  let actor = IDS.host;
  app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember:async () => {
    calls.push({kind:'identity',actor});
    if (!actor) return null;
    const selected = actor;
    const member = await asRole(db,'service_role',async tx => (await tx.query('SELECT id,display_name FROM members WHERE id=$1',[selected])).rows[0]);
    return member ? {memberId:selected,member,auth:{provider:'wallet',subject:selected}} : null;
  } }));
  app.setMock('@/lib/supabase/admin', () => ({getSupabaseAdmin:() => ({
    from(table) {
      assert.ok(['book_cohorts','book_cohort_members'].includes(table));
      let columns, filters=[];
      const query = {
        select(value) { columns=value;assert.match(columns,/^[a-z_,]+$/);return query; },
        eq(key,value) { assert.ok(['id','cohort_id','member_id'].includes(key));filters.push([key,value]);return query; },
        async single() { return query.maybeSingle(); },
        async maybeSingle() {
          calls.push({kind:'read',table,columns,filters:structuredClone(filters)});
          assert.ok(filters.length);
          try {
            const rows=await asRole(db,'service_role',tx=>tx.query(`SELECT ${columns} FROM ${table} WHERE ${filters.map(([key],i)=>`${key}=$${i+1}`).join(' AND ')}`,filters.map(([,value])=>value)));
            return rows.rows.length<=1 ? {data:rows.rows[0]??null,error:null} : {data:null,error:{code:'SYNTHETIC_CARDINALITY'}};
          } catch(error) { return {data:null,error:{code:error.code}}; }
        },
      };return query;
    },
    async rpc(name,args) {
      assert.ok(['soe_book_salon_messages_read','soe_book_salon_messages_post','soe_circle_messages_read','soe_circle_messages_post'].includes(name));
      calls.push({kind:'rpc',name,args:structuredClone(args)});
      try { return {data:await rpc(db,name,Object.values(args)),error:null}; }
      catch(error) { return {data:null,error:{code:error.code,message:'PRIVATE_SQL_DETAILS'}}; }
    },
  })}));
  return { app,calls,route:app.load('app/api/book-salons/[cohortId]/route.ts'),memberRoute:app.load('app/api/auth/member/route.ts'),
    setActor(value) { assert.ok(value===null || Object.values(IDS).includes(value));actor=value; } };
}

export async function createBookSalonHttpFixture(t, { salonId=IDS.salon, actorBMembership=false } = {}) {
  const db=await createLiveDb();
  if(t?.after)t.after(()=>db.close());
  try {
    if(salonId!==IDS.salon) {
      assert.match(salonId,/^[a-f0-9-]{36}$/);
      // The component's existing test-only fixed route adapter selects this
      // explicitly additional synthetic salon. No response IDs are rewritten.
      await db.query(`INSERT INTO book_cohorts(id,book_id,thinker_id,title,description,created_by)
        SELECT $1,book_id,thinker_id,title,description,created_by FROM book_cohorts WHERE id=$2`,[salonId,IDS.salon]);
      await db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)',[salonId,IDS.host]);
      await db.query(`INSERT INTO seminar_messages(cohort_id,member_id,thinker_id,sender_type,sender_name,content,passage_reference,created_at)
        SELECT $1,member_id,thinker_id,sender_type,sender_name,content,passage_reference,created_at FROM seminar_messages WHERE cohort_id=$2`,[salonId,IDS.salon]);
    }
    if(actorBMembership)await db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)',[salonId,IDS.reviewer]);
    await installCircleChain(db);
    // Profile publication is a separate verified migration prerequisite. This
    // minimal members stub has only the fields the salon SQL reads.
    await db.exec('ALTER TABLE members ENABLE ROW LEVEL SECURITY');
    await runSql(db,'docs/sql/book-salon-conversation.sql');
    return {db,salonId,...salonRouteFixture(db)};
  } catch(error) { if(!t?.after)await db.close();throw error; }
}
