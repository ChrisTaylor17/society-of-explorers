import { readFile } from 'node:fs/promises';
import { createDb as messageDb, IDS as MESSAGE_IDS, rpc, asRole, requestId, ROOT } from './message-db.mjs';
export { rpc, asRole, requestId, ROOT };
export const IDS={...MESSAGE_IDS,newcomer:'eeeeeeee-eeee-4eee-8eee-000000000010',newcomer2:'eeeeeeee-eeee-4eee-8eee-000000000011'};
export const PARTICIPATION_FIXTURE_CONFIG_SQL=`UPDATE book_cohorts SET
  start_date=((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC',
  circle_format='in_person',circle_city='Fictional City',circle_region='Fixture',
  circle_venue_name='Fictional public library',circle_venue_type='library',
  circle_weekday=extract(dow FROM ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+1))::smallint,
  circle_time='19:00',circle_timezone='UTC',circle_path_id='starter-12',status='forming'
 WHERE book_id='soe-circles-path'`;
export async function configureParticipationFixture(db) {
 await db.query(PARTICIPATION_FIXTURE_CONFIG_SQL);
 await db.query('INSERT INTO members(id,display_name) VALUES($1,$2),($3,$4) ON CONFLICT(id) DO NOTHING',[IDS.newcomer,'Fictional Newcomer',IDS.newcomer2,'Fictional Newcomer Two']);
}
export async function createDb() {
 const db=await messageDb();
 await configureParticipationFixture(db);
 await db.exec(await readFile(new URL('../../../../docs/sql/circle-participation.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../../../docs/sql/circle-reading-programs.sql',import.meta.url),'utf8'));
 return db;
}
export async function creationInput(db,overrides={}) {
 const day=(await db.query("SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+1,'YYYY-MM-DD') AS day,extract(dow FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+1)::int AS weekday")).rows[0];
 return {title:'A fictional reading circle',description:'Synthetic local participation fixture.',format:'in_person',city:'Fictional City',region:null,venueName:'Fictional public library',venueType:'library',weekday:day.weekday,time:'19:00',timezone:'UTC',startDate:day.day,maxMembers:8,onlineUrl:null,...overrides};
}
export async function detail(db,actor=IDS.reader,circle=IDS.circle) {return rpc(db,'soe_circle_detail',[actor,circle]);}
export async function createCircle(db,{actor=IDS.newcomer,key=requestId(),input}={}) {return rpc(db,'soe_circle_create',[actor,key,input??await creationInput(db)]);}
export async function participate(db,action,{actor=IDS.newcomer,circle=IDS.circle,revision,key=requestId(),date,status='going'}={}) {
 if(!['join','leave','rsvp','complete'].includes(action)) throw Error('Unexpected participation fixture action');
 if(revision===undefined) revision=Number((await db.query('SELECT circle_participation_revision AS revision FROM book_cohorts WHERE id=$1',[circle])).rows[0].revision);
 return rpc(db,'soe_circle_'+action,[actor,circle,revision,key,...(action==='rsvp'?[date,status]:[])]);
}
