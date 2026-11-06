import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { relative, dirname } from 'node:path';

const run = process.argv[2] ?? '01';
assert.match(run, /^[a-z0-9-]{1,24}$/);
const output = 'verification/web/evidence/direct-message-fixture-' + run;
mkdirSync(output);
const hashes = {};
const result = await Bun.build({
  entrypoints: ['verification/web/tests/support/direct-message-entry.tsx'], outdir: output,
  target: 'browser', format: 'esm', naming: 'page.[ext]', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'member-browser-fixtures', setup(build) {
    build.onResolve({ filter: /^(@\/lib\/auth\/getSession|next\/navigation|next\/link)$/ },
      ({ path }) => ({ path, namespace: 'member-fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'member-fixture' }, ({ path }) => ({ loader: 'js', resolveDir: process.cwd(),
      contents: path === '@/lib/auth/getSession'
        ? 'export async function getMemberSession(){ return { member: window.dmActor }; } export async function getSupabaseAccessToken(){ return null; }'
        : path === 'next/navigation'
          ? 'const router = {push(path){window.location.assign(path)}}; export function useRouter(){return router}'
          : 'import React from "react"; export default function Link({children, ...props}) {return React.createElement("a", props, children)}' }));
    build.onLoad({ filter: /\.(?:[cm]?[jt]sx?|json)$/ }, ({ path }) => {
      const info = lstatSync(path);
      assert(info.isFile() && (!info.size || info.blocks), path);
      const contents = readFileSync(path);
      const name = relative(process.cwd(), path);
      if (!name.startsWith('..') && !name.split('/').includes('node_modules')) hashes[name] = createHash('sha256').update(contents).digest('hex');
      return { contents: contents.toString(), loader: path.endsWith('.tsx') ? 'tsx' : path.endsWith('.ts') ? 'ts' :
        path.endsWith('.json') ? 'json' : 'jsx', resolveDir: dirname(path) };
    });
  } }],
});
assert(result.success, result.logs.join('\n'));
writeFileSync(output + '/source-hashes.json', JSON.stringify(hashes, null, 2) + '\n', { flag: 'wx' });
