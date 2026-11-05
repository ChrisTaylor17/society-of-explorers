// Deterministic offline snapshot for portable metadata verification. No provider
// calls, content imports, dependency installation, or source-edition changes.
import assert from 'node:assert/strict';
import {lstat,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function source(name){const path=new URL(name,root),info=await lstat(path);assert.ok(info.isFile()&&!info.isSymbolicLink()&&(!info.size||info.blocks),'Refuse nonmaterialized source '+name);return readFile(path);}
const pins=JSON.parse(await source('lib/books/passage-indexes.json')),editions=JSON.parse(await source('lib/circles/reading-program-editions.json'));
const records=[];
for(const pin of pins){
 assert.match(pin.bookId,/^[a-z][a-z0-9-]*$/);const name='content/great-books/'+pin.bookId+'/';
 const manifest=JSON.parse(await source(name+'manifest.json')),reader=await source(name+'reader.html'),index=await source(name+'passages.json');
 const edition=editions.find(e=>e.bookId===pin.bookId&&e.editionId===pin.editionId);
 assert.ok(edition);assert.equal(manifest.bookId,pin.bookId);assert.equal(manifest.editionId,pin.editionId);
 assert.equal(edition.blockCount,pin.blockCount);assert.equal(manifest.reader.blockCount,pin.blockCount);
 assert.equal(reader.length,manifest.reader.bytes);assert.equal(sha(reader),manifest.reader.sha256);assert.equal(sha(reader),pin.documentSha256);
 assert.equal(index.length,pin.indexBytes);assert.equal(sha(index),pin.indexSha256);
 const m=manifest.metadata,rights={jurisdiction:m.rights.jurisdiction,status:m.rights.status,authority:m.rights.authority,outsideUS:m.rights.outsideUS,reviewedAt:m.rights.reviewedAt};
 assert.deepEqual([rights.jurisdiction,rights.status,rights.authority,rights.outsideUS],['US','public-domain','Project Gutenberg','not-assessed']);
 const translators=m.translators.map(t=>({name:t.name,appliesTo:t.appliesTo}));
 const tuple=[m.sourceTitle,m.author,translators,m.editors,m.illustrators,rights,m.licenseUrl,m.licenseNotice,m.editionNotes,manifest.source.landingUrl,manifest.source.archiveUrl];
 assert.equal(sha(JSON.stringify(tuple)),pin.metadataSha256,'Metadata pin mismatch '+pin.bookId);
 const attribution=[m.sourceTitle,m.author,...translators.map(t=>`${t.name} (translation: ${t.appliesTo})`),...m.editors.map(n=>`${n} (editor)`),...m.illustrators.map(n=>`${n} (illustrator)`),`Project Gutenberg ebook ${manifest.source.ebookId}`].join(' · ');
 records.push({bookId:pin.bookId,editionId:pin.editionId,metadataSha256:pin.metadataSha256,tuple,attribution});
}
const result=Buffer.from(JSON.stringify({version:1,editions:records},null,2)+'\n'),output='platforms/shared/reading-metadata.json';
if(process.argv.includes('--write')){
 try{await source(output);}catch(error){if(error.code!=='ENOENT')throw error;}
 await writeFile(new URL(output,root),result);
}else assert.deepEqual(await source(output),result,'Reading metadata snapshot is stale');
process.stdout.write(JSON.stringify({status:'PASS',mode:process.argv.includes('--write')?'write':'check',editions:records.length,sha256:sha(result),sourceDocumentsChanged:false})+'\n');
