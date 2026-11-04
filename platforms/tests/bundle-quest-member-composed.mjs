// No native source/dependency hydration; browser graph only, guarded per input.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const hashes = {}, sha = bytes => createHash('sha256').update(bytes).digest('hex');
function read(name) {
  const info = fs.statSync(name); if (info.size && !info.blocks) throw Error('Refuse offloaded source: ' + name);
  const bytes = fs.readFileSync(name), relative = path.relative(process.cwd(), name);
  if (!relative.startsWith('..') && !relative.split(path.sep).includes('node_modules')) hashes[relative] = sha(bytes);
  return bytes;
}
const output = 'platforms/evidence/quest-member-composed-fixture';
const result = await Bun.build({ entrypoints: ['platforms/tests/quest-member-composed-entry.tsx'], outdir: output,
  target: 'browser', format: 'esm', naming: 'page.[ext]', define: {
    'process.env.NODE_ENV': '"development"',
    'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://synthetic-provider.example.test"',
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"NONISSUED_QUEST_PUBLIC_FIXTURE"',
  }, plugins: [{ name: 'explicit-quest-composed-ports', setup(build) {
    build.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: 'sdk', namespace: 'quest-composed' }));
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'quest-composed' }));
    build.onLoad({ filter: /.*/, namespace: 'quest-composed' }, args => ({ loader: 'js', resolveDir: process.cwd(),
      contents: args.path === 'sdk' ? 'export function createClient(){return window.questComposedQa.factory();}'
        : 'import React from "react";export default function Link({children,href,prefetch,replace,scroll,...p}){return React.createElement("a",{href,...p},children);}' }));
    build.onLoad({ filter: /\.(?:[cm]?[jt]sx?|json|css)$/ }, args => ({ contents: read(args.path).toString(),
      loader: args.path.endsWith('.tsx') ? 'tsx' : args.path.endsWith('.ts') ? 'ts' : args.path.endsWith('.json') ? 'json' : args.path.endsWith('.css') ? 'css' : 'jsx', resolveDir: path.dirname(args.path) }));
  } }] });
for (const log of result.logs) console.error(String(log)); if (!result.success) throw Error('Quest composition bundle failed');
for (const [name, expected] of Object.entries({ ...hashes })) if (sha(read(name)) !== expected) throw Error('Source changed during bundle: ' + name);
fs.writeFileSync(output + '/source-manifest.json', JSON.stringify({ sourceHashes: hashes, bunVersion: Bun.version,
  scope: 'Actual QuestCircle, member auth bridge, generated Quest host/view and Bun CSS modules. Explicit synthetic SDK/config and NextLink adapter; no issued credentials, native graph, Next runtime or headset.' }, null, 2) + '\n');
console.log('Built actual Quest member component and platform host for composed proof.');
