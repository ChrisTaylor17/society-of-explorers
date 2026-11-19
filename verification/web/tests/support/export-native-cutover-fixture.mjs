import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFullChainDb, evidence, ORDERED_STAGES, source, verifySourceStability } from './full-chain-migration-db.mjs';

const [directory, ...extra] = process.argv.slice(2);
assert(directory && extra.length === 0);
assert(process.execArgv.some(arg => arg.endsWith('/deny-build-network.cjs')));
await source('verification/web/tests/support/export-native-cutover-fixture.mjs');
await source('verification/web/tests/support/full-chain-migration-db.mjs');

function seedLiteral(value) {
  if (Array.isArray(value)) {
    assert(value.every(item => typeof item === 'string' && /^[\w -]+$/u.test(item)));
    value = `{${value.map(item => `"${item}"`).join(',')}}`;
  }
  assert(typeof value === 'string' && !/[\u0000\\]/u.test(value));
  return `'${value.replaceAll("'", "''")}'`;
}

// Render the existing synthetic fixture into SQL for psql. PREPARE preserves
// the parameter types the real engine infers from the seed statements.
const baseline = ['SET standard_conforming_strings = on;'];
const fixture = await createFullChainDb('native-postgres-cutover', {
  recordedEventGrants: true,
  recordedReadingBaseline: true,
  db: {
    async exec(sql) { baseline.push(sql.trimEnd().replace(/;?$/u, ';')); },
    async query(sql, params = []) {
      assert(/^(INSERT INTO|UPDATE) /u.test(sql) && !sql.includes(';'));
      if (params.length === 0) baseline.push(`${sql};`);
      else baseline.push(`PREPARE soe_seed AS ${sql};\nEXECUTE soe_seed (${params.map(seedLiteral).join(',')});\nDEALLOCATE soe_seed;`);
    },
    async close() {},
  },
});
await fixture.close();

// The dated catalog projection already has no legacy reading policies.
const files = ORDERED_STAGES.slice(1).flatMap(stage => stage.files);
const migration = ['SET ROLE postgres;'];
for (const file of files) migration.push(`\\echo SOE_MIGRATION ${file}\n${await source(file)}`);
await verifySourceStability();
for (const [name, content] of [
  ['baseline.sql', baseline.join('\n') + '\n'],
  ['cutover.sql', migration.join('\n') + '\n'],
  ['inputs.json', JSON.stringify({ files, sourceHashes: evidence.sources }, null, 2) + '\n'],
]) await writeFile(join(directory, name), content, { flag: 'wx', mode: 0o600 });
