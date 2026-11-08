import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),require=createRequire(import.meta.url),[variant,run,...extra]=process.argv.slice(2);
if(extra.length||!['native','quest'].includes(variant)||!run||!/^[a-z0-9-]{1,48}$/.test(run))throw Error('Supply a platform and unique bounded evidence name');
const output=path.join(ROOT,'verification/web/evidence/platform-admission-'+variant+'-'+run);fs.mkdirSync(output);
const hashes={},sha=b=>createHash('sha256').update(b).digest('hex');
function read(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size&&!s.blocks)throw Error('Unavailable source '+file);return fs.readFileSync(file);}
const {webpack}=require(path.join(ROOT,'node_modules/next/dist/compiled/webpack/webpack.js'));
const aliases={'react-native$':path.join(ROOT,'platforms/tests/native-admission-primitives.tsx'),
 '@/lib/supabase/client$':path.join(ROOT,'platforms/tests/quest-admission-client.ts'),'next/link$':path.join(ROOT,'platforms/tests/admission-link-double.tsx'),'@':ROOT};
const compiler=webpack({mode:'development',devtool:false,target:'web',context:ROOT,entry:'./platforms/tests/'+variant+'-admission-flow-entry.tsx',
 output:{path:output,filename:'page.js'},resolve:{extensions:['.tsx','.ts','.mjs','.js','.json'],alias:aliases},
 plugins:[new webpack.DefinePlugin({'process.env.NEXT_PUBLIC_SUPABASE_URL':JSON.stringify('https://synthetic-quest-provider.example.test'),'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':JSON.stringify('NONISSUED_SYNTHETIC_PUBLISHABLE')})],
 module:{rules:[{test:/\.[cm]?[jt]sx?$/,exclude:/node_modules/,use:path.join(ROOT,'verification/web/scripts/admission-fixture-loader.cjs')},{test:/\.css$/,use:path.join(ROOT,'verification/web/scripts/admission-fixture-loader.cjs')}]},
});
try{
 const stats=await new Promise((yes,no)=>compiler.run((error,stats)=>error?no(error):yes(stats)));if(stats.hasErrors())throw Error(stats.toString({all:false,errors:true}));
 for(const file of stats.compilation.fileDependencies)if(file.startsWith(ROOT+'/')&&!file.includes('/node_modules/')&&fs.lstatSync(file).isFile())hashes[path.relative(ROOT,file)]=sha(read(file));
 for(const file of ['platforms/tests/bundle-platform-admission.mjs','verification/web/scripts/admission-fixture-loader.cjs'])hashes[file]=sha(read(path.join(ROOT,file)));
 const css=['app/circles/participation.module.css','app/quest/[circleId]/quest.module.css'].map(name=>{const value=read(path.join(ROOT,name));hashes[name]=sha(value);return value;});
 fs.writeFileSync(path.join(output,'style.css'),Buffer.concat(css));fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify({sourceHashes:hashes,bundler:'Resident Next-pinned webpack and TypeScript; no install',scope:variant==='native'?'Actual native admission component/controller/JS ports; React Native,owner,bridge,HTTP doubles.':'Actual QuestCircle,web admission hook/component,platform DOM and XR canvas; SDK,Next Link,network delivery and XR runtime are explicit doubles.'},null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',variant,sourceFiles:Object.keys(hashes).length,output}));
}finally{await new Promise((yes,no)=>compiler.close(error=>error?no(error):yes()));}
