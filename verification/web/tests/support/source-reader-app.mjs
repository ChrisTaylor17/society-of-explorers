// Actual public document/image handlers; all requests stay in this process.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../../',import.meta.url);
export const ORIGIN='https://source-reader.test';
export async function sourceReaderSource(name){assert(typeof name==='string'&&!name.startsWith('/')&&!name.split('/').includes('..'));const file=new URL(name,root),s=await lstat(file);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Refuse linked/offloaded source '+name);return readFile(file);}
await sourceReaderSource('verification/web/tests/support/offline-app.mjs');
const {offlineApp}=await import('./offline-app.mjs');
const routePaths=['app/api/great-books/edition/[bookId]/reader/route.ts','app/api/great-books/edition/[bookId]/route.ts','app/api/great-books/edition/[bookId]/assets/[...asset]/route.ts','app/api/great-books/text/[bookId]/route.ts'];
export async function sourceReaderAppHashes(){
 const hashes={},seen=new Set();
 async function bind(name){if(seen.has(name))return;seen.add(name);const bytes=await sourceReaderSource(name);hashes[name]=createHash('sha256').update(bytes).digest('hex');if(!name.endsWith('.ts'))return;
  for(const match of bytes.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)){const spec=match[1];if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;const target=spec.startsWith('@/')?spec.slice(2):fileURLToPath(new URL(spec,new URL(name,root))).slice(fileURLToPath(root).length);await bind(/\.(?:ts|json)$/.test(target)?target:target+'.ts');}
 }
 for(const name of [...routePaths,'scripts/generate-source-reader.py','verification/web/tests/support/source-reader-app.mjs','verification/web/tests/support/offline-app.mjs','tests/security/fakes.ts'])await bind(name);
 const catalog=JSON.parse(await sourceReaderSource('lib/books/source-reader-catalog.json'));
 for(const edition of catalog.editions){for(const name of ['manifest.json','reader.html','native-reader.html',...edition.assets.map(asset=>'assets/'+asset.path)])await bind(`content/great-books/${edition.bookId}/${name}`);}
 return hashes;
}
export async function createSourceReaderApp({root:appRoot}={}){
 if(!appRoot)await sourceReaderAppHashes();const app=offlineApp(appRoot?{root:appRoot}:{}),calls=[];let closed=false;
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin(){throw Error('Public reader attempted account data access');}}));
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember(){throw Error('Public reader attempted identity verification');}}));
 const routes=new Map(),load=name=>{if(!routes.has(name))routes.set(name,app.load(name));return routes.get(name);};
 async function dispatch(path,{method='GET',headers={}}={}){
  assert(!closed);const url=new URL(path,ORIGIN);assert.equal(url.origin,ORIGIN);assert.equal(method,'GET');const h=new Headers(headers);for(const key of ['authorization','cookie','apikey','referer'])assert(!h.has(key));
  const document=/^\/api\/great-books\/edition\/([^/]+)(\/reader)?$/.exec(url.pathname),asset=/^\/api\/great-books\/edition\/([^/]+)\/assets\/(.+)$/.exec(url.pathname),metadata=/^\/api\/great-books\/text\/([^/]+)$/.exec(url.pathname);
  assert(document||asset||metadata,'Unexpected reader route');const name=asset?routePaths[2]:metadata?routePaths[3]:document[2]?routePaths[0]:routePaths[1];
  const params=asset?{bookId:asset[1],asset:asset[2].split('/')}:{bookId:(metadata??document)[1]};calls.push({path:url.pathname+url.search,method,headers:[...h]});
  return load(name).GET(new Request(url,{headers:h}),{params:Promise.resolve(params)});
 }
 return{app,calls,dispatch,close(){closed=true;}};
}
