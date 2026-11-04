// Executed by the already installed Bun with the startup deny guard preloaded.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const sourceHashes = {};
function read(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size && !stat.blocks) throw Error('Refuse linked/offloaded source: ' + file);
  const contents = fs.readFileSync(file), relative = path.relative(process.cwd(), file);
  sourceHashes[relative] = createHash('sha256').update(contents).digest('hex');
  return contents;
}
const result = await Bun.build({ entrypoints: ['platforms/shared/quest-entry.ts'], target: 'browser', format: 'esm',
  outdir: 'platforms/quest', naming: 'circle-host.mjs', minify: false,
  plugins: [{ name: 'resident-source-inputs', setup(build) {
    build.onLoad({ filter: /\.(?:ts|js|mjs)$/ }, args => ({ contents: read(args.path).toString(),
      loader: args.path.endsWith('.ts') ? 'ts' : 'js', resolveDir: path.dirname(args.path) }));
  } }] });
for (const log of result.logs) process.stderr.write(String(log) + '\n');
if (!result.success) process.exitCode = 1;
else {
  for (const [file, expected] of Object.entries({ ...sourceHashes })) if (createHash('sha256').update(read(file)).digest('hex') !== expected) throw Error('Source changed during bundle: ' + file);
  fs.writeFileSync('platforms/evidence/shared-source-manifest.json', JSON.stringify({ sourceHashes }, null, 2) + '\n');
  process.stdout.write(`Built ${result.outputs.length} shared platform artifact.\n`);
}
