import {readFile} from 'node:fs/promises';
import {createDb as threadDb} from './thread-db.mjs';
import {rpc,IDS} from './thread-db.mjs';
import {offlineApp} from './offline-app.mjs';
export {IDS,rpc,asRole,requestId,createCircle,participate} from './thread-db.mjs';
export const UNICODE_SQL=await readFile(new URL('../../../../docs/sql/circle-discovery-unicode.sql',import.meta.url),'utf8');
export const SEARCH_SQL=await readFile(new URL('../../../../docs/sql/circle-discovery-search.sql',import.meta.url),'utf8');
export const CATALOG=JSON.parse(JSON.stringify(offlineApp().load('lib/circles/discovery-catalog.ts').DISCOVERY_SEARCH_CATALOG));
export const createBaseDb=threadDb;
export async function createDb(){const db=await threadDb();try{await db.exec(UNICODE_SQL);await db.exec(SEARCH_SQL);return db;}catch(error){await db.close();throw error;}}
export const query=(overrides={})=>({terms:[],cityTerms:[],format:'',open:false,sort:'next',book:null,edition:null,...overrides});
export function search(db,{q=query(),catalog=CATALOG,after=null,calendarKey=null,limit=25}={}){return rpc(db,'soe_circle_discovery_search',[q,catalog,after,calendarKey,limit]);}
export const circleId=n=>`f2000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export async function seed(db,{id=circleId(1),title='A synthetic searchable Circle',startOffset=1,host=IDS.host,format='in_person',city='Fictional City',region='Fixture',program=null,path=program?'book-v1':'starter-12',hidden=false,status='forming',max=8,time='19:00',timezone='UTC',day=null}={}){
 await db.query(`INSERT INTO book_cohorts(id,book_id,title,description,max_members,start_date,status,created_by,circle_format,circle_city,circle_region,circle_venue_name,circle_venue_type,circle_weekday,circle_time,circle_timezone,circle_path_id,circle_reading_program,circle_hidden)
 VALUES($1,'soe-circles-path',$2,'Synthetic public description.', $3,CASE WHEN $4::int IS NULL THEN NULL ELSE ((statement_timestamp() AT TIME ZONE 'UTC')::date+$4::int)::timestamp AT TIME ZONE 'UTC' END,$5,$6,$7,$8,$9,'Synthetic public library',CASE WHEN $7='online' THEN 'online' ELSE 'library' END,coalesce($10::int,extract(dow FROM (statement_timestamp() AT TIME ZONE 'UTC')::date+coalesce($4::int,0))::int),$11,$12,$13,$14,$15)`,[id,title,max,startOffset,status,host,format,city,region,day,time,timezone,path,program,hidden]);
 if(format!=='in_person')await db.query("INSERT INTO circle_private(cohort_id,online_url) VALUES($1,'https://fixture.invalid/private-meeting-do-not-expose')",[id]);return id;
}
