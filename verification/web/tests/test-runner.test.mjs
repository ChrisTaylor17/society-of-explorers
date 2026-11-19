import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
function fixture(t, suites) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soe-test-runner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of ['scripts/run-tests.mjs', 'verification/web/scripts/deny-build-network.cjs']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, file), path.join(root, file));
  }
  const directory = path.join(root, 'verification/web/tests');
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, source] of Object.entries(suites)) fs.writeFileSync(path.join(directory, name), source);
  return {
    root,
    run(timeout = 5) {
      const result = spawnSync(process.execPath, ['scripts/run-tests.mjs', '--groups=web', '--concurrency=1', `--timeout=${timeout}`, '--output=fixture'], {
        cwd: root, encoding: 'utf8', timeout: 15_000,
        env: { ...process.env, SOE_TEST_SENTINEL: 'synthetic-must-not-reach-tests' },
      });
      assert.equal(result.error, undefined, result.stderr);
      const report = JSON.parse(fs.readFileSync(path.join(root, 'verification/web/evidence/fixture/summary.json'), 'utf8'));
      return { result, report };
    },
  };
}

test('runner keeps explicit skips separate and gives the child a clean, network-denied environment', t => {
  const f = fixture(t, {
    'a-pass.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict';
      test('isolated', () => { assert.equal(process.env.SOE_TEST_SENTINEL, undefined);
        assert.throws(() => fetch('https://fixture.invalid'), /EXTERNAL_NETWORK_DISABLED/); });`,
    'b-skip.test.mjs': `import test from 'node:test'; test('historical fixture', {skip: 'old source only'}, () => {});`,
  });
  const { result, report } = f.run();
  assert.equal(result.status, 0); assert.equal(report.completed, true);
  assert.equal(report.passedFiles, 1); assert.equal(report.skippedFiles, 1); assert.equal(report.failedFiles, 0);
  assert.equal(report.results[1].status, 'skipped'); assert.equal(report.results[1].passedTests, 0);
});

test('runner rejects a failing and a zero-test suite while still running the later useful suite', t => {
  const f = fixture(t, {
    'a-fail.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict'; test('refusal', () => assert.fail('synthetic failure'));`,
    'b-empty.test.mjs': '// No registered test is not acceptance evidence.\n',
    'c-pass.test.mjs': `import test from 'node:test'; test('later useful work', () => {});`,
  });
  const { result, report } = f.run();
  assert.equal(result.status, 1); assert.equal(report.completed, true);
  assert.deepEqual(report.results.map(row => row.status), ['failed', 'failed', 'passed']);
  assert.equal(report.failedFiles, 2); assert.equal(report.passedFiles, 1);
});

test('runner times out a stalled suite, stops its owned process group and continues', t => {
  const f = fixture(t, {
    'a-stall.test.mjs': `import test from 'node:test'; import fs from 'node:fs'; import {spawn} from 'node:child_process';
      test('stalled', async () => { const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio:'ignore'});
        fs.writeFileSync('owned-child.pid', String(child.pid)); await new Promise(() => {}); });`,
    'b-pass.test.mjs': `import test from 'node:test'; test('later useful work', () => {});`,
  });
  const { result, report } = f.run(1);
  assert.equal(result.status, 1); assert.equal(report.completed, true);
  assert.deepEqual(report.results.map(row => row.status), ['timeout', 'passed']);
  const pid = Number(fs.readFileSync(path.join(f.root, 'verification/web/owned-child.pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
});
