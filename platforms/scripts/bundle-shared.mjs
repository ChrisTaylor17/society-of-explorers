// Executed by the already installed Bun with the startup deny guard preloaded.
const result = await Bun.build({ entrypoints: ['platforms/shared/quest-entry.ts'], target: 'browser', format: 'esm',
  outdir: 'platforms/quest', naming: 'circle-host.mjs', minify: false });
for (const log of result.logs) process.stderr.write(String(log) + '\n');
if (!result.success) process.exitCode = 1;
else process.stdout.write(`Built ${result.outputs.length} shared platform artifact.\n`);
