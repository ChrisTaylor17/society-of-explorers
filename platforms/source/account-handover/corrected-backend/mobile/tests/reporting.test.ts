import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixturePort } from "../src/fixture.ts";
import { createReporting } from "../src/reporting.ts";
import { REPORT_NOTICE, validReportDetails, validReportReceipt, type ReportBody, type ReportReceipt } from "../src/report-contract.ts";
import { payloadHash } from "../src/hash.ts";
import type { MeridianPort } from "../src/port.ts";
import type { IdempotentWrite, LookupResult, WriteResult } from "../src/types.ts";

const target = { otherId: "ada", displayName: "Ada Linden", planId: "plan-riverside" };
const TEXT = "Fictional report text — controller privacy canary";
const receipt: ReportReceipt = { reportId: `report-${"a".repeat(32)}`, submitted: true, notice: REPORT_NOTICE };
const committed: WriteResult<ReportReceipt> = { status: "committed", version: 1, data: receipt };
const ambiguous: WriteResult<ReportReceipt> = { status: "ambiguous", attemptId: "lost", reason: TEXT };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function setup(overrides: Partial<MeridianPort> = {}) {
  const writes: IdempotentWrite<ReportBody>[] = [], lookups: Parameters<MeridianPort["lookup"]>[0][] = [];
  const fixture = createFixturePort();
  const port: MeridianPort = { name: "http-boundary", writesEnabled: true, viewerId: "jules",
    discover: () => fixture.discover(), plan: id => fixture.plan(id), visibility: id => fixture.visibility(id),
    requestJoin: input => fixture.requestJoin(input), acceptDisclosure: input => fixture.acceptDisclosure(input), revokeContact: input => fixture.revokeContact(input),
    submitReport: async input => { writes.push(structuredClone(input)); return committed; },
    lookup: async input => { lookups.push({...input}); return { status: "recorded", result: committed }; }, ...overrides };
  const reporting = createReporting(port, true, "unit-session");
  const fill = () => { reporting.open(target); reporting.setCategory("safety"); return reporting.setDetails(TEXT); };
  return { port, reporting, fill, writes, lookups };
}
function clear(value: ReturnType<ReturnType<typeof createReporting>["model"]>) {
  assert.equal(value.subject, null); assert.equal(value.category, null); assert.equal(value.details, "");
  assert.doesNotMatch(JSON.stringify(value), new RegExp(TEXT));
}

