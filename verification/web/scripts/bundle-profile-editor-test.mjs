// Only SDK and NextLink have test adapters. Product page, editor, strict DTO
// parser, auth proof/selection helpers and actual CSS are included unchanged.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const sourceFiles = ['app/account/profile/ProfileEditor.tsx', 'app/account/profile/page.tsx', 'app/account/profile/profile.module.css',
  'app/globals.css', 'lib/members/profile.ts', 'lib/auth/getSession.ts', 'lib/auth/providerSelection.ts',
  'lib/auth/staleSupabaseAuth.ts', 'lib/auth/memberDto.ts', 'lib/circles/client.ts', 'verification/web/tests/profile-editor-entry.tsx'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(name => [name, hash(fs.readFileSync(name))]));
const result = await Bun.build({
  entrypoints: ['verification/web/tests/profile-editor-entry.tsx'], target: 'browser', format: 'esm',
  outdir: 'verification/web/evidence/profile-editor-fixture', naming: { entry: 'page.[ext]', chunk: 'chunk-[hash].[ext]', asset: 'asset-[hash].[ext]' },
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'profile-editor-explicit-adapters', setup(build) {
    build.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: 'sdk', namespace: 'profile-qa' }));
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'profile-qa' }));
    build.onLoad({ filter: /.*/, namespace: 'profile-qa' }, args => ({ loader: 'js', resolveDir: process.cwd(), contents:
      args.path === 'sdk' ? 'export function createClient(){return window.profileQa.factory();}' :
        'import React from "react";export default function Link({href,children,...props}){return React.createElement("a",{href,...props},children);}' }));
  } }],
});
for (const log of result.logs) process.stderr.write(String(log) + '\n');
if (!result.success) process.exitCode = 1;
else {
  for (const [name, expected] of Object.entries(sourceHashes)) {
    if (hash(fs.readFileSync(name)) !== expected) throw Error('Profile fixture source changed during bundle: ' + name);
  }
  fs.writeFileSync('verification/web/evidence/profile-editor-fixture/source-manifest.json', JSON.stringify({
    sourceHashes, bunVersion: Bun.version,
    cssProcessing: 'Bun includes canonical module CSS and global static rules; its three ignored @tailwind directives do not prove the Next/PostCSS utility or local-font pipeline.',
  }, null, 2) + '\n');
  process.stdout.write('Built actual profile page/editor/parser/auth helpers and canonical CSS with explicit test adapters.\n');
}
