import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),require=createRequire(import.meta.url),[run,...extra]=process.argv.slice(2);
if(extra.length||!run||!/^[a-z0-9-]{1,48}$/.test(run))throw Error('Supply a unique bounded evidence name');
const output=path.join(ROOT,'verification/web/evidence/circle-admission-web-fixture-'+run);
fs.mkdirSync(output);
const hashes={},sha=b=>createHash('sha256').update(b).digest('hex');
function read(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size&&!s.blocks)throw Error('Unavailable source '+file);return fs.readFileSync(file);}
const doubles=path.join(ROOT,'verification/web/tests/support/admission-web-doubles.tsx');
const {webpack}=require(path.join(ROOT,'node_modules/next/dist/compiled/webpack/webpack.js'));
const compiler=webpack({mode:'development',devtool:false,target:'web',context:ROOT,entry:'./verification/web/tests/support/circle-admission-web-entry.tsx',
 output:{path:output,filename:'page.js'},resolve:{extensions:['.tsx','.ts','.mjs','.js','.json'],alias:{'@/lib/circles/client$':doubles,'@/lib/supabase/client$':doubles,'next/link$':doubles,'@':ROOT}},
 module:{rules:[{test:/\.[cm]?[jt]sx?$/,exclude:/node_modules/,use:path.join(ROOT,'verification/web/scripts/admission-fixture-loader.cjs')},{test:/\.css$/,use:path.join(ROOT,'verification/web/scripts/admission-fixture-loader.cjs')}]}});
try{
 const stats=await new Promise((yes,no)=>compiler.run((error,stats)=>error?no(error):yes(stats)));
 if(stats.hasErrors())throw Error(stats.toString({all:false,errors:true}));
 for(const file of stats.compilation.fileDependencies){if(file.startsWith(ROOT+'/')&&!file.includes('/node_modules/')&&fs.lstatSync(file).isFile())hashes[path.relative(ROOT,file)]=sha(read(file));}
 for(const file of ['verification/web/scripts/bundle-circle-admission-web.mjs','verification/web/scripts/admission-fixture-loader.cjs'])hashes[file]=sha(read(path.join(ROOT,file)));
 const css=Buffer.concat(['app/circles/participation.module.css','app/circles/reading-program.module.css'].map(name=>{const b=read(path.join(ROOT,name));hashes[name]=sha(b);return b;}));
 fs.writeFileSync(path.join(output,'participation.css'),css);
 fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify({sourceHashes:hashes,bundler:'Existing Next.js-pinned webpack; existing TypeScript transpiler',scope:'Actual invitation/hosting components and hooks. Credentials, subscription delivery and Next Link are explicit doubles; no package install.'},null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',files:Object.keys(hashes).length,output}));
}finally{await new Promise((yes,no)=>compiler.close(error=>error?no(error):yes()));}
