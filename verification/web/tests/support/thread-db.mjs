import { readFile } from 'node:fs/promises';
import { createDb as passageDb } from './passage-post-db.mjs';
export { IDS, rpc, asRole, requestId, createCircle, participate, messageState, messageAction, messageDecide } from './passage-post-db.mjs';
import { IDS, rpc, requestId } from './passage-post-db.mjs';
export const THREAD_SQL = await readFile(new URL('../../../../docs/sql/circle-discussion-threads.sql', import.meta.url), 'utf8');
export const createBaseDb = passageDb;
export async function createDb() {
 const db = await passageDb();
 try { await db.exec(THREAD_SQL); return db; }
 catch (error) { await db.close(); throw error; }
}
export function archive(db, { actor=IDS.author, circle=IDS.circle, before=null, limit=25 }={}) {
 return rpc(db,'soe_circle_discussion_read',[actor,circle,before,limit]);
}
export function thread(db, { actor=IDS.author, circle=IDS.circle, message=IDS.message, after=null, limit=25 }={}) {
 return rpc(db,'soe_circle_discussion_thread',[actor,circle,message,after,limit]);
}
export function target(db, { actor=IDS.author, circle=IDS.circle, parent=null }={}) {
 return rpc(db,'soe_circle_discussion_target',[actor,circle,parent]);
}
export function receipt(db, { actor=IDS.author, circle=IDS.circle, key }={}) {
 return rpc(db,'soe_circle_discussion_receipt',[actor,circle,key]);
}
export async function post(db, { actor=IDS.author, circle=IDS.circle, key=requestId(), content='A fictional independent contribution.', parent=null, revision, hash, name='Fictional Author' }={}) {
 if(parent!==null && (revision===undefined || hash===undefined)) {
  const preview=await target(db,{actor,circle,parent}); revision??=preview.target.revision;hash??=preview.target.contentHash;
 }
 return rpc(db,'soe_circle_discussion_post',[actor,circle,key,content,parent,revision??null,hash??null,name]);
}
