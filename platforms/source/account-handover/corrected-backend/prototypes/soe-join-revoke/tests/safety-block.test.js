import assert from "node:assert/strict";
import { test } from "node:test";
import { payloadHash } from "../src/hash.js";
import { createWorld } from "../src/world.js";
import { boot, signIn, write, request, assertNoRelay, PLAN_ID } from "./helpers.js";

async function pair(url, visible = false) {
  const ada = await signIn(url, "ada"), jules = await signIn(url, "jules"), mina = await signIn(url, "mina");
  const joined = await write(url, jules.token, "join", "jules", "join", {planId:PLAN_ID});
  assert.equal(joined.body.status,"committed");
  let guestGrant, hostGrant;
  if(visible) {
    assert.equal((await write(url,ada.token,"accept","ada","accept",{planId:PLAN_ID,requesterId:"jules"})).body.status,"committed");
    guestGrant=await write(url,jules.token,"grant","jules","grant-j",{planId:PLAN_ID,otherId:"ada"});
    hostGrant=await write(url,ada.token,"grant","ada","grant-a",{planId:PLAN_ID,otherId:"jules"});
    assert.equal((await request(url,`/api/plans/${PLAN_ID}`,{token:jules.token})).body.data.contactAccess,"visible");
  }
  return {ada,jules,mina,guestGrant,hostGrant};
}
async function deniedPair(url,p) {
  for(const suffix of ["","/visibility"]) {
    const guest=await request(url,`/api/plans/${PLAN_ID}${suffix}`,{token:p.jules.token});
    assert.equal(guest.status,403);assertNoRelay(guest.body);
    const host=await request(url,`/api/plans/${PLAN_ID}${suffix}`,{token:p.ada.token});
    assert.equal(host.status,200);assertNoRelay(host.body);
  }
  const cards=await request(url,"/api/plans",{token:p.jules.token});
  assert.deepEqual(cards.body.data,[]);assertNoRelay(cards.body);
}
for(const blocker of ["ada","jules"]) {
  test(`${blocker} block before any join prevents interaction in either direction`,async()=>{
    const h=await boot();try {
      const ada=await signIn(h.url,"ada"),jules=await signIn(h.url,"jules");const sessions={ada,jules};
      const result=await write(h.url,sessions[blocker].token,"block",blocker,"block",{otherId:blocker==="ada"?"jules":"ada"});
      assert.equal(result.status,200);assert.equal(result.body.status,"committed");assert.match(result.body.data.limit,/cannot recall copies already returned/);assertNoRelay(result.body);
      const join=await write(h.url,jules.token,"join","jules","late-join",{planId:PLAN_ID});assert.equal(join.status,403);
      await deniedPair(h.url,{ada,jules});
    }finally{await h.stop();}
  });
  test(`${blocker} block withdraws pending invitation and frees the seat without disabling unrelated users`,async()=>{
    const h=await boot();try {
      const p=await pair(h.url);const result=await write(h.url,p[blocker].token,"block",blocker,"block",{otherId:blocker==="ada"?"jules":"ada"});
      assert.equal(result.body.status,"committed");
      const accept=await write(h.url,p.ada.token,"accept","ada","late-accept",{planId:PLAN_ID,requesterId:"jules"});assert.equal(accept.status,403);
      await deniedPair(h.url,p);
      const mina=await write(h.url,p.mina.token,"join","mina","mina-join",{planId:PLAN_ID});assert.equal(mina.body.status,"committed");
      assert.equal((await write(h.url,p.ada.token,"accept","ada","mina-accept",{planId:PLAN_ID,requesterId:"mina"})).body.status,"committed");
      assertNoRelay((await request(h.url,`/api/plans/${PLAN_ID}`,{token:p.mina.token})).body);
      await write(h.url,p.mina.token,"grant","mina","mina-grant",{planId:PLAN_ID,otherId:"ada"});
      await write(h.url,p.ada.token,"grant","ada","new-host-grant",{planId:PLAN_ID,otherId:"mina"});
      assert.equal((await request(h.url,`/api/plans/${PLAN_ID}`,{token:p.mina.token})).body.data.contactAccess,"visible");
      assert.equal((await request(h.url,`/api/plans/${PLAN_ID}`,{token:p.jules.token})).status,403);
    }finally{await h.stop();}
  });
  test(`${blocker} block after mutual consent revokes both directions and denies fresh grants`,async()=>{
    const h=await boot();try {
      const p=await pair(h.url,true);const result=await write(h.url,p[blocker].token,"block",blocker,"block",{otherId:blocker==="ada"?"jules":"ada"});
      assert.equal(result.body.status,"committed");await deniedPair(h.url,p);
      for(const [actor,other] of [["ada","jules"],["jules","ada"]]) {
        const grant=await write(h.url,p[actor].token,"grant",actor,"late-grant",{planId:PLAN_ID,otherId:other});assert.equal(grant.status,403);assertNoRelay(grant.body);
      }
      const ownRevoke=await write(h.url,p.jules.token,"revoke","jules","after-block",{permissionId:p.guestGrant.body.data.permissionId});
      assert.equal(ownRevoke.status,403);assert.match(ownRevoke.body.error,/already revoked/);
      assertNoRelay((await request(h.url,`/api/plans/${PLAN_ID}`,{token:p.mina.token})).body);
    }finally{await h.stop();}
  });
}

