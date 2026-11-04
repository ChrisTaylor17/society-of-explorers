import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
function readMaterialized(name) {
  const stat = fs.statSync(name);
  if (!stat.blocks || (stat.flags ?? 0) & 1073741824) throw Error('Refusing nonmaterialized source: ' + name);
  return fs.readFileSync(name);
}
const hash = value => createHash('sha256').update(value).digest('hex');
const files = ['app/leaderboard/page.tsx', 'components/PublicFooter.tsx', 'verification/web/tests/leaderboard-entry.tsx'];
const sourceHashes = Object.fromEntries(files.map(name => [name, hash(readMaterialized(name))]));
const output = 'verification/web/evidence/leaderboard-fixture';
const result = await Bun.build({ entrypoints: ['verification/web/tests/leaderboard-entry.tsx'], outdir: output,
  target: 'browser', format: 'esm', naming: 'page.[ext]', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'materialized-public-leaderboard-only', setup(build) {
    build.onResolve({ filter: /(?:supabase|@\/lib\/auth\/|next\/)/ }, () => { throw Error('Leaderboard fixture must not bundle provider/auth/Next adapters'); });
    build.onLoad({ filter: /\.(?:[cm]?[jt]sx?|json)$/ }, args => ({ contents: readMaterialized(args.path).toString(),
      loader: args.path.endsWith('.tsx') ? 'tsx' : args.path.endsWith('.ts') ? 'ts' : args.path.endsWith('.json') ? 'json' : 'jsx', resolveDir: path.dirname(args.path) }));
  } }],
});
for (const log of result.logs) console.error(String(log));
if (!result.success) throw Error('Leaderboard fixture bundle failed');
for (const [name, expected] of Object.entries(sourceHashes)) if (hash(readMaterialized(name)) !== expected) throw Error('Source changed: ' + name);
fs.writeFileSync(output + '/source-manifest.json', JSON.stringify({ sourceHashes, bunVersion: Bun.version,
  scope: 'Actual canonical leaderboard React page and PublicFooter, no UI/auth/Next shims. Inline product styles; global Next/PostCSS/font output excluded. Controlled HTTPS HTTP transport and explicit nonabortable header/JSON-body doubles only.' }, null, 2) + '\n');
console.log('Built actual closed leaderboard page with no provider/auth imports.');
