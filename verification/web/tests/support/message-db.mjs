import { readFile } from 'node:fs/promises';
import { createDb as baseDb, IDS as BASE_IDS, rpc, asRole, requestId, ROOT } from './moderation-db.mjs';
export { rpc, asRole, requestId, ROOT };
export const IDS = { ...BASE_IDS, author: BASE_IDS.ordinary, reader: BASE_IDS.reporter,
  message: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', message2: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  salon: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
export const CONTENT = 'A fictional discussion post with private retained evidence.';

export async function createDb() {
  const db = await baseDb();
  await db.exec(await readFile(new URL('../../../../docs/sql/circle-message-moderation.sql', import.meta.url), 'utf8'));
  // Deliberately broad historical browser table grants: RLS must protect Circle
  // data even when old Data API privileges exist. No real role/grant is touched.
  await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON book_cohorts,book_cohort_members,seminar_messages TO anon,authenticated;');
  await db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2),($1,$3),($1,$4)', [IDS.circle,IDS.author,IDS.reader,IDS.reporter2]);
  await db.query('INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content) VALUES($1,$2,$3,$4,$5)', [IDS.message,IDS.circle,IDS.author,'Fictional Author',CONTENT]);
  await db.query('INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content) VALUES($1,$2,$3,$4,$5)', [IDS.message2,IDS.circle,IDS.reader,'Fictional Reader','Another fictional post that can be reported.']);
  await db.query("INSERT INTO book_cohorts(id,book_id,title,created_by) VALUES($1,'ordinary-salon','Ordinary salon fixture',$2)",[IDS.salon,IDS.host]);
  return db;
}
export function messageState(db, actor=IDS.reader, message=IDS.message, circle=IDS.circle) {
  return rpc(db,'soe_circle_message_state',[actor,circle,message]);
}
export async function messageAction(db,{actor=IDS.reader,circle=IDS.circle,message=IDS.message,revision,hash,key=requestId(),action='report',reason=action==='report'?'safety':null,note=action==='report'?'A private fictional report note.':null}={}) {
  if (revision===undefined || hash===undefined) { const state=await messageState(db,actor,message,circle); revision??=state.revision; hash??=state.contentHash; }
  return rpc(db,'soe_circle_message_action',[actor,circle,message,revision,hash,key,action,reason,note]);
}
export async function messageDecide(db,{actor=IDS.reviewer,circle=IDS.circle,message=IDS.message,revision,hash,key=requestId(),action='hide',reason=action==='hide'?'safety':'resolved',summary='A human reviewed this post and recorded a separate author explanation.',reportId=null,excerpt=action==='hide'?'fictional discussion':null}={}) {
  if (revision===undefined || hash===undefined) { const detail=await rpc(db,'soe_circle_message_review_detail',[actor,circle,message]); revision??=detail.revision; hash??=detail.contentHash; }
  return rpc(db,'soe_circle_message_review_decide',[actor,circle,message,revision,hash,key,action,reason,summary,reportId,excerpt]);
}
