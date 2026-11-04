// Actual Hall page, shared public parser and CSS; only NextLink has an explicit adapter.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const sourceFiles = ['app/hall/page.tsx', 'lib/hall/public.ts', 'app/globals.css', 'verification/web/tests/hall-entry.tsx'];
const hash = value => createHash('sha256').update(value).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(name => [name, hash(fs.readFileSync(name))]));
const result = await Bun.build({ entrypoints: ['verification/web/tests/hall-entry.tsx'], target: 'browser', format: 'esm',
  outdir: 'verification/web/evidence/hall-fixture', naming: { entry: 'page.[ext]', chunk: 'chunk-[hash].[ext]', asset: 'asset-[hash].[ext]' },
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'hall-no-provider-imports', setup(build) {
    build.onResolve({ filter: /(?:supabase|@\/lib\/auth\/|next\/image)/ }, () => { throw new Error('Public text Hall must not bundle auth, database SDK or media loaders'); });
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'hall-qa' }));
    build.onLoad({ filter: /.*/, namespace: 'hall-qa' }, () => ({ loader: 'js', resolveDir: process.cwd(), contents:
      'import React from "react";export default function Link({href,children,prefetch,...props}){return React.createElement("a",{href,...props},children);}' }));
  } }],
});
for (const log of result.logs) process.stderr.write(String(log) + '\n');
if (!result.success) process.exitCode = 1;
else {
  for (const [name, expected] of Object.entries(sourceHashes)) if (hash(fs.readFileSync(name)) !== expected) throw new Error('Hall source changed during bundle: ' + name);
  fs.writeFileSync('verification/web/evidence/hall-fixture/source-manifest.json', JSON.stringify({ sourceHashes, bunVersion: Bun.version,
    scope: 'Actual React Hall page and shared pure public parser with canonical component/global static CSS. Explicit NextLink adapter, controlled local HTTP DTOs and non-abortable JSON-body transport double; no API/SQL/provider acceptance.',
    cssProcessing: 'Bun global static CSS plus actual component style element. Ignored Tailwind directives do not establish Next/PostCSS or local-font output.' }, null, 2) + '\n');
  console.log('Built actual text-only Hall page and pure public parser; no provider adapters/imports.');
}
