import { lstatSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { afterAll } from 'bun:test';
const hashes = new Map<string, string>();
function read(file: string) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size && !info.blocks) throw Error('Refuse nonresident or linked input: ' + file);
  const bytes = readFileSync(file), hash = createHash('sha256').update(bytes).digest('hex');
  if (hashes.has(file) && hashes.get(file) !== hash) throw Error('Input changed: ' + file);
  hashes.set(file, hash); return bytes;
}
Bun.plugin({ name: 'resident-security-test-inputs', setup(builder) {
  builder.onLoad({ filter: /\.tsx?$/ }, args => ({ contents: read(args.path).toString(), loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' }));
} });
afterAll(() => {
  for (const file of hashes.keys()) read(file);
  console.log('BROWSER_INTENT_BUN_INPUTS ' + JSON.stringify({ hashes: Object.fromEntries(hashes), loaded: hashes.size,
    root: path.resolve('.'), syntheticOnly: true }));
});
