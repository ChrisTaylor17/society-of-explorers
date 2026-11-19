// Exact client page + cached React. Only shared navigation and the legacy
// session-hint utilities are replaced; the page's own lifetime/rendering runs.
const result = await Bun.build({ entrypoints: ['verification/web/tests/support/public-community-entry.tsx'], target: 'browser', format: 'esm',
  outdir: 'verification/web/evidence/public-community-fixture', naming: 'page.mjs', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'public-community-fixture-boundaries', setup(build) {
    build.onResolve({ filter: /^@\/components\/(PublicNav|PublicFooter)$/ }, () => ({ path: 'shell', namespace: 'qa' }));
    build.onResolve({ filter: /^@\/lib\/auth\/getSession$/ }, () => ({ path: 'session', namespace: 'qa' }));
    build.onLoad({ filter: /.*/, namespace: 'qa' }, args => ({ loader: 'js', contents: args.path === 'shell' ? 'export default function Shell(){return null;}' :
      'export async function getMemberSession(){return {member:{id:"11111111-1111-4111-8111-111111111111"}};} export async function getSupabaseAccessToken(){return null;}' }));
  } }],
});
if (!result.success) { for (const log of result.logs) console.error(log); process.exitCode = 1; }
else console.log('Built actual community page with disclosed navigation/session-hint adapters.');