test("block authenticates actor and validates its exact body without cross-user mutation",async()=>{
  const h=await boot();try {
    const p=await pair(h.url,true);
    assert.equal((await write(h.url,"","block","jules","anon",{otherId:"ada"})).status,401);
    assert.equal((await write(h.url,p.mina.token,"block","jules","spoof",{otherId:"ada"})).status,403);
    for(const [i,body] of [{},{otherId:"jules"},{otherId:"unknown"},{otherId:null},{otherId:["ada"]},{otherId:{id:"ada"}},{otherId:"ada",blockerId:"mina"}].entries()) {
      const denied=await write(h.url,p.jules.token,"block","jules",`invalid-${i}`,body);assert.equal(denied.status,403);assertNoRelay(denied.body);
    }
    assert.equal((await request(h.url,`/api/plans/${PLAN_ID}`,{token:p.jules.token})).body.data.contactAccess,"visible");
    h.world.setNow(()=>Date.now()+8*86400000);
    assert.equal((await write(h.url,p.jules.token,"block","jules","expired",{otherId:"ada"})).status,401);
  }finally{await h.stop();}
});

test("block retries and private lookups are idempotent; historic receipts never restore contact",async()=>{
  const h=await boot();try {
    const p=await pair(h.url,true);const body={otherId:"ada"};
    const first=await write(h.url,p.jules.token,"block","jules","same",body);
    assert.equal(first.body.status,"committed");
    assert.deepEqual((await write(h.url,p.jules.token,"block","jules","same",body)).body,first.body);
    assert.deepEqual((await write(h.url,p.jules.token,"block","jules","new-key",body)).body,first.body);
    assert.equal((await write(h.url,p.jules.token,"block","jules","same",{otherId:"mina"})).status,409);
    const lookup={personId:"jules",endpoint:"block",key:"same",payloadHash:payloadHash(body)};
    const mine=await request(h.url,"/api/lookup",{method:"POST",token:p.jules.token,body:lookup});assert.equal(mine.body.status,"recorded");assert.deepEqual(mine.body.result,first.body);
    assert.equal((await request(h.url,"/api/lookup",{method:"POST",token:p.mina.token,body:lookup})).status,409);
    assert.equal((await request(h.url,"/api/lookup",{method:"POST",token:p.mina.token,body:{...lookup,personId:"mina"}})).body.status,"absent");
    for(const [actor,endpoint,key,body] of [["jules","join","join",{planId:PLAN_ID}],["ada","accept","accept",{planId:PLAN_ID,requesterId:"jules"}],["jules","grant","grant-j",{planId:PLAN_ID,otherId:"ada"}]]) {
      const replay=await write(h.url,p[actor].token,endpoint,actor,key,body);assert.equal(replay.body.status,"committed");assertNoRelay(replay.body);
    }
    await deniedPair(h.url,p);
    assert.equal((await write(h.url,p.mina.token,"join","mina","mina-unaffected",{planId:PLAN_ID})).body.status,"committed");
  }finally{await h.stop();}
});

