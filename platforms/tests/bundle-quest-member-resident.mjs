// No downloads or installation. Actual browser graph, resident Next Webpack/TS,
// explicit test-only Next Link, provider SDK and CSS-module class-name ports.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { webpack } = require('next/dist/compiled/webpack/webpack');
const [run, ...extra] = process.argv.slice(2);
if (extra.length || !/^immersive-salon-[a-z0-9-]{1,16}$/.test(run ?? '')) throw Error('Use a fresh bounded salon run name');
if (!process.execArgv.some(value => value.endsWith('/deny-build-network.cjs'))) throw Error('Network deny guard required');
const root = process.cwd(), output = path.resolve('platforms/evidence/quest-member-composed-fixture-' + run);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.mkdirSync(output);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => { const info = fs.lstatSync(file); if (!info.isFile() || info.isSymbolicLink() || info.size && !info.blocks) throw Error('Nonresident input: ' + file); return fs.readFileSync(file); };
const sdk = path.join(output, 'test-provider.ts'), link = path.join(output, 'test-next-link.tsx');
fs.writeFileSync(sdk, 'export function createClient(){return window.questComposedQa.factory();}\n');
fs.writeFileSync(link, 'import React from "react";export default function Link({children,href,prefetch,replace,scroll,...p}){return <a href={href} {...p}>{children}</a>;}\n');
globalThis.__soeResidentFixtureCss = new Map();
const hashes = {};
const compiler = webpack({ mode: 'development', target: 'web', cache: false, devtool: false,
  context: root, entry: './platforms/tests/quest-member-composed-entry.tsx',
  output: { path: output, filename: 'page.js', chunkLoading: false },
  resolve: { extensions: ['.tsx', '.ts', '.mjs', '.js', '.json'], alias: {
    '@/lib/supabase/client$': sdk, 'next/link$': link, '@': root,
  } },
  module: { rules: [{ test: /\.(tsx?|css)$/, exclude: /node_modules/, use: path.resolve('platforms/tests/resident-fixture-loader.cjs') }] },
  optimization: { minimize: false, splitChunks: false, runtimeChunk: false },
  plugins: [new webpack.DefinePlugin({ 'process.env.NODE_ENV': '"development"',
    'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://synthetic-provider.example.test"',
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"NONISSUED_QUEST_PUBLIC_FIXTURE"' }),
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    { apply(compiler) { compiler.hooks.compilation.tap('resident-input-hashes', compilation => {
      compilation.hooks.buildModule.tap('resident-input-hashes', module => {
        const file = module.resource;
        if (file && file.startsWith(root + path.sep) && !file.includes(path.sep + 'node_modules' + path.sep)) hashes[path.relative(root, file)] = sha(read(file));
      });
    }); } }],
});
try {
  const stats = await new Promise((resolve, reject) => compiler.run((error, stats) => error ? reject(error) : resolve(stats)));
  if (stats.hasErrors()) throw Error(stats.toString({ all: false, errors: true }));
  for (const file of ['platforms/tests/bundle-quest-member-resident.mjs', 'platforms/tests/resident-fixture-loader.cjs']) hashes[file] = sha(read(file));
  for (const [file, expected] of Object.entries(hashes)) if (sha(read(file)) !== expected) throw Error('Input changed during bundle: ' + file);
  fs.writeFileSync(path.join(output, 'page.css'), [...globalThis.__soeResidentFixtureCss.values()].join('\n'));
  fs.writeFileSync(path.join(output, 'source-manifest.json'), JSON.stringify({ sourceHashes: hashes,
    bundler: 'resident Next Webpack ' + webpack.version, typescript: require('typescript/package.json').version,
    scope: 'Actual Quest TSX/auth/shared host/JS and CSS declarations. Test-only synthetic provider/Next Link and explicit stable CSS class-name ports. No installed tools, Next production build, provider network or headset.' }, null, 2) + '\n');
  console.log('Built resident Quest browser fixture: ' + Object.keys(hashes).length + ' owned inputs.');
} finally { await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve())); }
