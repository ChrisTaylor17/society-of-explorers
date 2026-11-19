// Test-only fixture bundle: exact product TSX and helpers, with disclosed SDK,
// Next Link and CSS adapters. None of these adapters enters a product bundle.
const result = await Bun.build({entrypoints:['platforms/tests/quest-page-entry.tsx'],target:'browser',format:'esm',
 outdir:'platforms/evidence/quest-page-fixture',naming:'page.mjs',define:{'process.env.NODE_ENV':'"development"',
 'process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://supabase.fixture.test"','process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':'"NONISSUED_TEST_PUBLIC_KEY"'},
 plugins:[{name:'explicit-local-fixture-adapters',setup(build){
  build.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'sdk',namespace:'qa'}));
  build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'qa'}));
  build.onResolve({filter:/\.module\.css$/},()=>({path:'css',namespace:'qa'}));
  build.onLoad({filter:/.*/,namespace:'qa'},args=>({loader:'js',resolveDir:process.cwd(),contents:
   args.path==='sdk'?'export function createClient(){return window.questQa.factory();}':
   args.path==='link'?'import React from "react";export default function Link({href,children}){return React.createElement("a",{href},children);}':
   'export default {scope:"quest-fixture-scope"};'}));
 }}]});
for(const log of result.logs)process.stderr.write(String(log)+'\n');
if(!result.success)process.exitCode=1;else process.stdout.write('Built test-only actual QuestCircle component fixture.\n');
