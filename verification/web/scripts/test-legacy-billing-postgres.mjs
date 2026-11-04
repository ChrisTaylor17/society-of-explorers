/** Local, synthetic, independent-backend PostgreSQL checks. No provider calls.
 * Requires the exact already-cached image and existing local Colima socket.
 * Run from this milestone: node scripts/test-legacy-billing-postgres.mjs
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
const NAME = `soe-legacy-billing-pg-${RUN}`;
const DB = `soe_legacy_${RUN}`;
const SQL_PATH = resolve(ROOT, '../../docs/sql/legacy-billing.sql');
const ENV = { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: 'C' };
const SCOPE = 'live:acct_FictionalConcurrency';
const HASH = 'a'.repeat(64);
const IDS = Object.fromEntries(['a','b','c','d','e','f','g','h','i','j','k','l','m'].map((name, index) => {
  const digit = (index + 1).toString(16);
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
    'Only the legacy billing SQL and a minimal synthetic members table are applied; inherited community behavior is verified separately.',
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
function prefix(app = 'soe-legacy-fixture', role = null) {
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
  assert.match(name, /^soe_legacy_billing_[a-z_]+$/);
  return `public.${name}(${args.map(quote).join(',')})`;
};
async function rpc(name, args, { error = null, app = 'soe-legacy-rpc' } = {}) {
  const result = await sql(`SELECT ${functionSQL(name, args)}::text;`, { role: 'service_role', app, allowError: error !== null });
  if (error !== null) {
    assert.notEqual(result.code, 0); assert.match(result.stderr, new RegExp(`\\b${error}\\b`));
    return result;
  }
  return JSON.parse(result.stdout.trim());
}
function heldExpression(expression, app, role = 'service_role') {
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
  child.stdin.write(`${prefix(app)}BEGIN;${role ? `SET LOCAL ROLE ${role};` : ''}SELECT jsonb_build_object('pid',pg_backend_pid(),'value',${expression})::text;\n`);
  return first.then(line => { const value = JSON.parse(line); holder.pid = value.pid; holder.value = value.value; return holder; });
}
function heldRpc(name,args,app) { return heldExpression(functionSQL(name,args),app); }
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
const customer = key => `cus_Fictional${key.toUpperCase()}`;
const sub = (id,tier='seeker',status='active') => ({id,kind:'subscription',tier,status,paid:status==='active',valid:true,
 periodStart:new Date(Date.now()-3600000).toISOString(),periodEnd:new Date(Date.now()+25*86400000).toISOString()});
const life = (id='cs_live_FictionalOracle') => ({id,kind:'lifetime',tier:'oracle',status:'complete',paid:true,valid:true,periodStart:null,periodEnd:null});
const inventory = (rows,invalidatedSourceIds=[]) => ({customers:rows,invalidatedSourceIds,needsReview:false});
const one = (cus,sources) => inventory([{customerId:cus,sources}]);
const state = (actor,cus,scope=SCOPE) => rpc('soe_legacy_billing_event_state',[scope,cus,actor]);
const eventArgs = (s,event,value,cus,scope=SCOPE) => [scope,event,HASH,s.memberId,cus,s.revision,s.expectedTier,value];
const pointerExpr = (actor,value) => `public.fixture_pointer_change(${quote(actor)},${quote(value)})`;
const tierExpr = (actor,value) => `public.fixture_tier_change(${quote(actor)},${quote(value)})`;

async function start() {
  const endpoint = await docker(['context', 'inspect', 'colima', '--format', '{{json .Endpoints.docker.Host}}']);
  socket = JSON.parse(endpoint.stdout.trim());
  assert.match(socket, /^unix:\/\//); assert.equal((await stat(socket.slice(7))).isSocket(), true);
  const cached = await docker(['image', 'inspect', IMAGE]);
  const image = JSON.parse(cached.stdout)[0]; assert.equal(image.RepoDigests.includes(IMAGE), true);
  report.cachedImageId = image.Id; report.architecture = image.Architecture; report.container.socket = socket;
  const created = await docker(['run', '--detach', '--pull=never', '--name', NAME,
    '--label', 'soe.local.task=legacy-billing', '--label', `soe.local.run=${RUN}`,
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
 const bytes=await readFile(SQL_PATH);sourceHash=sha(bytes);report.sqlSHA256=sourceHash;
 report.runnerSHA256=sha(await readFile(fileURLToPath(import.meta.url)));
 const protectedPath=resolve(ROOT,'../../docs/sql/supporter-billing.sql');
 report.protectedSupporterSqlSHA256=sha(await readFile(protectedPath));
 log(`Legacy billing SQL SHA256 ${sourceHash}`);await start();
 await sql(`CREATE DATABASE ${DB};`,{database:'postgres'});
 report.engine=(await sql('SELECT version();')).stdout.trim();assert.match(report.engine,/PostgreSQL 17[.]11 /);
 const setup=`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE TABLE public.members(id uuid PRIMARY KEY,tier text,stripe_customer_id text,display_name text);
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
 INSERT INTO members(id,tier,display_name) VALUES ${Object.values(IDS).map(id=>`(${quote(id)},'free','Synthetic member')`).join(',')};
 CREATE FUNCTION public.fixture_pointer_change(p_id uuid,p_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
 BEGIN UPDATE public.members SET stripe_customer_id=p_value WHERE id=p_id;RETURN jsonb_build_object('updated',true);END $$;
 CREATE FUNCTION public.fixture_tier_change(p_id uuid,p_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
 BEGIN UPDATE public.members SET tier=p_value WHERE id=p_id;RETURN jsonb_build_object('updated',true);END $$;`;
 report.fixtureSetupSHA256=sha(setup);await sql(setup);await sql(bytes.toString('utf8'));
 await check('duplicate live event waits and replays one atomic tier write and receipt',async()=>{
  const s=await state(IDS.a,customer('a')),args=eventArgs(s,'evt_Duplicate',one(customer('a'),[sub('sub_A')]),customer('a'));
  const held=await heldRpc('soe_legacy_billing_apply_event',args,`lb-${RUN}-duplicate-holder`);
  const app=`lb-${RUN}-duplicate-waiter`,pending=rpc('soe_legacy_billing_apply_event',args,{app});
  await waitForLock(app,held,'duplicate event');await release(held);const result=await pending;
  assert.equal(result.replayed,true);assert.equal(result.tier,'seeker');assert.equal(result.revision,1);
 });
 await check('different event with stale same-member revision waits then cannot overwrite the winning tier',async()=>{
  const s=await state(IDS.b,customer('b'));
  const held=await heldRpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_Winner',one(customer('b'),[sub('sub_B')]),customer('b')),`lb-${RUN}-cas-holder`);
  const app=`lb-${RUN}-cas-waiter`,pending=rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_Stale',one(customer('b'),[sub('sub_B','philosopher')]),customer('b')),{app,error:'PT409'});
  await waitForLock(app,held,'member revision CAS');await release(held);await pending;
  assert.equal((await state(IDS.b,customer('b'))).expectedTier,'seeker');
 });
 await check('competing customers share a member revision and a cancellation preserves the other valid customer',async()=>{
  const ca='cus_CustomerCA',cb='cus_CustomerCB',s=await state(IDS.c,ca);
  const held=await heldRpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_CustomerA',one(ca,[sub('sub_CA','scholar')]),ca),`lb-${RUN}-multi-holder`);
  const app=`lb-${RUN}-multi-waiter`,pending=rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_CustomerBStale',one(cb,[sub('sub_CB','philosopher')]),cb),{app,error:'PT409'});
  await waitForLock(app,held,'multi-customer revision');await release(held);await pending;
  let fresh=await state(IDS.c,cb),rows=[{customerId:ca,sources:[sub('sub_CA','scholar')]},{customerId:cb,sources:[sub('sub_CB','philosopher')]}];
  fresh=await rpc('soe_legacy_billing_apply_event',eventArgs(fresh,'evt_CustomerB',inventory(rows),cb));assert.equal(fresh.tier,'philosopher');
  rows[1].sources=[sub('sub_CB','philosopher','canceled')];
  fresh=await rpc('soe_legacy_billing_apply_event',eventArgs(fresh,'evt_CustomerBCanceled',inventory(rows),cb));assert.equal(fresh.tier,'scholar');
  await rpc('soe_legacy_billing_apply_event',eventArgs(fresh,'evt_Incomplete',one(cb,rows[1].sources),cb),{error:'PT409'});
 });
 await check('concurrent customer ownership cannot bind one scoped customer or source to two members',async()=>{
  const cus='cus_Contended',d=await state(IDS.d,cus),e=await state(IDS.e,cus);
  const held=await heldRpc('soe_legacy_billing_apply_event',eventArgs(d,'evt_OwnerD',one(cus,[sub('sub_Shared')]),cus),`lb-${RUN}-owner-holder`);
  const app=`lb-${RUN}-owner-waiter`,pending=rpc('soe_legacy_billing_apply_event',eventArgs(e,'evt_OwnerE',one(cus,[sub('sub_Shared','philosopher')]),cus),{app,error:'PT409'});
  await waitForLock(app,held,'customer ownership');await release(held);await pending;
  assert.equal((await sql(`SELECT tier FROM members WHERE id=${quote(IDS.e)};`)).stdout.trim(),'free');
  assert.equal((await sql("SELECT tier FROM legacy_billing_subscriptions WHERE id='sub_Shared';")).stdout.trim(),'seeker');
 });
 await check('cross-member duplicate event rejects the loser without binding its new customer or granting a tier',async()=>{
  const d=await state(IDS.d,'cus_Contended'),e=await state(IDS.e,customer('e'));
  const held=await heldRpc('soe_legacy_billing_apply_event',eventArgs(d,'evt_CrossMember',one('cus_Contended',[sub('sub_Shared')]),'cus_Contended'),`lb-${RUN}-receipt-holder`);
  const app=`lb-${RUN}-receipt-waiter`,pending=rpc('soe_legacy_billing_apply_event',eventArgs(e,'evt_CrossMember',one(customer('e'),[sub('sub_E','philosopher')]),customer('e')),{app,error:'PT409'});
  await waitForLock(app,held,'event identity ownership');await release(held);await pending;
  assert.equal((await sql(`SELECT count(*) FROM legacy_billing_customers WHERE member_id=${quote(IDS.e)};`)).stdout.trim(),'0');
 });
 await check('late receipt failure rolls back a tier change and every newly bound source',async()=>{
  await sql(`CREATE FUNCTION public.fixture_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_id='evt_ForcedRollback' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Synthetic failure';END IF;RETURN NEW;END $$;
   CREATE TRIGGER fixture_reject BEFORE INSERT ON legacy_billing_receipts FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_receipt();`);
  const s=await state(IDS.e,customer('e'));
  await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_ForcedRollback',one(customer('e'),[sub('sub_E','philosopher')]),customer('e')),{error:'23514'});
  const after=await state(IDS.e,customer('e'));assert.equal(after.expectedTier,'free');assert.equal(after.revision,0);
 });
 await check('rolled-back event holder lets an independent waiter apply exactly one durable receipt',async()=>{
  const s=await state(IDS.a,customer('a')),args=eventArgs(s,'evt_RollbackRace',one(customer('a'),[sub('sub_A','scholar')]),customer('a'));
  const held=await heldRpc('soe_legacy_billing_apply_event',args,`lb-${RUN}-rollback-holder`);
  const app=`lb-${RUN}-rollback-waiter`,pending=rpc('soe_legacy_billing_apply_event',args,{app});
  await waitForLock(app,held,'rollback then retry');await release(held,false);const result=await pending;
  assert.equal(result.replayed,false);assert.equal(result.tier,'scholar');assert.equal(result.revision,s.revision+1);
 });
 await check('managed lifetime survives subscription cancellation and only proven source risk removes its entitlement',async()=>{
  let s=await state(IDS.f,customer('f')),sources=[sub('sub_F','scholar'),life()];
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_Oracle',one(customer('f'),sources),customer('f')));assert.equal(s.tier,'oracle');
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_OracleRisk',inventory([{customerId:customer('f'),sources}],[{kind:'lifetime',id:'cs_live_FictionalOracle'}]),customer('f')));assert.equal(s.tier,'scholar');
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_OracleReplayPaid',one(customer('f'),sources),customer('f')));assert.equal(s.tier,'scholar');
 });
 await check('unproven initial Oracle remains a protected floor without a fabricated purchase',async()=>{
  await sql(`UPDATE members SET tier='oracle' WHERE id=${quote(IDS.j)};`);let s=await state(IDS.j,customer('j'));
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_UnprovenOracle',one(customer('j'),[sub('sub_J','seeker','canceled')]),customer('j')));
  assert.equal(s.tier,'oracle');assert.equal(s.tierWritten,false);assert.equal(s.needsReview,true);
 });
 await check('external tier update row lock defeats stale CAS and future verified sources cannot overwrite external authority',async()=>{
  let s=await state(IDS.g,customer('g'));s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_GInitial',one(customer('g'),[sub('sub_G')]),customer('g')));
  const held=await heldExpression(tierExpr(IDS.g,'oracle'),`lb-${RUN}-external-holder`,null);
  const app=`lb-${RUN}-external-waiter`,pending=rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_GStale',one(customer('g'),[sub('sub_G','philosopher')]),customer('g')),{app,error:'PT409'});
  await waitForLock(app,held,'external tier authority');await release(held);await pending;
  s=await state(IDS.g,customer('g'));assert.equal(s.externalChange,true);
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_GReview',one(customer('g'),[sub('sub_G','philosopher')]),customer('g')));assert.equal(s.tier,'oracle');assert.equal(s.tierWritten,false);
 });
 await check('pointer assignment that wins first blocks a conflicting fresh provider claim after an observed barrier wait',async()=>{
  const cus='cus_PointerBefore',s=await state(IDS.h,cus);
  const held=await heldExpression(pointerExpr(IDS.i,cus),`lb-${RUN}-pointer-first`,null);
  const app=`lb-${RUN}-pointer-waiter`,pending=rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_PointerBefore',one(cus,[sub('sub_HBefore')]),cus),{app,error:'PT409'});
  await waitForLock(app,held,'pointer before billing');await release(held);await pending;
  assert.equal((await sql(`SELECT tier FROM members WHERE id=${quote(IDS.h)};`)).stdout.trim(),'free');
 });
 await check('pointer assignment arriving after billing waits before its row lock and later conflicts fail closed',async()=>{
  const cus='cus_PointerAfter',s=await state(IDS.h,cus);
  const held=await heldRpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_PointerAfter',one(cus,[sub('sub_HAfter')]),cus),`lb-${RUN}-billing-first`);
  const app=`lb-${RUN}-pointer-after`,pending=sql(`SELECT ${pointerExpr(IDS.i,cus)};`,{app});
  await waitForLock(app,held,'pointer after billing');await release(held);await pending;
  await rpc('soe_legacy_billing_event_state',[SCOPE,cus,IDS.h],{error:'PT409'});
 });
 await check('ordinary profile and tier updates on another member do not enter the pointer barrier',async()=>{
  const s=await state(IDS.a,customer('a'));
  const held=await heldRpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_ProfileBarrier',one(customer('a'),[sub('sub_A','scholar')]),customer('a')),`lb-${RUN}-profile-holder`);
  await sql(`UPDATE members SET display_name='Updated synthetic profile',tier='free' WHERE id=${quote(IDS.k)};`,{app:`lb-${RUN}-profile-independent`});
  await release(held);
 });
 await check('a different live provider scope cannot cause an automatic downgrade without refresh authority',async()=>{
  let s=await state(IDS.k,customer('k'));s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_KFirst',one(customer('k'),[sub('sub_K')]),customer('k')));
  const scope='live:acct_Replacement';s=await state(IDS.k,customer('k'),scope);
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_KSecond',one(customer('k'),[sub('sub_KSecond','philosopher')]),customer('k'),scope));assert.equal(s.tier,'philosopher');
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_KCanceled',one(customer('k'),[sub('sub_KSecond','philosopher','canceled')]),customer('k'),scope));assert.equal(s.tier,'philosopher');assert.equal(s.tierWritten,false);assert.equal(s.otherLiveScopes,true);
 });
 await check('an unrefreshed higher subscription from another account cannot create or increase a tier',async()=>{
  const oldCustomer=customer('lOld'),freshCustomer=customer('lFresh'),scope='live:acct_FreshSubscription';
  let s=await state(IDS.l,oldCustomer);
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_StaleSubscriptionStored',{...one(oldCustomer,[sub('sub_LStale','philosopher')]),needsReview:true},oldCustomer));
  assert.equal(s.tier,'free');assert.equal(s.tierWritten,false);
  s=await state(IDS.l,freshCustomer,scope);
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_FreshSubscriptionSeeker',one(freshCustomer,[sub('sub_LFresh')]),freshCustomer,scope));
  assert.equal(s.tier,'seeker');assert.equal(s.tierWritten,true);assert.equal(s.otherLiveScopes,true);assert.equal(s.needsReview,true);
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_FreshSubscriptionScholar',one(freshCustomer,[sub('sub_LFresh','scholar')]),freshCustomer,scope));
  assert.equal(s.tier,'scholar');assert.equal(s.tierWritten,true);
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_FreshSubscriptionCanceled',one(freshCustomer,[sub('sub_LFresh','scholar','canceled')]),freshCustomer,scope));
  assert.equal(s.tier,'scholar');assert.equal(s.tierWritten,false);assert.equal(s.needsReview,true);
 });
 await check('an unrefreshed lifetime from another account cannot grant Oracle while fresh upgrades and protected current tiers remain valid',async()=>{
  const oldCustomer=customer('mOld'),freshCustomer=customer('mFresh'),scope='live:acct_FreshLifetime';
  let s=await state(IDS.m,oldCustomer);
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_StaleLifetimeStored',{...one(oldCustomer,[life('cs_live_StaleOracle')]),needsReview:true},oldCustomer));
  assert.equal(s.tier,'free');assert.equal(s.tierWritten,false);
  s=await state(IDS.m,freshCustomer,scope);
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_FreshLifetimeSeeker',one(freshCustomer,[sub('sub_MFresh')]),freshCustomer,scope));
  assert.equal(s.tier,'seeker');assert.equal(s.tierWritten,true);assert.equal(s.otherLiveScopes,true);assert.equal(s.needsReview,true);
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_FreshLifetimePhilosopher',one(freshCustomer,[sub('sub_MFresh','philosopher')]),freshCustomer,scope));
  assert.equal(s.tier,'philosopher');assert.equal(s.tierWritten,true);
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_FreshLifetimeCanceled',one(freshCustomer,[sub('sub_MFresh','philosopher','canceled')]),freshCustomer,scope));
  assert.equal(s.tier,'philosopher');assert.equal(s.tierWritten,false);assert.equal(s.needsReview,true);
 });
 await check('test state is separate and neither tier nor original pointer can be written; browser roles have no authority',async()=>{
  const scope='test:acct_FictionalConcurrency';let s=await state(IDS.e,customer('e'),scope);
  s=await rpc('soe_legacy_billing_apply_event',eventArgs(s,'evt_TestOnly',one(customer('e'),[sub('sub_TestE','philosopher')]),customer('e'),scope));assert.equal(s.tierWritten,false);assert.equal(s.tier,'free');
  assert.equal((await state(IDS.e,customer('e'))).revision,0);
  for(const role of ['anon','authenticated']){
   const denied=await sql(`SELECT public.soe_legacy_billing_event_state(${quote(SCOPE)},${quote(customer('a'))},${quote(IDS.a)});`,{role,allowError:true});assert.notEqual(denied.code,0);assert.match(denied.stderr,/42501/);
  }
  assert.equal((await sql("SELECT has_column_privilege('service_role','members','stripe_customer_id','UPDATE');")).stdout.trim(),'f');
 });
 assert.equal(sha(await readFile(SQL_PATH)),sourceHash);report.sourceUnchanged=true;
 assert.equal(sha(await readFile(protectedPath)),report.protectedSupporterSqlSHA256);report.protectedSupporterSqlUnchanged=true;
 report.status='PASS';
} catch(error){report.status='FAIL';report.error=String(error?.stack||error);process.exitCode=1;log(`FAIL ${report.error}`);}
finally {
 try{await cleanup();}catch(error){report.status='FAIL';report.cleanupError=String(error?.stack||error);process.exitCode=1;log(`CLEANUP FAIL ${report.cleanupError}`);}
 if(sourceHash){try{report.sourceUnchanged=sha(await readFile(SQL_PATH))===sourceHash;assert.equal(report.sourceUnchanged,true);}catch(error){report.status='FAIL';report.sourceError=String(error);process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();log(`${report.status}: ${report.checks.length} checks, ${report.observedLockWaits.length} observed backend lock waits; owned container removed=${report.container.removed}`);
 await mkdir(resolve(ROOT,'evidence'),{recursive:true});await writeFile(resolve(ROOT,'evidence/legacy-billing-postgres.json'),`${JSON.stringify(report,null,2)}\n`);await writeFile(resolve(ROOT,'evidence/legacy-billing-postgres.log'),`${lines.join('\n')}\n`);
}