for(const loss of ["drop-before","drop-after"])test(`block ${loss} keeps outcome truthful and lookup does not resend`,async()=>{
  const h=await boot();try {
    const p=await pair(h.url,true);const body={otherId:"ada"};
    const result=await write(h.url,p.jules.token,"block","jules","lost",body,loss);assert.equal(result.body.status,"ambiguous");
    const found=await request(h.url,"/api/lookup",{method:"POST",token:p.jules.token,body:{personId:"jules",endpoint:"block",key:"lost",payloadHash:payloadHash(body)}});
    assert.equal(found.body.status,loss==="drop-after"?"recorded":"absent");
    if(loss==="drop-after")await deniedPair(h.url,p);
    else assert.equal((await request(h.url,`/api/plans/${PLAN_ID}`,{token:p.jules.token})).body.data.contactAccess,"visible");
  }finally{await h.stop();}
});

async function orderedWorld(stage) {
  const w=createWorld();const ada=await w.signIn("ada","synthetic-ada"),jules=await w.signIn("jules","synthetic-jules"),mina=await w.signIn("mina","synthetic-mina");
  let serial=0;
  const mutate=(actor,endpoint,body)=>w.write(({ada,jules,mina})[actor].token,endpoint,{personId:actor,idempotencyKey:`ordered-${++serial}`,payloadHash:payloadHash(body),body});
  if(stage!=="join")await mutate("jules","join",{planId:PLAN_ID});
  if(["grant","revoke"].includes(stage))await mutate("ada","accept",{planId:PLAN_ID,requesterId:"jules"});
  let grant;
  if(stage==="revoke") {
    grant=await mutate("jules","grant",{planId:PLAN_ID,otherId:"ada"});await mutate("ada","grant",{planId:PLAN_ID,otherId:"jules"});
  }
  return {w,ada,jules,mina,mutate,grant};
}
for(const operation of ["join","accept","grant","revoke"])for(const first of ["block","other"])test(`serialized ${operation}/${first}-first race leaves blocked contact denied`,async()=>{
  const p=await orderedWorld(operation);
  const other=()=>p.mutate(operation==="accept"?"ada":"jules",operation,operation==="join"?{planId:PLAN_ID}:operation==="accept"?{planId:PLAN_ID,requesterId:"jules"}:operation==="grant"?{planId:PLAN_ID,otherId:"ada"}:{permissionId:p.grant.data.permissionId});
  const block=()=>p.mutate("ada","block",{otherId:"jules"});
  const writes=first==="block"?[block(),other()]:[other(),block()];
  const reads=[p.w.plan(p.jules.token,PLAN_ID),p.w.plan(p.ada.token,PLAN_ID),p.w.plan(p.mina.token,PLAN_ID)];
  const results=await Promise.all([...writes,...reads]);const receipt=results[first==="block"?0:1];assert.equal(receipt.status,"committed");
  if(first==="block")assert.equal(results[1].status,"rejected");
  assert.equal(results[2].status,"rejected");assertNoRelay(results[2]);
  for(const read of results.slice(3)){assert.equal(read.status,"ok");assert.equal(read.version>=receipt.version,true);assertNoRelay(read);}
  assert.equal((await p.mutate("jules","join",{planId:PLAN_ID})).status,"rejected");
});

