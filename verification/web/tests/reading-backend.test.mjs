import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { offlineApp } from './support/offline-app.mjs';

const source = path.resolve('../..');
async function materialized(file){const s=await lstat(file);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Refuse unavailable source '+file);}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const actor = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const files = ['package.json','lib/books/catalog.ts','lib/books/bookmarks.ts','lib/books/reading-progress.ts','lib/books/editions.ts','lib/http/routeError.ts','tests/security/fakes.ts',
  'lib/circles/moderation-server.ts','lib/circles/moderation.ts','lib/circles/review-coverage.ts','lib/circles/http.ts','lib/circles/report.ts','lib/circles/server.ts','lib/circles/path.ts','lib/circles/schedule.ts','lib/circles/reading-program.ts','lib/circles/reading-program-editions.json','lib/ids/uuid.ts','lib/rateLimit.ts',
  'app/api/great-books/text/[bookId]/route.ts','app/api/great-books/edition/[bookId]/route.ts',
  'app/api/great-books/edition/[bookId]/assets/[...asset]/route.ts','app/api/great-books/edition/[bookId]/download/route.ts','app/api/great-books/progress/route.ts'];

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'soe-reading-backend-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of files) { await materialized(path.join(source,file)); const target = path.join(root,file); await mkdir(path.dirname(target),{recursive:true}); await copyFile(path.join(source,file),target); }
  const directory = path.join(root,'content/great-books/republic'); await mkdir(path.join(directory,'assets/images'),{recursive:true});
  const html = Buffer.from('<!doctype html><html lang="en"><body><h1 id="title" data-reading-index="0">Synthetic Republic</h1><p data-reading-index="1">Offline fixture.</p><footer id="pg-footer">Fixture license notice</footer></body></html>');
  const image = Buffer.from([137,80,78,71,13,10,26,10]); const archive = Buffer.from('PK\x03\x04SYNTHETIC_OFFLINE_ARCHIVE');
  const manifest = {schemaVersion:1,bookId:'republic',editionId:'pg1497-fixture-v1',
    source:{provider:'Project Gutenberg',ebookId:1497,landingUrl:'https://www.gutenberg.org/ebooks/1497',archiveUrl:'https://www.gutenberg.org/cache/epub/1497/pg1497-h.zip',archiveSha256:sha(archive),archiveBytes:archive.length,retrievedAt:'2026-11-03T00:00:00Z'},
    metadata:{sourceTitle:'The Republic',author:'Plato',translators:[{name:'Benjamin Jowett',appliesTo:'The Republic'}],editors:[],illustrators:[],rights:{jurisdiction:'US',status:'public-domain',authority:'Project Gutenberg',outsideUS:'not-assessed',reviewedAt:'2026-11-03'},licenseUrl:'https://www.gutenberg.org/policy/license.html',licenseNotice:'Synthetic offline notice; this is not an imported source edition.',editionNotes:['Synthetic fixture only.']},
    reader:{sha256:sha(html),bytes:html.length,blockCount:2,contents:[{id:'title',label:'Synthetic title',level:1,readingIndex:0}]},
    assets:[{path:'images/fixture.png',sha256:sha(image),bytes:image.length,mime:'image/png'}]};
  const saveManifest = () => writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest));
  await saveManifest(); await writeFile(path.join(directory,'reader.html'),html); await writeFile(path.join(directory,'original.zip'),archive); await writeFile(path.join(directory,'assets/images/fixture.png'),image);
  const app = offlineApp({root}); let auth=null, adminCalls=0;
  // This source-integrity fixture checks the HTTP wire only; actual CAS, grants,
  // contention and tombstones execute in saved-reading-backend.test.mjs.
  app.fakes.db.rpc = async (name, args) => {
    assert.equal(name,'soe_reading_progress_update');
    if(app.fakes.db.networkDown)return {data:null,error:{code:'SYNTHETIC_FAILURE'}};
    const rows=app.fakes.db.rows('reading_progress');let row=rows.find(x=>x.member_id===args.p_actor&&x.book_id===args.p_book_id);
    if((row?.progress_revision??0)!==args.p_expected_revision)return{data:null,error:{code:'PT409'}};
    if(!row){row={member_id:args.p_actor,book_id:args.p_book_id,progress_revision:0};rows.push(row);}
    Object.assign(row,{section_id:'soe-reading:v1:'+args.p_edition_id+':'+args.p_block_index,paragraph_index:0,completed:args.p_completed,updated_at:new Date().toISOString(),progress_removed:false,progress_revision:row.progress_revision+1});
    return {data:{...row},error:null};
  };
  app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>auth}));
  app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>{adminCalls++; return app.fakes.db;}}));
  const call = async (route,{bookId='republic',asset=['images','fixture.png'],body,query='',headers}={}) => {
    const handler = app.load(`app/api/great-books/${route}/route.ts`);
    const req=new Request(`http://localhost/api/great-books/${route}${query}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{origin:'http://localhost'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    Object.defineProperties(req,{nextUrl:{value:new URL(req.url)},cookies:{value:{get:()=>undefined}}});
    return (body===undefined?handler.GET:handler.POST)(req,{params:Promise.resolve({bookId,asset})});
  };
  return {root,directory,manifest,saveManifest,html,image,archive,app,call,setAuth:(value)=>{auth=value;},adminCalls:()=>adminCalls};
}

test('public metadata, original HTML, raster asset and original archive require no DB credentials or outbound transport',async t=>{
  const f=await fixture(t);
  const response=await f.call('text/[bookId]'); assert.equal(response.status,200); const dto=await response.json();
  assert.equal(dto.edition.blockCount,2); assert.equal(dto.edition.translators[0].name,'Benjamin Jowett');
  assert.equal(dto.edition.sourceCatalogUrl,'https://www.gutenberg.org/ebooks/1497'); assert.equal(dto.edition.licenseNotice,f.manifest.metadata.licenseNotice);
  assert(!('text' in dto)); assert(!('totalSections' in dto));
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(await (await f.call('edition/[bookId]')).text(),f.html.toString());
  assert.deepEqual(Buffer.from(await (await f.call('edition/[bookId]/assets/[...asset]')).arrayBuffer()),f.image);
  const zip=await f.call('edition/[bookId]/download'); assert.equal(zip.headers.get('content-type'),'application/zip');
  assert.match(zip.headers.get('content-disposition'),/^attachment; filename="republic-gutenberg-1497-original.zip"$/);
  assert.deepEqual(Buffer.from(await zip.arrayBuffer()),f.archive); assert.equal(f.adminCalls(),0); assert.equal(f.app.fakes.db.log.length,0);
});

test('HTML sandbox/CSP permits only same-origin raster images and inline style, without scripts or form/top navigation',async t=>{
  const f=await fixture(t); const response=await f.call('edition/[bookId]');
  const csp=response.headers.get('content-security-policy');
  for(const directive of ["default-src 'none'","img-src 'self'","style-src 'unsafe-inline'","sandbox allow-same-origin","base-uri 'none'","form-action 'none'","frame-ancestors 'self'"])assert(csp.includes(directive));
  assert(!csp.includes('allow-scripts')); assert(!csp.includes('allow-forms')); assert(!csp.includes('allow-top-navigation'));
  assert.equal(response.headers.get('x-content-type-options'),'nosniff'); assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.equal(response.headers.get('etag'),`"${f.manifest.reader.sha256}"`);
});

test('edition-pinned document URLs reject stale metadata even when a replacement has the same block count',async t=>{
  const f=await fixture(t); const dto=await (await f.call('text/[bookId]')).json();
  assert.equal(dto.edition.documentUrl,'/api/great-books/edition/republic?edition=pg1497-fixture-v1');
  const first=await f.call('edition/[bookId]',{query:'?edition='+dto.edition.editionId}); assert.equal(first.status,200); assert.equal(first.headers.get('x-soe-edition'),dto.edition.editionId);
  assert.equal(dto.edition.downloadUrl,'/api/great-books/edition/republic/download?edition=pg1497-fixture-v1');
  f.manifest.editionId='pg1497-fixture-v2'; await f.saveManifest();
  assert.equal((await f.call('edition/[bookId]',{query:'?edition='+dto.edition.editionId})).status,409);
  assert.equal((await f.call('edition/[bookId]/download',{query:'?edition='+dto.edition.editionId})).status,409);
  assert.equal((await f.call('edition/[bookId]/download',{query:'?edition=pg1497-fixture-v2'})).status,200);
  assert.equal((await f.call('edition/[bookId]',{query:'?edition=pg1497-fixture-v2'})).status,200);
  assert.equal((await f.call('edition/[bookId]',{query:'?edition=bad%2Fid'})).status,400);
  assert.equal((await f.call('edition/[bookId]',{query:'?edition=a&edition=b'})).status,400);
  assert.equal((await f.call('edition/[bookId]/download',{query:'?edition=bad%2Fid'})).status,400);
});

test('raster image hash pins reject a stale or malformed asset version',async t=>{
  const f=await fixture(t); const original=f.manifest.assets[0].sha256;
  assert.equal((await f.call('edition/[bookId]/assets/[...asset]',{query:'?sha='+original})).status,200);
  const replacement=Buffer.concat([f.image,Buffer.from([0])]);
  await writeFile(path.join(f.directory,'assets/images/fixture.png'),replacement);
  f.manifest.assets[0].sha256=sha(replacement); f.manifest.assets[0].bytes=replacement.length; await f.saveManifest();
  assert.equal((await f.call('edition/[bookId]/assets/[...asset]',{query:'?sha='+original})).status,409);
  assert.equal((await f.call('edition/[bookId]/assets/[...asset]',{query:'?sha='+sha(replacement)})).status,200);
  assert.equal((await f.call('edition/[bookId]/assets/[...asset]',{query:'?sha=not-a-hash'})).status,400);
  assert.equal((await f.call('edition/[bookId]/assets/[...asset]',{query:'?sha='+original+'&sha='+original})).status,400);
});

test('unknown books, non-manifest files, encoded/dot/backslash traversal and SVG are never served',async t=>{
  const f=await fixture(t);
  for(const bookId of ['unknown','../republic','__proto__']) assert.equal((await f.call('text/[bookId]',{bookId})).status,404);
  for(const asset of [['..','manifest.json'],['%2e%2e','original.zip'],['images\\fixture.png'],['reader.html'],['images','missing.png'],[]])assert.equal((await f.call('edition/[bookId]/assets/[...asset]',{asset})).status,404);
  f.manifest.assets[0].mime='image/svg+xml'; await f.saveManifest(); assert.equal((await f.call('text/[bookId]')).status,503);
});

test('changed source bytes or hashes fail closed without caching stale successful content',async t=>{
  const f=await fixture(t); assert.equal((await f.call('text/[bookId]')).status,200);
  await writeFile(path.join(f.directory,'reader.html'),'Altered source');
  assert.equal((await f.call('text/[bookId]')).status,503); assert.equal((await f.call('edition/[bookId]')).status,503);
  await writeFile(path.join(f.directory,'reader.html'),f.html);
  await writeFile(path.join(f.directory,'assets/images/fixture.png'),'changed'); assert.equal((await f.call('edition/[bookId]/assets/[...asset]')).status,503);
  await writeFile(path.join(f.directory,'original.zip'),'changed'); assert.equal((await f.call('edition/[bookId]/download')).status,503);
  assert.equal(f.adminCalls(),0);
});

test('symlink escape and mismatched provenance identity fail closed',async t=>{
  const f=await fixture(t);
  f.manifest.source.ebookId=1656; await f.saveManifest(); assert.equal((await f.call('text/[bookId]')).status,503);
  f.manifest.source.ebookId=1497; await f.saveManifest();
  const outside=path.join(f.root,'private-file'); await writeFile(outside,f.image);
  await rm(path.join(f.directory,'assets/images/fixture.png')); await symlink(outside,path.join(f.directory,'assets/images/fixture.png'));
  assert.equal((await f.call('edition/[bookId]/assets/[...asset]')).status,503);
});

test('versioned locators round-trip and reject malformed/unsafe indexes; legacy ordinals never resume',async t=>{
  const f=await fixture(t); const b=f.app.load('lib/books/bookmarks.ts');
  const locator=b.encodeBookmarkLocator('pg1497-fixture-v1',1); assert.equal(locator,'soe-reading:v1:pg1497-fixture-v1:1');
  assert.equal(JSON.stringify(b.parseBookmarkLocator(locator)),JSON.stringify({editionId:'pg1497-fixture-v1',blockIndex:1}));
  for(const value of ['1','soe-reading:v1:pg:01','soe-reading:v1:pg:-1','soe-reading:v1:pg:9007199254740992','soe-reading:v1:../pg:0',null])assert.equal(b.parseBookmarkLocator(value),null);
  assert.equal(b.interpretBookmark('10','pg1497-fixture-v1',2).status,'legacy');
  assert.equal(b.interpretBookmark(locator,'different-edition',2).status,'edition_changed');
  assert.equal(b.interpretBookmark(locator,'pg1497-fixture-v1',1).status,'invalid');
  assert.equal(b.interpretBookmark(locator,'pg1497-fixture-v1',2).status,'current');
});

test('public DTO parser projects only known fields and rejects forged URLs and malformed TOC',async t=>{
  const f=await fixture(t); const parser=f.app.load('lib/books/bookmarks.ts').parseBookEditionResponse;
  const dto=await (await f.call('text/[bookId]')).json(); dto.secret='NEVER_COPY'; dto.edition.secret='NEVER_COPY';
  assert(!JSON.stringify(parser(dto)).includes('NEVER_COPY'));
  for(const mutate of [d=>d.edition.documentUrl='https://evil.invalid',d=>d.edition.sourceArchiveUrl='https://www.gutenberg.org@evil.invalid/source.zip',d=>d.edition.contents[0].readingIndex=2,d=>d.edition.contents.push({...d.edition.contents[0]})]){
    const invalid=structuredClone(dto); mutate(invalid); assert.equal(parser(invalid),null);
  }
});

test('private progress refuses unauthenticated/forged actor and old numeric POST without any write',async t=>{
  const f=await fixture(t);
  assert.equal((await f.call('progress',{query:'?bookId=republic'})).status,401);
  assert.equal((await f.call('progress',{body:{bookId:'republic',editionId:f.manifest.editionId,blockIndex:1}})).status,401);
  f.setAuth({memberId:actor});
  assert.equal((await f.call('progress',{body:{expectedMemberId:other,expectedRevision:0,action:'save',completed:false,bookId:'republic',editionId:f.manifest.editionId,blockIndex:1}})).status,409);
  assert.equal((await f.call('progress',{body:{bookId:'republic',sectionId:'1',paragraphIndex:0}})).status,400);
  assert.equal(f.adminCalls(),0);
});

test('explicit valid bookmark writes only canonical actor/versioned locator and returns confirmed receipt',async t=>{
  const f=await fixture(t); f.setAuth({memberId:actor});
  const response=await f.call('progress',{body:{expectedMemberId:actor,expectedRevision:0,action:'save',bookId:'republic',editionId:f.manifest.editionId,blockIndex:1,completed:true}});
  assert.equal(response.status,200); assert.equal((await response.json()).progress[0].bookmark.status,'current');
  const row=f.app.fakes.db.rows('reading_progress')[0];
  assert.equal(row.member_id,actor); assert.equal(row.section_id,'soe-reading:v1:pg1497-fixture-v1:1'); assert.equal(row.paragraph_index,0); assert.equal(row.completed,true);
  assert.match(response.headers.get('cache-control'),/no-store/);
});

test('mismatched edition, invalid book/block/body and unavailable source cannot write a bookmark',async t=>{
  const f=await fixture(t); f.setAuth({memberId:actor}); const base={expectedMemberId:actor,expectedRevision:0,action:'save',completed:false,bookId:'republic',editionId:f.manifest.editionId,blockIndex:0};
  for(const [body,status] of [[{...base,editionId:'older-edition'},409],[{...base,blockIndex:2},400],[{...base,blockIndex:-1},400],[{...base,blockIndex:0.5},400],[{...base,bookId:'unknown'},400],[{...base,completed:'yes'},400],[{...base,extra:'x'},400]])assert.equal((await f.call('progress',{body})).status,status);
  await writeFile(path.join(f.directory,'reader.html'),'altered'); assert.equal((await f.call('progress',{body:base})).status,503);
  assert.equal(f.adminCalls(),0);
});

test('GET progress is self-scoped and projects legacy/current/different-edition status without identity fields',async t=>{
  const f=await fixture(t); f.setAuth({memberId:actor});
  const base={book_id:'republic',paragraph_index:0,completed:false,updated_at:null,progress_revision:0,progress_removed:false};
  for(const [section,status] of [['10','legacy'],['soe-reading:v1:old-edition:1','edition_changed'],['soe-reading:v1:pg1497-fixture-v1:1','current'],['soe-reading:v1:pg1497-fixture-v1:99','invalid']]){
    f.app.fakes.resetDb({reading_progress:[{...base,member_id:actor,section_id:section,email:'private@example.invalid'},{...base,member_id:other,section_id:'other-user-secret'}]});
    assert.equal((await f.call('progress',{query:'?bookId=republic&memberId='+other})).status,400);
    const response=await f.call('progress',{query:'?bookId=republic'}); assert.equal(response.status,200);
    const body=await response.json(); assert.equal(body.progress.length,1); assert.equal(body.progress[0].bookmark.status,status); assert.equal(body.progress[0].sectionId,section);
    assert(!JSON.stringify(body).includes('member_id')); assert(!JSON.stringify(body).includes('private@example')); assert(!JSON.stringify(body).includes('other-user-secret'));
    assert.match(response.headers.get('cache-control'),/no-store/);
  }
});

test('progress infrastructure failures return generic errors and never a false saved receipt',async t=>{
  const f=await fixture(t); f.setAuth({memberId:actor}); f.app.fakes.db.networkDown={cause:'SYNTHETIC_FAILURE'};
  for(const opts of [{query:'?bookId=republic'},{body:{expectedMemberId:actor,expectedRevision:0,action:'save',completed:false,bookId:'republic',editionId:f.manifest.editionId,blockIndex:0}}]){
    const response=await f.call('progress',opts); assert.equal(response.status,503); const body=await response.json(); assert(!body.ok); assert(!JSON.stringify(body).includes('SYNTHETIC_FAILURE'));
  }
});

test('bookmark mutation blocks cross-origin and ambiguous cookie requests while accepting canonical bearer-only calls',async t=>{
  const f=await fixture(t); f.setAuth({memberId:actor});
  const handler=f.app.load('app/api/great-books/progress/route.ts'); const body={expectedMemberId:actor,expectedRevision:0,action:'save',completed:false,bookId:'republic',editionId:f.manifest.editionId,blockIndex:0};
  for(const headers of [{origin:'https://evil.invalid'},{origin:'http://localhost','sec-fetch-site':'cross-site'},{cookie:'synthetic=only'}]){
    const response=await handler.POST(new Request('http://localhost/api/great-books/progress',{method:'POST',headers,body:JSON.stringify(body)}));
    assert.equal(response.status,403);
  }
  assert.equal(f.adminCalls(),0);
  const response=await handler.POST(new Request('http://localhost/api/great-books/progress',{method:'POST',headers:{authorization:'Bearer SYNTHETIC_OFFLINE_ONLY'},body:JSON.stringify(body)}));
  assert.equal(response.status,200);
});

test('bookmark reader bounds actual streaming UTF-8 bytes before JSON parse or persistence',async t=>{
  const f=await fixture(t); f.setAuth({memberId:actor}); const handler=f.app.load('app/api/great-books/progress/route.ts');
  const bytes=new TextEncoder().encode(JSON.stringify({bookId:'republic',padding:'界'.repeat(5000)}));
  assert(bytes.length>12000);
  const stream=new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,8000));controller.enqueue(bytes.slice(8000));controller.close();}});
  const request=new Request('http://localhost/api/great-books/progress',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json','content-length':'1'},body:stream,duplex:'half'});
  assert.equal((await handler.POST(request)).status,413); assert.equal(f.adminCalls(),0);
  const oversized=new Request('http://localhost/api/great-books/progress',{method:'POST',headers:{origin:'http://localhost','content-length':'999999'},body:'{}'});
  assert.equal((await handler.POST(oversized)).status,413);
  const malformed=new Request('http://localhost/api/great-books/progress',{method:'POST',headers:{origin:'http://localhost'},body:'not json'});
  assert.equal((await handler.POST(malformed)).status,400);
});

test('identity-provider failures mean unavailable verification, not signed-out or empty progress',async t=>{
  const f=await fixture(t);
  f.app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>{throw Error('SYNTHETIC_PROVIDER_DETAIL');}}));
  for(const opts of [{query:'?bookId=republic'},{body:{expectedMemberId:actor,expectedRevision:0,action:'save',completed:false,bookId:'republic',editionId:f.manifest.editionId,blockIndex:0}}]){
    const response=await f.call('progress',opts); assert.equal(response.status,503);
    const body=await response.json(); assert(!('progress' in body)); assert(!JSON.stringify(body).includes('SYNTHETIC_PROVIDER_DETAIL'));
  }
  assert.equal(f.adminCalls(),0);
});

test('all eight pinned editions serve their complete verified HTML, every whitelisted raster image and exact original archive offline',async()=>{
  const app=offlineApp(); let adminCalls=0;
  app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin(){adminCalls++;throw Error('Public reader attempted database access');}}));
  const books=app.load('lib/books/catalog.ts').GREAT_BOOKS;
  const metadataRoute=app.load('app/api/great-books/text/[bookId]/route.ts');
  const htmlRoute=app.load('app/api/great-books/edition/[bookId]/route.ts');
  const imageRoute=app.load('app/api/great-books/edition/[bookId]/assets/[...asset]/route.ts');
  const zipRoute=app.load('app/api/great-books/edition/[bookId]/download/route.ts');
  assert.equal(books.length,8);
  for(const book of books){
    const params={params:Promise.resolve({bookId:book.id})}; const request=new Request('http://localhost/api/great-books/text/'+book.id);
    await materialized(path.join(source,'content/great-books',book.id,'manifest.json'));
    const manifest=JSON.parse(await readFile(path.join(source,'content/great-books',book.id,'manifest.json'),'utf8'));
    for(const file of ['reader.html','original.zip',...manifest.assets.map(asset=>'assets/'+asset.path)])await materialized(path.join(source,'content/great-books',book.id,file));
    const metadata=await metadataRoute.GET(request,params); assert.equal(metadata.status,200,book.id); const dto=await metadata.json();
    assert.equal(dto.edition.editionId,manifest.editionId); assert.equal(dto.edition.blockCount,manifest.reader.blockCount);
    const html=await htmlRoute.GET(new Request('http://localhost'+dto.edition.documentUrl),params); assert.equal(html.status,200,book.id);
    assert.equal(sha(Buffer.from(await html.arrayBuffer())),manifest.reader.sha256,book.id+' complete HTML');
    const archive=await zipRoute.GET(new Request('http://localhost'+dto.edition.downloadUrl),params); assert.equal(archive.status,200,book.id);
    assert.equal(sha(Buffer.from(await archive.arrayBuffer())),manifest.source.archiveSha256,book.id+' original ZIP');
    for(const asset of manifest.assets){
      const image=await imageRoute.GET(new Request('http://localhost/api/image?sha='+asset.sha256),{params:Promise.resolve({bookId:book.id,asset:asset.path.split('/')})});
      assert.equal(image.status,200,book.id+'/'+asset.path); assert.equal(image.headers.get('content-type'),asset.mime);
      assert.equal(sha(Buffer.from(await image.arrayBuffer())),asset.sha256,book.id+'/'+asset.path);
    }
  }
  assert.equal(adminCalls,0);
});
