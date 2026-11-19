import test from 'node:test';
import assert from 'node:assert/strict';
import {createSavedReadingApp,ACCESS,TOKENS} from './support/saved-reading-app.mjs';

test('explicit edition bookmark persists through canonical bearer route and PostgreSQL, with member isolation',async()=>{
 const a=await createSavedReadingApp();try{
  const headers={authorization:'Bearer '+ACCESS.author},load=()=>a.dispatch('/api/great-books/progress?bookId=hamlet',{headers});
  const save=patch=>a.dispatch('/api/great-books/progress',{method:'POST',headers,body:{expectedMemberId:a.authorId,expectedRevision:0,bookId:'hamlet',action:'save',editionId:a.editions.hamlet.editionId,blockIndex:42,completed:false,...patch}});
  await a.seedLegacy('hamlet','3');await a.seedLegacy('hamlet','5',{who:'other'});
  let response=await load();assert.equal(response.status,200);assert.equal((await response.json()).progress[0].bookmark.status,'legacy');assert.equal(a.sql.filter(x=>x.kind==='rpc').length,0);
  response=await save({});assert.equal(response.status,200);assert.equal((await response.json()).progress[0].bookmark.blockIndex,42);
  const body=await(await load()).json();assert.equal(body.progress.length,1);assert.equal(body.progress[0].revision,1);assert.equal(body.progress[0].bookmark.editionId,a.editions.hamlet.editionId);assert.equal(body.progress[0].bookmark.blockIndex,42);
  assert.equal((await a.row('hamlet','other')).section_id,'5');headers.authorization='Bearer '+TOKENS.other;
  assert.equal((await(await load()).json()).progress[0].bookmark.status,'legacy');assert.equal((await save({})).status,409);
  headers.authorization='Bearer INVALID_NONISSUED';assert.equal((await load()).status,401);assert.equal(a.sql.filter(x=>x.kind==='rpc').length,1);
 }finally{await a.close();}
});

test('edition conflict and out-of-bounds place cannot overwrite real persisted progress',async()=>{
 const a=await createSavedReadingApp();try{
  const save=patch=>a.dispatch('/api/great-books/progress',{method:'POST',headers:{authorization:'Bearer '+ACCESS.author},body:{expectedMemberId:a.authorId,expectedRevision:0,bookId:'hamlet',action:'save',editionId:a.editions.hamlet.editionId,blockIndex:0,completed:false,...patch}});
  assert.equal((await save({editionId:'other-edition'})).status,409);assert.equal((await save({blockIndex:a.editions.hamlet.blockCount})).status,400);
  assert.equal(await a.row('hamlet'),null);assert.equal(a.sql.filter(x=>x.kind==='rpc').length,0);
 }finally{await a.close();}
});