test("HTTP concurrent block/accept/grant/revoke and outsider reads cannot restore contact",async()=>{
  const h=await boot();try {
    const p=await pair(h.url,true);
    const results=await Promise.all([
      write(h.url,p.jules.token,"block","jules","block-race",{otherId:"ada"}),
      write(h.url,p.ada.token,"accept","ada","accept-race",{planId:PLAN_ID,requesterId:"jules"}),
      write(h.url,p.ada.token,"grant","ada","grant-race",{planId:PLAN_ID,otherId:"jules"}),
      write(h.url,p.jules.token,"revoke","jules","revoke-race",{permissionId:p.guestGrant.body.data.permissionId}),
      ...Array.from({length:6},()=>request(h.url,`/api/plans/${PLAN_ID}`,{token:p.mina.token})),
      ...Array.from({length:6},()=>request(h.url,`/api/plans/${PLAN_ID}`,{token:p.jules.token})),
    ]);
    const version=results[0].body.version;assert.equal(results[0].body.status,"committed");
    for(const r of results.slice(4,10))assertNoRelay(r.body);
    for(const r of results.slice(10))if(r.body.status!=="ok" || r.body.version>=version)assertNoRelay(r.body);
    await deniedPair(h.url,p);
  }finally{await h.stop();}
});

test("existing self-deletion rejects cross-user deletion and remains denied across block/accept races",async()=>{
  const h=await boot();try {
    const p=await pair(h.url,true);
    assert.equal((await write(h.url,p.mina.token,"delete-account","jules","stolen-delete",{})).status,403);
    assert.equal((await request(h.url,`/api/plans/${PLAN_ID}`,{token:p.jules.token})).body.data.contactAccess,"visible");
    const result=await Promise.all([
      write(h.url,p.jules.token,"delete-account","jules","delete",{}),
      write(h.url,p.ada.token,"block","ada","block-deleted",{otherId:"jules"}),
      write(h.url,p.ada.token,"accept","ada","late-accept",{planId:PLAN_ID,requesterId:"jules"}),
    ]);assert.equal(result[0].body.status,"committed");
    assert.equal((await request(h.url,`/api/plans/${PLAN_ID}`,{token:p.jules.token})).status,403);
    assertNoRelay((await request(h.url,`/api/plans/${PLAN_ID}`,{token:p.ada.token})).body);
    assert.equal((await request(h.url,"/api/session",{method:"POST",body:{magicName:"jules",passcode:"synthetic-jules"}})).status,403);
  }finally{await h.stop();}
});

test("report without durable configuration and contact-purge remain unavailable",async()=>{
  const h=await boot();try {
    const s=await signIn(h.url,"jules");
    for(const endpoint of ["report","delete-contact"]) {
      const result=await write(h.url,s.token,endpoint,"jules","unsupported",{otherId:"ada"});
      assert.equal(result.status,404);assert.equal(result.body.status,"unavailable");assertNoRelay(result.body);
    }
  }finally{await h.stop();}
});


test("a new session cannot bypass an existing block and no unblock route is implied",async()=>{
  const h=await boot();try {
    const p=await pair(h.url,true);
    assert.equal((await write(h.url,p.jules.token,"block","jules","block",{otherId:"ada"})).body.status,"committed");
    const fresh=await signIn(h.url,"jules");
    assert.equal((await request(h.url,`/api/plans/${PLAN_ID}`,{token:p.jules.token})).status,401);
    await deniedPair(h.url,{...p,jules:fresh});
    assert.equal((await write(h.url,fresh.token,"join","jules","fresh-join",{planId:PLAN_ID})).status,403);
    assert.equal((await write(h.url,fresh.token,"unblock","jules","unsupported",{otherId:"ada"})).status,404);
    await deniedPair(h.url,{...p,jules:fresh});
  }finally{await h.stop();}
});
