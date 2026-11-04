/** Local, synthetic, independent-backend PostgreSQL checks. No provider calls.
 * Requires the exact already-cached image and existing local Colima socket.
 * Run from this milestone: node scripts/test-supporter-postgres.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'postgres@sha256:3b0cda93be7c8dba2ed484d19393d93845dc3dafb88973e248ba8e6d99d784e1';
const RUN = randomUUID().replaceAll('-', '').slice(0, 12);
const NAME = `soe-supporter-pg-${RUN}`;
const DB = `soe_supporter_${RUN}`;
const SQL_PATH = resolve(ROOT, '../../docs/sql/supporter-billing.sql');
const ENV = { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: 'C' };
const SCOPE = 'test:acct_FictionalConcurrency';
const HASH = 'a'.repeat(64);
const OFFER = 'soe-supporter-monthly-v1';
const TERMS = 'supporter-2026-11-03-v1';
const IDS = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name, index) => {
  const digit = String(index + 1);
  return [name, `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`];
}));
const children = new Set();
const holders = new Set();
const lines = [];
let socket;
let cid;
let interrupted = false;
let sourceHash;
const report = {
  status: 'RUNNING', startedAt: new Date().toISOString(), syntheticOnly: true,
  image: IMAGE, imagePulled: false, imageRemoved: false, database: DB,
  container: { name: NAME, network: 'none', portsPublished: false, readonlyRoot: true,
    memoryLimitBytes: 805306368, tmpfsOnly: true, removed: false },
  checks: [], observedLockWaits: [], commands: [],
  limitations: [
    'Disposable local PostgreSQL 17.11 evidence; no production database, Stripe account, payment or deployment was used.',
    'Controlled transaction holders establish a bounded schedule; these checks are not exhaustive schedules or load testing.',
    'Only the supporter SQL and a minimal synthetic members table are applied; inherited community behavior is verified separately.',
  ],
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const log = value => { const line = typeof value === 'string' ? value : JSON.stringify(value); lines.push(line); process.stdout.write(`${line}\n`); };
const quote = value => value === null ? 'NULL' : `'${String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''")}'`;
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));
const ensureRunning = () => assert.equal(interrupted, false, 'Owned test interrupted');

function launch(args, { input, timeout = 20000 } = {}) {
  report.commands.push(['docker', ...args]);
  const child = spawn('docker', args, { env: ENV, stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(child);
  let stdout = '', stderr = '';
  child.stdout.on('data', value => { stdout += value; });
  child.stderr.on('data', value => { stderr += value; });
  let timer;
  const done = new Promise((resolveDone, rejectDone) => {
    child.once('error', rejectDone);
    child.once('close', (code, signal) => {
      clearTimeout(timer); children.delete(child);
      resolveDone({ code, signal, stdout, stderr });
    });
    timer = setTimeout(() => { child.kill('SIGKILL'); rejectDone(new Error('Owned Docker command timed out')); }, timeout);
  });
  if (input !== undefined) child.stdin.end(input);
  else child.stdin.end();
  return { child, done };
}
async function docker(args, { allowError = false, ...options } = {}) {
  const result = await launch(socket ? ['--host', socket, ...args] : args, options).done;
  if (!allowError) assert.equal(result.code, 0, result.stderr);
  return result;
}
function psqlArgs(database = DB) {
  return ['--host', socket, 'exec', '-i', cid, 'psql', '-X', '-U', 'postgres', '-d', database,
    '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
}
function prefix(app = 'soe-supporter-fixture', role = null) {
  assert.equal(role === null || role === 'service_role' || role === 'anon' || role === 'authenticated', true);
  return `SET statement_timeout='15s';SET lock_timeout='12s';SET application_name=${quote(app)};${role ? `SET ROLE ${role};` : ''}`;
}
async function sql(statement, { database = DB, app, role = null, allowError = false } = {}) {
  ensureRunning();
  const result = await launch(psqlArgs(database), { input: `${prefix(app, role)}${statement}\n` }).done;
  if (!allowError) assert.equal(result.code, 0, result.stderr);
  return result;
}
const functionSQL = (name, args) => {
  assert.match(name, /^soe_supporter_[a-z_]+$/);
  return `public.${name}(${args.map(quote).join(',')})`;
};
async function rpc(name, args, { error = null, app = 'soe-supporter-rpc' } = {}) {
  const result = await sql(`SELECT ${functionSQL(name, args)}::text;`, { role: 'service_role', app, allowError: error !== null });
  if (error !== null) {
    assert.notEqual(result.code, 0); assert.match(result.stderr, new RegExp(`\\b${error}\\b`));
    return result;
  }
  return JSON.parse(result.stdout.trim());
}
function heldRpc(name, args, app) {
  ensureRunning();
  const dockerArgs = psqlArgs(); report.commands.push(['docker', ...dockerArgs]);
  const child = spawn('docker', dockerArgs, { env: ENV, stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(child);
  const lineReader = createInterface({ input: child.stdout });
  const queued = [], waiting = [];
  let stderr = '';
  child.stderr.on('data', value => { stderr += value; });
  const done = new Promise((resolveDone, rejectDone) => {
    child.once('error', rejectDone);
    child.once('close', (code, signal) => {
      children.delete(child); lineReader.close();
      for (const waiter of waiting.splice(0)) { clearTimeout(waiter.timer); waiter.reject(new Error(stderr || 'Held SQL connection closed')); }
      resolveDone({ code, signal, stderr });
    });
  });
  lineReader.on('line', line => {
    if (!line.trim()) return;
    const waiter = waiting.shift();
    if (waiter) { clearTimeout(waiter.timer); waiter.resolve(line); }
    else queued.push(line);
  });
  const next = () => queued.length ? Promise.resolve(queued.shift()) : new Promise((resolveLine, rejectLine) => {
    const waiter = { resolve: resolveLine, reject: rejectLine, timer: null };
    waiter.timer = setTimeout(() => { child.kill('SIGTERM'); rejectLine(new Error('Held RPC receipt timed out')); }, 17000);
    waiting.push(waiter);
  });
  const holder = { child, done, pid: null, value: null };
  holders.add(holder);
  const first = next();
  child.stdin.write(`${prefix(app)}BEGIN;SET LOCAL ROLE service_role;SELECT jsonb_build_object('pid',pg_backend_pid(),'value',${functionSQL(name, args)})::text;\n`);
  return first.then(line => { const value = JSON.parse(line); holder.pid = value.pid; holder.value = value.value; return holder; });
}
async function release(holder, commit = true) {
  holder.child.stdin.end(`${commit ? 'COMMIT' : 'ROLLBACK'};\n\\q\n`);
  const result = await holder.done; holders.delete(holder);
  assert.equal(result.code, 0, result.stderr);
}
async function waitForLock(app, holder, label) {
  const until = Date.now() + 6000;
  while (Date.now() < until) {
    ensureRunning();
    const value = await sql(`SELECT coalesce(json_agg(json_build_object('pid',pid,'application',application_name,
      'wait',wait_event,'type',wait_event_type,'blockingPids',pg_blocking_pids(pid))),'[]')::text
      FROM pg_stat_activity WHERE datname=current_database() AND application_name=${quote(app)} AND wait_event_type='Lock';`);
    const rows = JSON.parse(value.stdout.trim());
    if (rows.some(row => row.blockingPids.includes(holder.pid))) {
      report.observedLockWaits.push(...rows.map(row => ({ ...row, check: label, expectedHolderPid: holder.pid })));
      return;
    }
    await pause(40);
  }
  throw new Error(`No independent backend lock wait observed for ${label}`);
}
async function check(name, fn) { ensureRunning(); await fn(); report.checks.push({ name, status: 'PASS' }); log(`PASS ${name}`); }
const beginArgs = (actor, key, revision = 0, scope = SCOPE) => [actor, scope, key, revision, OFFER, TERMS, HASH];
const read = (actor, scope = SCOPE) => rpc('soe_supporter_read', [actor, scope]);
const snapshot = (id = 'sub_FictionalA', status = 'active') => ({ id, status, cancelAtPeriodEnd: false,
  currentPeriodStart: '2026-11-03T00:00:00Z', currentPeriodEnd: '2026-12-03T00:00:00Z', paid: true });
const eventArgs = (state, event, value = snapshot(), kind = 'subscription') => [SCOPE, event, HASH, state.accountId,
  state.customerId, state.revision, kind, value];

async function start() {
  const endpoint = await docker(['context', 'inspect', 'colima', '--format', '{{json .Endpoints.docker.Host}}']);
  socket = JSON.parse(endpoint.stdout.trim());
  assert.match(socket, /^unix:\/\//); assert.equal((await stat(socket.slice(7))).isSocket(), true);
  const cached = await docker(['image', 'inspect', IMAGE]);
  const image = JSON.parse(cached.stdout)[0]; assert.equal(image.RepoDigests.includes(IMAGE), true);
  report.cachedImageId = image.Id; report.architecture = image.Architecture; report.container.socket = socket;
  const created = await docker(['run', '--detach', '--pull=never', '--name', NAME,
    '--label', 'soe.local.task=supporter', '--label', `soe.local.run=${RUN}`,
    '--network', 'none', '--memory', '768m', '--cpus', '1', '--pids-limit', '128', '--read-only',
    '--security-opt', 'no-new-privileges:true', '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=512m',
    '--tmpfs', '/var/run/postgresql:rw,nosuid,size=16m', '--tmpfs', '/tmp:rw,nosuid,size=16m',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'PGDATA=/var/lib/postgresql/data/pgdata', IMAGE], { timeout: 30000 });
  cid = created.stdout.trim(); assert.match(cid, /^[a-f0-9]{64}$/); report.container.id = cid;
  const inspected = JSON.parse((await docker(['inspect', cid])).stdout)[0];
  assert.equal(inspected.Name, `/${NAME}`); assert.equal(inspected.Config.Labels['soe.local.run'], RUN);
  assert.equal(inspected.HostConfig.NetworkMode, 'none'); assert.equal(inspected.HostConfig.ReadonlyRootfs, true);
  assert.equal(inspected.HostConfig.Memory, 805306368); assert.equal(inspected.HostConfig.PortBindings === null || Object.keys(inspected.HostConfig.PortBindings).length === 0, true);
  assert.equal((inspected.HostConfig.Binds || []).length, 0); assert.equal((inspected.HostConfig.Mounts || []).length, 0);
  assert.deepEqual(Object.keys(inspected.HostConfig.Tmpfs).sort(), ['/tmp', '/var/lib/postgresql/data', '/var/run/postgresql']);
  assert.equal(inspected.HostConfig.SecurityOpt.includes('no-new-privileges:true'), true);
  for (let index = 0; index < 100; index++) {
    ensureRunning();
    // The image starts and then stops a temporary initialization server. Only
    // accept readiness after PID 1 has exec'd the final persistent postgres.
    const processName = await docker(['exec', cid, 'cat', '/proc/1/comm'], { allowError: true });
    if (processName.code === 0 && processName.stdout.trim() === 'postgres') {
      const ready = await docker(['exec', cid, 'pg_isready', '-U', 'postgres'], { allowError: true });
      if (ready.code === 0) return;
    }
    await pause(150);
  }
  throw new Error('Owned PostgreSQL was not ready');
}
async function cleanup() {
  for (const holder of holders) { holder.child.stdin.destroy(); holder.child.kill('SIGTERM'); }
  await Promise.allSettled([...holders].map(holder => holder.done)); holders.clear();
  for (const child of children) child.kill('SIGTERM');
  if (!socket) { report.container.noContainerCreated = true; return; }
  const probe = await docker(['inspect', cid || NAME], { allowError: true });
  if (probe.code !== 0) {
    assert.equal(cid, undefined); assert.match(probe.stderr.toLowerCase(), /no such/);
    report.container.noContainerCreated = true; return;
  }
  const owned = JSON.parse(probe.stdout)[0];
  assert.equal(owned.Config.Labels['soe.local.run'], RUN, 'Refusing to remove a container not owned by this run');
  cid = owned.Id; report.container.id = cid;
  await docker(['rm', '--force', cid]);
  const absent = await docker(['inspect', cid], { allowError: true });
  assert.notEqual(absent.code, 0); assert.deepEqual(JSON.parse(absent.stdout), []); assert.match(absent.stderr.toLowerCase(), /no such/);
  report.container.removed = true; report.container.removalVerified = true;
  const stillCached = await docker(['image', 'inspect', IMAGE, '--format', '{{.Id}}']);
  assert.equal(stillCached.stdout.trim(), report.cachedImageId); report.cachedImagePreserved = true;
  report.ownedClientProcessesStopped = children.size === 0;
  assert.equal(report.ownedClientProcessesStopped, true);
}
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  interrupted = true; for (const child of children) child.kill('SIGTERM');
});

try {
  const bytes = await readFile(SQL_PATH); sourceHash = sha(bytes); report.sqlSHA256 = sourceHash;
  report.runnerSHA256 = sha(await readFile(fileURLToPath(import.meta.url)));
  log(`Supporter SQL SHA256 ${sourceHash}`);
  await start();
  await sql(`CREATE DATABASE ${DB};`, { database: 'postgres' });
  report.engine = (await sql('SELECT version();')).stdout.trim(); assert.match(report.engine, /PostgreSQL 17[.]11 /);
  const setup = `CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE TABLE public.members(id uuid PRIMARY KEY,tier text NOT NULL DEFAULT 'free');
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;GRANT SELECT(id) ON public.members TO service_role;
    INSERT INTO members(id,tier) VALUES ${Object.values(IDS).map(id => `(${quote(id)},'free')`).join(',')};`;
  report.fixtureSetupSHA256 = sha(setup); await sql(setup); await sql(bytes.toString('utf8'));

  await check('same checkout key waits for a real independent transaction and replays stable original parameters', async () => {
    const key = randomUUID(), args = beginArgs(IDS.a, key);
    const holder = await heldRpc('soe_supporter_checkout_begin', args, `ss-${RUN}-same-holder`);
    const app = `ss-${RUN}-same-waiter`; const pending = rpc('soe_supporter_checkout_begin', args, { app });
    await waitForLock(app, holder, 'same-key begin'); await release(holder);
    const result = await pending; assert.equal(result.replayed, true); assert.deepEqual(result.attempt, holder.value.attempt);
  });
  await check('different checkout keys for one actor serialize and allow only one durable operation', async () => {
    const holder = await heldRpc('soe_supporter_checkout_begin', beginArgs(IDS.b, randomUUID()), `ss-${RUN}-different-holder`);
    const app = `ss-${RUN}-different-waiter`;
    const pending = rpc('soe_supporter_checkout_begin', beginArgs(IDS.b, randomUUID()), { app, error: 'PT409' });
    await waitForLock(app, holder, 'different-key begin'); await release(holder); await pending;
    assert.equal(Number((await sql(`SELECT count(*) FROM supporter_checkout_attempts WHERE account_id=${quote(holder.value.accountId)};`)).stdout.trim()), 1);
  });
  await check('same-mode provider account changes cannot race past an unresolved charge; test does not block live', async () => {
    const holder = await heldRpc('soe_supporter_checkout_begin', beginArgs(IDS.c, randomUUID()), `ss-${RUN}-scope-holder`);
    const otherScope = 'test:acct_FictionalReplacement'; const app = `ss-${RUN}-scope-waiter`;
    const pending = rpc('soe_supporter_checkout_begin', beginArgs(IDS.c, randomUUID(), 0, otherScope), { app, error: 'PT409' });
    await waitForLock(app, holder, 'cross-account same-mode begin'); await release(holder); await pending;
    const blocked = await read(IDS.c, otherScope); assert.equal(blocked.otherScopeBlocked, true); assert.equal(blocked.accountId, null);
    const live = await rpc('soe_supporter_checkout_begin', beginArgs(IDS.c, randomUUID(), 0, 'live:acct_FictionalReplacement'));
    assert.equal(live.otherScopeBlocked, false);
  });
  await check('concurrent customer uniqueness cannot bind the same scoped customer to two actors', async () => {
    const d = await rpc('soe_supporter_checkout_begin', beginArgs(IDS.d, randomUUID()));
    const e = await rpc('soe_supporter_checkout_begin', beginArgs(IDS.e, randomUUID()));
    const holder = await heldRpc('soe_supporter_checkout_customer', [IDS.d, SCOPE, d.attempt.requestId, 'cus_FictionalShared'], `ss-${RUN}-customer-holder`);
    const app = `ss-${RUN}-customer-waiter`;
    const pending = rpc('soe_supporter_checkout_customer', [IDS.e, SCOPE, e.attempt.requestId, 'cus_FictionalShared'], { app, error: 'PT409' });
    await waitForLock(app, holder, 'scoped customer uniqueness'); await release(holder); await pending;
    assert.equal((await read(IDS.e)).customerId, null); assert.equal((await read(IDS.d)).customerId, 'cus_FictionalShared');
  });
  for (const actor of [IDS.a, IDS.b]) {
    const state = await read(actor);
    await rpc('soe_supporter_checkout_customer', [actor, SCOPE, state.attempt.requestId, actor === IDS.a ? 'cus_FictionalA' : 'cus_FictionalB']);
  }
  await check('same event receipt waits and replays atomically while stale independent snapshots fail CAS', async () => {
    const state = await read(IDS.a); const args = eventArgs(state, 'evt_FictionalDuplicate');
    const holder = await heldRpc('soe_supporter_apply_event', args, `ss-${RUN}-event-holder`);
    const app = `ss-${RUN}-event-waiter`; const pending = rpc('soe_supporter_apply_event', args, { app });
    await waitForLock(app, holder, 'same event receipt'); await release(holder);
    const result = await pending; assert.equal(result.replayed, true); assert.equal(result.revision, holder.value.revision);
    await rpc('soe_supporter_apply_event', eventArgs(state, 'evt_FictionalStale', snapshot('sub_FictionalA', 'canceled')), { error: 'PT409' });
    assert.equal((await read(IDS.a)).subscription.status, 'active');
  });
  await check('cross-account duplicate event race rolls back the losing account risk update', async () => {
    const a = await read(IDS.a), b = await read(IDS.b), event = 'evt_FictionalCrossAccount';
    const holder = await heldRpc('soe_supporter_apply_event', eventArgs(a, event, null, 'risk'), `ss-${RUN}-receipt-holder`);
    const app = `ss-${RUN}-receipt-waiter`;
    const pending = rpc('soe_supporter_apply_event', eventArgs(b, event, null, 'risk'), { app, error: 'PT409' });
    await waitForLock(app, holder, 'cross-account receipt uniqueness'); await release(holder); await pending;
    const current = await read(IDS.b); assert.equal(current.revision, b.revision); assert.equal(current.riskReview, false);
  });
  await check('receipt insertion failure rolls back already-written subscription and account revision', async () => {
    const before = await read(IDS.a);
    await sql(`CREATE FUNCTION public.fixture_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.event_id='evt_FictionalForcedRollback' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Synthetic receipt failure';END IF;RETURN NEW;END $$;
      CREATE TRIGGER fixture_reject BEFORE INSERT ON supporter_webhook_receipts FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_receipt();`);
    await rpc('soe_supporter_apply_event', eventArgs(before, 'evt_FictionalForcedRollback', snapshot('sub_FictionalA', 'past_due')), { error: '23514' });
    const after = await read(IDS.a); assert.equal(after.revision, before.revision); assert.deepEqual(after.subscription, before.subscription);
    assert.equal((await sql("SELECT count(*) FROM supporter_webhook_receipts WHERE event_id='evt_FictionalForcedRollback';")).stdout.trim(), '0');
  });
  await check('rolled-back event holder releases a waiter to apply exactly one real receipt', async () => {
    const before = await read(IDS.a); const args = eventArgs(before, 'evt_FictionalRollbackRace', snapshot('sub_FictionalA', 'past_due'));
    const holder = await heldRpc('soe_supporter_apply_event', args, `ss-${RUN}-rollback-holder`);
    const app = `ss-${RUN}-rollback-waiter`; const pending = rpc('soe_supporter_apply_event', args, { app });
    await waitForLock(app, holder, 'event rollback then retry'); await release(holder, false);
    const result = await pending; assert.equal(result.replayed, false); assert.equal(result.revision, before.revision + 1);
    assert.equal((await sql("SELECT count(*) FROM supporter_webhook_receipts WHERE event_id='evt_FictionalRollbackRace';")).stdout.trim(), '1');
  });
  await check('portal uncertainty allows a fresh explicit key after fifteen minutes without clearing original receipt', async () => {
    let state = await read(IDS.a); const oldKey = randomUUID();
    state = await rpc('soe_supporter_portal_begin', [IDS.a, SCOPE, oldKey, state.revision, HASH]);
    state = await rpc('soe_supporter_portal_unknown', [IDS.a, SCOPE, oldKey]);
    await sql(`UPDATE supporter_portal_attempts SET created_at=created_at-interval '16 minutes',retry_until=retry_until-interval '16 minutes'
      WHERE account_id=${quote(state.accountId)} AND request_id=${quote(oldKey)};`);
    const newKey = randomUUID();
    const holder = await heldRpc('soe_supporter_portal_begin', [IDS.a, SCOPE, newKey, state.revision, HASH], `ss-${RUN}-portal-holder`);
    const app = `ss-${RUN}-portal-waiter`;
    const pending = rpc('soe_supporter_portal_begin', [IDS.a, SCOPE, randomUUID(), holder.value.revision, HASH], { app, error: 'PT409' });
    await waitForLock(app, holder, 'fresh portal replacement'); await release(holder); await pending;
    assert.equal((await read(IDS.a)).portalAttempt.requestId, newKey);
    const replay = await rpc('soe_supporter_portal_begin', [IDS.a, SCOPE, oldKey, 0, HASH]);
    assert.equal(replay.replayed, true); assert.equal(replay.portalAttempt.status, 'unknown');
  });
  await check('concurrent sixth fresh portal operation waits and cannot evade five-per-hour cap', async () => {
    let state = await rpc('soe_supporter_checkout_begin', beginArgs(IDS.f, randomUUID()));
    state = await rpc('soe_supporter_checkout_customer', [IDS.f, SCOPE, state.attempt.requestId, 'cus_FictionalF']);
    for (let index = 0; index < 4; index++) {
      const key = randomUUID(); state = await rpc('soe_supporter_portal_begin', [IDS.f, SCOPE, key, state.revision, HASH]);
      state = await rpc('soe_supporter_portal_complete', [IDS.f, SCOPE, key, `bps_Fictional${index}`, `https://billing.stripe.com/p/session/fictional${index}`]);
    }
    const fifth = randomUUID(); state = await rpc('soe_supporter_portal_begin', [IDS.f, SCOPE, fifth, state.revision, HASH]);
    const holder = await heldRpc('soe_supporter_portal_complete', [IDS.f, SCOPE, fifth, 'bps_FictionalFifth', 'https://billing.stripe.com/p/session/fifth'], `ss-${RUN}-quota-holder`);
    const app = `ss-${RUN}-quota-waiter`;
    const pending = rpc('soe_supporter_portal_begin', [IDS.f, SCOPE, randomUUID(), holder.value.revision, HASH], { app, error: 'PT409' });
    await waitForLock(app, holder, 'portal hourly cap'); await release(holder);
    const result = await pending; assert.match(result.stderr, /limit reached/);
    assert.equal((await sql(`SELECT count(*) FROM supporter_portal_attempts WHERE account_id=${quote(state.accountId)};`)).stdout.trim(), '5');
  });
  await check('completed checkout remains blocked until a later terminal snapshot for the exact completed subscription', async () => {
    let state = await rpc('soe_supporter_checkout_begin', beginArgs(IDS.g, randomUUID()));
    state = await rpc('soe_supporter_checkout_customer', [IDS.g, SCOPE, state.attempt.requestId, 'cus_FictionalG']);
    state = await rpc('soe_supporter_apply_event', eventArgs(state, 'evt_FictionalOlderCanceled', snapshot('sub_OlderG', 'canceled')));
    state = await rpc('soe_supporter_checkout_resolve', [IDS.g, SCOPE, state.attempt.requestId, state.revision,
      'completed', 'cs_test_FictionalG', null, state.attempt.expiresAt, 'sub_CompletedG']);
    await rpc('soe_supporter_checkout_begin', beginArgs(IDS.g, randomUUID(), state.revision), { error: 'PT409' });
    state = await rpc('soe_supporter_apply_event', eventArgs(state, 'evt_FictionalOlderCanceledLater', snapshot('sub_OlderG', 'canceled')));
    await rpc('soe_supporter_checkout_begin', beginArgs(IDS.g, randomUUID(), state.revision), { error: 'PT409' });
    const blocked = await read(IDS.g, 'test:acct_Replacement'); assert.equal(blocked.otherScopeBlocked, true);
    state = await rpc('soe_supporter_apply_event', eventArgs(state, 'evt_FictionalExactCanceledLater', snapshot('sub_CompletedG', 'canceled')));
    const next = await rpc('soe_supporter_checkout_begin', beginArgs(IDS.g, randomUUID(), state.revision));
    assert.equal(next.attempt.status, 'pending');
  });
  await check('all synthetic tiers remain free and browser roles cannot invoke or read billing', async () => {
    assert.equal((await sql("SELECT count(*) FROM members WHERE tier<>'free';")).stdout.trim(), '0');
    for (const role of ['anon', 'authenticated']) {
      const result = await sql(`SELECT public.soe_supporter_read(${quote(IDS.a)},${quote(SCOPE)});`, { role, allowError: true });
      assert.notEqual(result.code, 0); assert.match(result.stderr, /42501/);
      const table = await sql('SELECT * FROM supporter_accounts;', { role, allowError: true });
      assert.notEqual(table.code, 0); assert.match(table.stderr, /42501/);
    }
  });
  assert.equal(sha(await readFile(SQL_PATH)), sourceHash, 'SQL source changed during the run');
  report.sourceUnchanged = true; report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = String(error?.stack || error); process.exitCode = 1; log(`FAIL ${report.error}`);
} finally {
  try { await cleanup(); }
  catch (error) { report.status = 'FAIL'; report.cleanupError = String(error?.stack || error); process.exitCode = 1; log(`CLEANUP FAIL ${report.cleanupError}`); }
  if (sourceHash) {
    try { report.sourceUnchanged = sha(await readFile(SQL_PATH)) === sourceHash; assert.equal(report.sourceUnchanged, true); }
    catch (error) { report.status = 'FAIL'; report.sourceError = String(error); process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  log(`${report.status}: ${report.checks.length} checks, ${report.observedLockWaits.length} observed backend lock waits; owned container removed=${report.container.removed}`);
  await mkdir(resolve(ROOT, 'evidence'), { recursive: true });
  await writeFile(resolve(ROOT, 'evidence/supporter-postgres.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(resolve(ROOT, 'evidence/supporter-postgres.log'), `${lines.join('\n')}\n`);
}