test("reporting is available only through an explicit development HTTP write capability", async () => {
  for (const [port, dev] of [[createFixturePort(), true], [setup().port, false], [{...setup().port, writesEnabled:false}, true], [{...setup().port, submitReport:undefined}, true]] as const) {
    const reporting = createReporting(port, dev); assert.equal(reporting.open(target).open, false); assert.equal((await reporting.submit()).canSubmit, false);
  }
});
test("bounded, well-formed multiline Unicode is accepted; blank/control/surrogate text is refused", () => {
  for (const text of ["plain", "😀".repeat(1000), "line one\nline two\ttext\r\nend"]) assert.equal(validReportDetails(text), true);
  for (const text of ["", " \n\t", "x".repeat(2001), "\u0000private", "\u000b", "\u007f", "\ud800", "\udc00", "a\ud800b"]) assert.equal(validReportDetails(text), false);
  const h = setup(); h.fill(); assert.equal(h.reporting.setDetails("x".repeat(2001)).details.length, 2000);
  assert.equal(h.reporting.setDetails("\ud800").canSubmit, false);
});
test("target, reason and details are required and identity cannot be supplied by the form", async () => {
  const h = setup(); assert.equal(h.reporting.open({...target, otherId:"jules"}).canSubmit, false);
  assert.equal(h.reporting.open({...target, planId:"unknown"}).subject, null);
  h.reporting.open(target); assert.equal(h.reporting.setDetails(TEXT).canSubmit, false);
  h.reporting.setCategory("safety"); assert.equal(h.reporting.model().canSubmit, true);
  await h.reporting.submit(); assert.equal(h.writes[0].personId, "jules");
  assert.equal(h.writes[0].payloadHash, payloadHash(h.writes[0].body));
  assert.deepEqual(Object.keys(h.writes[0].body).sort(), ["category","details","otherId","planId"]);
});
test("loading disables repeat submissions and successful receipt clears every form field", async () => {
  const gate = deferred<WriteResult<ReportReceipt>>(); let calls=0;
  const h=setup({submitReport: async () => { calls++; return gate.promise; }}); h.fill();
  const first=h.reporting.submit(); assert.equal(h.reporting.model().phase,"submitting");
  assert.equal(h.reporting.model().canSubmit,false); assert.equal(h.reporting.model().canCheck,false);
  await h.reporting.submit(); assert.equal(calls,1); gate.resolve(committed); const value=await first;
  assert.equal(value.phase,"submitted"); clear(value); assert.deepEqual(value.receipt,receipt);
  const external=value.receipt!; external.reportId="changed"; assert.equal(h.reporting.model().receipt!.reportId,receipt.reportId);
});
test("lost reply reconciles the original key without a second write or sensitive error reflection", async () => {
  const h=setup(); h.port.submitReport=async input=>{h.writes.push(structuredClone(input)); throw Error(TEXT);}; h.fill();
  const value=await h.reporting.submit(); assert.equal(value.phase,"unknown"); assert.doesNotMatch(value.message,new RegExp(TEXT));
  await h.reporting.submit(); assert.equal(h.writes.length,1);
  const found=await h.reporting.check(); assert.equal(found.phase,"submitted"); clear(found);
  assert.deepEqual(h.lookups[0],{personId:"jules",endpoint:"report",key:h.writes[0].idempotencyKey,payloadHash:h.writes[0].payloadHash});
  assert.equal(h.writes.length,1);
});
test("absence permits only a same-intent retry with the original frozen key, hash and body", async () => {
  const h=setup({lookup:async()=>({status:"absent"})}); h.port.submitReport=async input=>{h.writes.push(structuredClone(input)); return h.writes.length===1?ambiguous:committed;};
  h.fill(); await h.reporting.submit(); h.reporting.setDetails("replacement"); h.reporting.setCategory("spam");
  assert.equal(h.reporting.model().details,TEXT); assert.equal(h.reporting.model().category,"safety");
  assert.equal(h.reporting.model().canRetry,false); await h.reporting.check(); assert.equal(h.reporting.model().canRetry,true);
  await h.reporting.retry(); assert.deepEqual(h.writes[1],h.writes[0]); assert.equal(h.reporting.model().phase,"submitted");
});
test("closing/back navigation clears an editing draft and next open starts blank", async () => {
  const h=setup(); h.fill(); clear(h.reporting.close()); assert.equal(h.reporting.model().open,false);
  const value=h.reporting.open(target); assert.equal(value.details,""); assert.equal(value.category,null); assert.equal(h.writes.length,0);
});
for (const activity of ["inactive","background"]) test(`${activity} clears text and does not resend on foreground`,async()=>{
  const h=setup({lookup:async()=>({status:"absent"})}); h.port.submitReport=async input=>{h.writes.push(structuredClone(input));return ambiguous;}; h.fill(); await h.reporting.submit();
  clear(h.reporting.activity(activity)); assert.equal(h.reporting.model().unresolved,true);
  clear(h.reporting.activity("active")); assert.equal(h.reporting.model().open,false);
  clear(h.reporting.open(target)); assert.equal((await h.reporting.check()).canRetry,false);
  assert.equal((await h.reporting.retry()).canRetry,false); assert.equal(h.writes.length,1);
});
test("a late successful write after navigation cannot restore text, open a screen or display its receipt",async()=>{
  const gate=deferred<WriteResult<ReportReceipt>>(); const h=setup({submitReport:()=>gate.promise});h.fill();const pending=h.reporting.submit();
  clear(h.reporting.close()); gate.resolve(committed); const value=await pending; clear(value); assert.equal(value.open,false); assert.equal(value.receipt,null);
  clear(h.reporting.open(target)); const found=await h.reporting.check(); assert.equal(found.phase,"submitted"); clear(found);
});
test("a late lookup after background cannot restore a receipt or overwrite a cleared screen",async()=>{
  const gate=deferred<LookupResult>();const h=setup({submitReport:async()=>ambiguous,lookup:()=>gate.promise});h.fill();await h.reporting.submit();
  const pending=h.reporting.check();clear(h.reporting.activity("background"));gate.resolve({status:"recorded",result:committed});
  const value=await pending;clear(value);assert.equal(value.open,false);assert.equal(value.receipt,null);
});
test("end session erases an unresolved attempt and permanently disables this controller",async()=>{
  const gate=deferred<WriteResult<ReportReceipt>>();const h=setup({submitReport:()=>gate.promise});h.fill();const pending=h.reporting.submit();
  const ended=h.reporting.endSession();clear(ended);assert.equal(ended.enabled,false);assert.equal(ended.unresolved,false);
  gate.resolve(committed);clear(await pending);assert.equal(h.reporting.open(target).open,false);assert.equal((await h.reporting.check()).receipt,null);
});
test("expired write and expired lookup clear the draft and disable resubmission",async()=>{
  for(const lookup of [false,true]) {const h=setup({submitReport:async()=>lookup?ambiguous:{status:"expired-session"},lookup:async()=>({status:"unavailable",blocker:"Session expired."})});h.fill();await h.reporting.submit();if(lookup)await h.reporting.check();
    const value=h.reporting.model();clear(value);assert.equal(value.phase,"expired");assert.equal(value.enabled,false);assert.equal(value.unresolved,false);
  }
});
test("malformed or overly broad receipt never becomes a successful confirmation",async()=>{
  for(const data of [{...receipt,details:TEXT},{...receipt,notice:"A moderator will reply"},{...receipt,reportId:TEXT},{...receipt,submitted:false}]) {
    assert.equal(validReportReceipt(data),false);const h=setup({submitReport:async()=>({status:"committed",version:1,data} as WriteResult<ReportReceipt>)});h.fill();
    const value=await h.reporting.submit();assert.equal(value.phase,"unknown");assert.equal(value.receipt,null);assert.doesNotMatch(value.message,new RegExp(TEXT));
  }
});
test("lookup rejects malformed/failed receipts and does not reflect server messages",async()=>{
  for(const result of [{status:"recorded",result:{...committed,data:{...receipt,details:TEXT}}},{status:"recorded",result:{status:"rejected",error:TEXT}},{status:"conflict",error:TEXT},{status:"unavailable",blocker:TEXT}]) {
    const h=setup({submitReport:async()=>ambiguous,lookup:async()=>result as LookupResult});h.fill();await h.reporting.submit();
    const value=await h.reporting.check();assert.equal(value.phase,"unknown");assert.equal(value.receipt,null);assert.doesNotMatch(value.message,new RegExp(TEXT));
  }
});
test("explicit rejection permits a new intent, but a conflicting key stays unresolved",async()=>{
  const h=setup({submitReport:async()=>({status:"rejected",error:TEXT})});h.fill();assert.equal((await h.reporting.submit()).phase,"rejected");
  h.port.submitReport=async input=>{h.writes.push(structuredClone(input));return committed;};await h.reporting.submit();assert.match(h.writes[0].idempotencyKey,/:report-2$/);
  const conflict=setup({submitReport:async()=>({status:"conflict",error:TEXT})});conflict.fill();const value=await conflict.reporting.submit();
  assert.equal(value.unresolved,true);assert.equal(value.canSubmit,false);assert.equal(value.receipt,null);assert.doesNotMatch(value.message,new RegExp(TEXT));
});
test("memory-only unavailable response cannot become a submitted receipt",async()=>{
  const h=setup({submitReport:async()=>({status:"unavailable",blocker:"Report submission requires the configured local database. No report was submitted."})});h.fill();
  const value=await h.reporting.submit();assert.equal(value.phase,"rejected");assert.equal(value.receipt,null);assert.match(value.message,/No report was submitted/);
});
