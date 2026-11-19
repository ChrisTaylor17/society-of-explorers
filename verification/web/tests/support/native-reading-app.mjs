// Actual native account/Circle fixture plus canonical passage resolution over
// the materialized hash-pinned reader, credit/rights manifest and passage index.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {contributionSource,rpc,requestId} from './member-contributions-app.mjs';
await contributionSource('verification/web/tests/support/native-circle-directory-app.mjs');
await contributionSource('verification/web/tests/support/offline-app.mjs');
const base=await import('./native-circle-directory-app.mjs');
const {offlineApp}=await import('./offline-app.mjs');
export const {ORIGIN,PROVIDER,PUBLIC_KEY,ACCESS,SUBJECTS,NEW_SUBJECT}=base;
export const BOOKS=['apology','hamlet','relativity'];
const ASSETS=BOOKS.flatMap(book=>['reader.html','manifest.json','passages.json'].map(name=>`content/great-books/${book}/${name}`));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function readingAppHashes(){
 const hashes={...await base.directoryAppHashes()},seen=new Set();
 async function bind(name){if(seen.has(name))return;seen.add(name);const bytes=await contributionSource(name);hashes[name]=sha(bytes);if(!name.endsWith('.ts')&&!name.endsWith('.tsx'))return;
  for(const match of bytes.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)){
   const spec=match[1];if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;
   const root=new URL('../../../../',import.meta.url),target=spec.startsWith('@/')?spec.slice(2):new URL(spec,new URL(name,root)).pathname.slice(root.pathname.length);
   await bind(/\.(?:ts|tsx|json)$/.test(target)?target:target+'.ts');
  }
 }
 for(const name of ['verification/web/tests/support/native-reading-app.mjs','app/api/great-books/passage/route.ts',...ASSETS])await bind(name);return hashes;
}
export async function createNativeReadingApp(){
 for(const name of ASSETS)await contributionSource(name);
 const f=await base.createNativeCircleDirectoryApp(),app=offlineApp();let hook=null;
 try{
  const route=app.load('app/api/great-books/passage/route.ts'),pins=JSON.parse(await contributionSource('lib/books/passage-indexes.json')),books={};
  for(const bookId of BOOKS){const pin=pins.find(p=>p.bookId===bookId),folder=`content/great-books/${bookId}`,bytes=await contributionSource(folder+'/passages.json');assert.equal(sha(bytes),pin.indexSha256);assert.equal(bytes.length,pin.indexBytes);assert.equal(sha(await contributionSource(folder+'/reader.html')),pin.documentSha256);const manifest=JSON.parse(await contributionSource(folder+'/manifest.json'));assert.equal(manifest.editionId,pin.editionId);books[bookId]={pin,index:JSON.parse(bytes),manifest};}
  return{...f,books,
   transformPassage(fn){hook=fn;},
   async sourceBlock(bookId,blockIndex){const pin=books[bookId]?.pin;assert(pin);return route.GET(new Request(ORIGIN+'/api/great-books/passage?'+new URLSearchParams({book:bookId,edition:pin.editionId,block:String(blockIndex)})));},
   async dispatch(path,options={}){
    const url=new URL(path,ORIGIN);if(url.pathname!=='/api/great-books/passage')return f.dispatch(path,options);
    assert.equal(url.origin,ORIGIN);assert.equal(options.method??'GET','GET');const headers=new Headers(options.headers);for(const key of ['authorization','apikey','cookie'])assert(!headers.has(key));assert.equal(options.body,undefined);
    const response=await route.GET(new Request(url,{headers}));return hook?hook({url,response}):response;
   },
   async seedReadingCircle({bookId='hamlet',from=41,to=43,title='Native reading Circle',sessions}={}){
    const book=books[bookId];assert(book);assert(Number.isInteger(from)&&Number.isInteger(to)&&from>=0&&to>=from&&to<book.pin.blockCount);
    const {day,weekday}=(await f.db.query("SELECT to_char(CURRENT_DATE+1,'YYYY-MM-DD') AS day,extract(dow FROM CURRENT_DATE+1)::int AS weekday")).rows[0];
    const {circleId}=await rpc(f.db,'soe_circle_create',[f.actors.other,requestId(),{title,description:'Synthetic group with an exact current source reading selection.',format:'in_person',city:'Synthetic City',region:null,venueName:'Synthetic public library',venueType:'library',weekday,time:'19:00',timezone:'UTC',startDate:day,maxMembers:8,onlineUrl:null,readingProgram:{version:1,bookId,editionId:book.pin.editionId,sessions:sessions??[{from,to}]}}]);return circleId;
   },
  };
 }catch(error){await f.close();throw error;}
}
