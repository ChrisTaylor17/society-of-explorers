// Actual LegacySalon and auth/rendering helpers; only SDK, NextLink and route params are explicit adapters.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const sourceFiles = ['app/book-salons/[cohortId]/LegacySalon.tsx', 'app/globals.css', 'lib/auth/getSession.ts',
  'lib/auth/providerSelection.ts', 'lib/auth/staleSupabaseAuth.ts', 'lib/auth/memberDto.ts', 'lib/circles/client.ts',
  'lib/books/catalog.ts', 'lib/renderMarkdown.ts', 'lib/ids/uuid.ts', 'verification/web/tests/legacy-salon-entry.tsx'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(name => [name, hash(fs.readFileSync(name))]));
const result = await Bun.build({
  entrypoints: ['verification/web/tests/legacy-salon-entry.tsx'], target: 'browser', format: 'esm',
  outdir: 'verification/web/evidence/legacy-salon-fixture', naming: { entry: 'page.[ext]', chunk: 'chunk-[hash].[ext]', asset: 'asset-[hash].[ext]' },
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'legacy-salon-explicit-adapters', setup(build) {
    build.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: 'sdk', namespace: 'salon-qa' }));
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'salon-qa' }));
    build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'params', namespace: 'salon-qa' }));
    build.onLoad({ filter: /.*/, namespace: 'salon-qa' }, args => ({ loader: 'js', resolveDir: process.cwd(), contents:
      args.path === 'sdk' ? 'export function createClient(){return window.salonQa.factory();}' : args.path === 'params'
        ? 'export function useParams(){return {cohortId:"33333333-3333-4333-8333-333333333333"};}'
        : 'import React from "react";export default function Link({href,children,...props}){return React.createElement("a",{href,...props},children);}' }));
  } }],
});
for (const log of result.logs) process.stderr.write(String(log) + '\n');
if (!result.success) process.exitCode = 1;
else {
  for (const [name, expected] of Object.entries(sourceHashes)) {
    if (hash(fs.readFileSync(name)) !== expected) throw Error('Salon fixture source changed during bundle: ' + name);
  }
  fs.writeFileSync('verification/web/evidence/legacy-salon-fixture/source-manifest.json', JSON.stringify({ sourceHashes, bunVersion: Bun.version,
    scope: 'Actual product component, auth/selection/rendering helpers and canonical CSS. Explicit SDK, NextLink and fixed route-param adapters; controlled HTTP DTOs. No API/SQL/provider acceptance.',
    cssProcessing: 'Canonical component style element and Bun global static CSS; ignored Tailwind directives do not establish Next/PostCSS or local-font output.' }, null, 2) + '\n');
  console.log('Built actual LegacySalon and helpers with explicit local adapters.');
}
