import assert from "node:assert/strict";
import { test } from "node:test";
import { createMobileClient } from "../../../mobile/src/client.ts";
import { createLocalPrototypePort } from "./mobile-local-port.ts";
import { boot, signIn, write, request, assertNoRelay, PLAN_ID } from "../tests/helpers.js";
async function pair(url: string, _visible: boolean) {
  const ada=await signIn(url,"ada"),jules=await signIn(url,"jules");
  await write(url,jules.token,"join","jules","join",{planId:PLAN_ID});
  await write(url,ada.token,"accept","ada","accept",{planId:PLAN_ID,requesterId:"jules"});
  await write(url,jules.token,"grant","jules","grant-j",{planId:PLAN_ID,otherId:"ada"});
  await write(url,ada.token,"grant","ada","grant-a",{planId:PLAN_ID,otherId:"jules"});
  return {ada,jules};
}
test("existing mobile HTTP adapter clears held contact on the first blocked refresh",async()=>{
  const h=await boot();try {
    const p=await pair(h.url,true);
    const client=createMobileClient(createLocalPrototypePort({url:h.url,personId:"jules",token:p.jules.token}));
    await client.boot();await client.reviewPlan(PLAN_ID);await client.refresh();
    assert.equal(client.heldRelay(),"relay:ada.linden");
    assert.equal((await write(h.url,p.ada.token,"block","ada","block",{otherId:"jules"})).body.status,"committed");
    const screen=await client.refresh();
    assert.equal(client.heldRelay(),null);assert.equal(screen.relay.value,null);assertNoRelay(screen);
    assert.equal(screen.truthful,"failed-refresh");assert.equal((client as any).plan.other.contact,null);
  }finally{await h.stop();}
});
