import {DatabaseSync} from 'node:sqlite';
import {closeSync,lstatSync,openSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {validateState} from './sqlite-state.js';
import {validateOpsState} from './synthetic-ops-state.js';
import {MESSAGE_WRITES,MESSAGE_COLLECTIONS,MESSAGE_CONTRACT,validText,exact,positive} from './messages.js';
import {payloadHash} from './hash.js';
const check=x=>{if(!x)throw Error('Invalid synthetic messaging checkpoint; refusing to serve or reseed.');};
const timestamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
export function validateMessageState(s,baseFormat){
 check(s?.format===5&&s.baseFormat===baseFormat&&[2,3,4].includes(baseFormat));
 const base={...s,format:baseFormat};delete base.baseFormat;for(const key of MESSAGE_COLLECTIONS)delete base[key];
 check(Array.isArray(s.idempotency));base.idempotency=s.idempotency.filter(([k])=>!MESSAGE_WRITES.has(k.split('\u0000')[1]));
 if(baseFormat===2)validateState(base);else validateOpsState(base,baseFormat===4);
 for(const key of MESSAGE_COLLECTIONS)check(Array.isArray(s[key])&&s[key].every(row=>Array.isArray(row)&&row.length===2)&&new Map(s[key]).size===s[key].length);
 const config=new Map(s.messageMeta).get('config');check(s.messageMeta.length===1&&exact(config,['contract','instanceId','clock'])&&config.contract===MESSAGE_CONTRACT&&/^[a-f0-9]{32}$/.test(config.instanceId)&&Number.isSafeInteger(config.clock)&&config.clock>=0);
 const threads=new Map(s.messageThreads),rows=new Map(s.messageRows),invitations=new Map(s.invitations),people=new Map(s.people),plans=new Map(s.plans),blocks=new Map(s.blocks);
 const unavailable=p=>s.holds?.some(([,h])=>h.planId===p&&['held','cancelled'].includes(h.state));
 for(const [id,t]of threads){const i=invitations.get(id),p=plans.get(t.planId);check(exact(t,['planId','invitationId','hostId','guestId','epoch','revision','lastSeq','terminal','consentHost','consentGuest'])&&id===t.invitationId&&i?.planId===p?.id&&t.hostId===p?.hostId&&t.guestId===i?.requesterId&&positive(t.epoch)&&positive(t.revision)&&Number.isSafeInteger(t.lastSeq)&&t.lastSeq>=0&&t.lastSeq<=100&&['terminal','consentHost','consentGuest'].every(k=>typeof t[k]==='boolean'));
  if(t.terminal||unavailable(t.planId))check(!t.consentHost&&!t.consentGuest);
  if(i.status!=='accepted'||p.closed||people.get(t.hostId).deletedAt||people.get(t.guestId).deletedAt||blocks.has(t.hostId+'\u0000'+t.guestId)||blocks.has(t.guestId+'\u0000'+t.hostId))check(t.terminal);
 }
 for(const i of invitations.values())if(i.status==='accepted')check(threads.has(i.id));
 for(const p of plans.values())check([...invitations.values()].filter(i=>i.planId===p.id&&['invited','accepted'].includes(i.status)).length<=1);
 const sequences=new Map(),senders=new Map();
 for(const [id,r]of rows){const t=threads.get(r.invitationId);check(exact(r,['messageId','invitationId','epoch','seq','senderId','text','committedAt','rateAt'])&&id===r.messageId&&/^msg-[a-f0-9]{32}$/.test(id)&&t&&positive(r.epoch)&&r.epoch<=t.epoch&&positive(r.seq)&&r.seq<=t.lastSeq&&[t.hostId,t.guestId].includes(r.senderId)&&validText(r.text)&&timestamp(r.committedAt)&&Number.isSafeInteger(r.rateAt)&&r.rateAt>=0&&r.rateAt<=config.clock);
  const seq=sequences.get(t.invitationId)??new Set();check(!seq.has(r.seq));seq.add(r.seq);sequences.set(t.invitationId,seq);senders.set(r.senderId,(senders.get(r.senderId)??0)+1);
 }
 for(const [id,t]of threads)check((sequences.get(id)?.size??0)===t.lastSeq);
 check([...senders.values()].every(n=>n<=200));const receipts=new Set(),enables=new Map(),currentConsents=new Set();
 for(const [key,row]of s.idempotency){const [actor,endpoint,...parts]=key.split('\u0000');if(!MESSAGE_WRITES.has(endpoint))continue;
  const r=row.result,d=r?.data,t=threads.get(d?.invitationId);check(exact(row,['payloadHash','result'])&&/^[a-f0-9]{64}$/.test(row.payloadHash)&&people.has(actor)&&/^[A-Za-z0-9._:-]{1,100}$/.test(parts.join('\u0000'))&&exact(r,['status','version','messageRevision','revisionDomain','data'])&&r.status==='committed'&&t&&[t.hostId,t.guestId].includes(actor)&&positive(r.version)&&r.version<=plans.get(t.planId).version&&positive(r.messageRevision)&&r.messageRevision<=t.revision&&r.revisionDomain===`${MESSAGE_CONTRACT}:${config.instanceId}:${t.planId}:${t.invitationId}`);
  check(exact(d,['operation','outcome','instanceId','planId','invitationId','messagingEpoch','committedAt',...(endpoint==='message-send'?['messageId','seq']:[])])&&d.operation===endpoint&&d.instanceId===config.instanceId&&d.planId===t.planId&&positive(d.messagingEpoch)&&d.messagingEpoch<=t.epoch&&timestamp(d.committedAt));
  if(endpoint==='message-send'){const m=rows.get(d.messageId);check(d.outcome==='stored'&&m?.senderId===actor&&m.invitationId===t.invitationId&&m.epoch===d.messagingEpoch&&m.seq===d.seq&&m.committedAt===d.committedAt&&!receipts.has(m.messageId)&&row.payloadHash===payloadHash({instanceId:config.instanceId,planId:t.planId,invitationId:t.invitationId,messagingEpoch:m.epoch,text:m.text}));receipts.add(m.messageId);}
  else{check(row.payloadHash===payloadHash({instanceId:config.instanceId,planId:t.planId,invitationId:t.invitationId,messagingEpoch:d.messagingEpoch}));check(d.outcome===(endpoint==='message-consent'?'consented':'revoked'));if(endpoint==='message-consent'){enables.set(actor,(enables.get(actor)??0)+1);if(d.messagingEpoch===t.epoch)currentConsents.add(t.invitationId+'\u0000'+actor);}}
 }
 check(receipts.size===rows.size&&[...enables.values()].every(n=>n<=100));for(const t of threads.values()){if(t.consentHost)check(currentConsents.has(t.invitationId+'\u0000'+t.hostId));if(t.consentGuest)check(currentConsents.has(t.invitationId+'\u0000'+t.guestId));}return s;
}
export function openMessageStore(path,initial,hooks={},baseFormat){
 if(typeof path!=='string'||!isAbsolute(path))throw Error('Explicit absolute messaging database required');
 const dir=lstatSync(dirname(path));if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o022))throw Error('Trusted messaging directory required');
 let created=false;try{const fd=openSync(path,'wx',0o600);closeSync(fd);created=true;}catch(e){if(e.code!=='EEXIST')throw e;}
 const file=lstatSync(path);if(!file.isFile()||file.isSymbolicLink()||(file.mode&0o077))throw Error('Owner-only regular messaging database required');
 const db=new DatabaseSync(path);let closed=false;const rollback=()=>{try{db.exec('ROLLBACK');}catch{}};
 const parse=x=>{try{return JSON.parse(x);}catch{throw Error('Invalid messaging checkpoint JSON; contents omitted');}};
 try{
  db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON; BEGIN IMMEDIATE');
  const app=db.prepare('PRAGMA application_id').get().application_id,version=db.prepare('PRAGMA user_version').get().user_version,tables=db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
  if(created&&app===0&&version===0&&tables.length===0){validateMessageState(initial,baseFormat);db.exec('PRAGMA application_id=1397703985; PRAGMA user_version=5; CREATE TABLE soe_state(id INTEGER PRIMARY KEY CHECK(id=1),format_version INTEGER NOT NULL CHECK(format_version=5),state_json TEXT NOT NULL) STRICT');db.prepare('INSERT INTO soe_state VALUES(1,5,?)').run(JSON.stringify(initial));}
  else if(app!==0x534f4531||version!==5||tables.length!==1||tables[0].name!=='soe_state')throw Error('Unsupported messaging store; fresh owned format5 required, no migration or reseed');
  const row=db.prepare('SELECT * FROM soe_state').all();if(row.length!==1||row[0].id!==1||row[0].format_version!==5)throw Error('Missing messaging checkpoint');validateMessageState(parse(row[0].state_json),baseFormat);db.exec('COMMIT; PRAGMA journal_mode=DELETE');
 }catch(e){rollback();db.close();throw e;}
 return {transaction(run){if(closed)throw Error('Messaging store closed');let active=false;try{db.exec('BEGIN IMMEDIATE');active=true;const before=db.prepare('SELECT state_json FROM soe_state WHERE id=1').get();if(!before)throw Error('Missing messaging checkpoint');const state=validateMessageState(parse(before.state_json),baseFormat),next=run(state);validateMessageState(next.state,baseFormat);const serialized=JSON.stringify(next.state);if(serialized!==before.state_json)db.prepare('UPDATE soe_state SET state_json=? WHERE id=1').run(serialized);hooks.beforeCommit?.();const denial=next.authorize?.();if(denial){const error=Error('Messaging authorization expired at commit');error.authorizationResult=denial;throw error;}db.exec('COMMIT');active=false;hooks.afterCommit?.();return next.result;}catch(e){if(active)rollback();throw e;}},close(){if(!closed){db.close();closed=true;}}};
}
