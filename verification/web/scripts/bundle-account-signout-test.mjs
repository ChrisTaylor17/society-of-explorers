// Test-only adapters; the actual dashboard, navigation, sign-out UI and helpers
// are bundled unchanged with installed React. No adapter enters product code.
const result = await Bun.build({ entrypoints: ['verification/web/tests/account-signout-entry.tsx'], target: 'browser', format: 'esm',
  outdir: 'verification/web/evidence/account-signout-fixture', naming: 'page.mjs', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'explicit-signout-fixture-adapters', setup(build) {
    build.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: 'sdk', namespace: 'signout-qa' }));
    build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'signout-qa' }));
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'signout-qa' }));
    build.onLoad({ filter: /.*/, namespace: 'signout-qa' }, args => ({ loader: 'js', resolveDir: process.cwd(), contents:
      args.path === 'sdk' ? 'export function createClient(){return window.signoutQa.factory();}' :
      args.path === 'navigation' ? 'export function useRouter(){return window.signoutQa.router;}' :
      'import React from "react";export default function Link({href,children,...props}){return React.createElement("a",{href,...props},children);}' }));
  } }],
});
for (const log of result.logs) process.stderr.write(String(log) + '\n');
if (!result.success) process.exitCode = 1;
else process.stdout.write('Built test-only actual dashboard and browser sign-out fixture.\n');
