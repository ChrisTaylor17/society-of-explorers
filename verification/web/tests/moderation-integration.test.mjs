import test from 'node:test';import assert from 'node:assert/strict';
import {moderationApp,IDS} from './support/moderation-app.mjs';
import {requestId,state,count} from './support/moderation-db.mjs';
const reportBody=key=>({circleId:IDS.circle,requestId:key,reason:'spam',note:'PRIVATE_REPORT_CONTENT is an allegation for human review.'});
test('actual HTTP reporting, PostgreSQL quarantine, human restoration and host explanation form one working flow',async t=>{
 const a=await moderationApp();t.after(()=>a.close());const keys=[];
 for(const actor of[IDS.reporter,IDS.reporter2,null]){a.setActor(actor);const key=requestId();keys.push(key);const req=()=>a.request(reportBody(key),'/api/circles/report',{'x-forwarded-for':'203.0.113.17'});assert.equal((await a.routes.report.POST(req())).status,200);assert.equal((await a.routes.report.POST(req())).status,200);}
 assert.equal(await count(a.db,'circle_reports'),3);assert.equal((await state(a.db)).hidden,true);
 a.setActor(IDS.reviewer);let response=await a.routes.queue.GET(a.request(undefined,'/api/admin/circles/reports'));assert.equal(response.status,200);assert.equal((await response.json()).items[0].openReports,3);
 response=await a.routes.detail.GET(a.request(undefined),a.context);assert.equal(response.status,200);const detail=await response.json();assert.equal(detail.revision,3);assert.equal(detail.reports.length,3);
 const payload={expectedRevision:detail.revision,requestId:requestId(),action:'restore',reason:'insufficient_evidence',summary:'The reviewed reports do not establish a conduct violation.',evidenceReportId:null,evidenceExcerpt:null};
 response=await a.routes.detail.POST(a.request(payload),a.context);assert.equal(response.status,200);const receipt=await response.json();assert.equal(receipt.replayed,false);assert.equal(receipt.hidden,false);
 response=await a.routes.detail.POST(a.request(payload),a.context);assert.equal(response.status,200);assert.equal((await response.json()).replayed,true);assert.equal(await count(a.db,'circle_review_decisions'),1);
 a.setActor(IDS.host);response=await a.routes.hosts.GET(a.request(undefined,'/api/circles/review'));assert.equal(response.status,200);const hosts=await response.json();assert.equal(hosts.items[0].circle.hidden,false);assert.equal(hosts.items[0].decisions[0].summary,payload.summary);
 const text=JSON.stringify(hosts);for(const forbidden of['PRIVATE_REPORT_CONTENT','report_count','reporter_key','evidence_excerpt','actor_member_id',keys[0]])assert.equal(text.includes(forbidden),false);
 a.setActor(IDS.reporter);assert.equal((await a.routes.report.POST(a.request(reportBody(keys[0])))).status,200);assert.equal((await state(a.db)).hidden,false);assert.equal(await count(a.db,'circle_reports'),3);
 a.setActor(IDS.ordinary);response=await a.routes.queue.GET(a.request(undefined));assert.equal(response.status,403);assert.doesNotMatch(await response.text(),/PRIVATE_REPORT_CONTENT|Fictional public/);
});
test('a new report between HTTP read and decision produces conflict without closing unseen reports',async t=>{
 const a=await moderationApp();t.after(()=>a.close());a.setActor(IDS.reporter);await a.routes.report.POST(a.request(reportBody(requestId())));
 a.setActor(IDS.reviewer);const snapshot=await(await a.routes.detail.GET(a.request(undefined),a.context)).json();
 a.setActor(IDS.reporter2);await a.routes.report.POST(a.request(reportBody(requestId())));a.setActor(IDS.reviewer);
 const response=await a.routes.detail.POST(a.request({expectedRevision:snapshot.revision,requestId:requestId(),action:'restore',reason:'no_violation',summary:'The reviewed reports do not establish a conduct violation.',evidenceReportId:null,evidenceExcerpt:null}),a.context);
 assert.equal(response.status,409);assert.equal(await count(a.db,'circle_review_decisions'),0);assert.equal(await count(a.db,'circle_reports',"WHERE status='open'"),2);
});
