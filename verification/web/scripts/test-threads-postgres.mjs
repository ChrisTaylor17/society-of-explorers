/** Local, synthetic, independent-backend PostgreSQL checks. No provider calls.
 * Requires the exact already-cached image and existing local Colima socket.
 * Run from this milestone: node scripts/test-threads-postgres.mjs
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
const NAME = `soe-threads-pg-${RUN}`;
const DB = `soe_threads_${RUN}`;
const SQL_PATH = resolve(ROOT, '../../docs/sql/circle-discussion-threads.sql');
const ENV = { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: 'C' };
const IDS = {host:'11111111-1111-4111-8111-111111111111',reviewer:'22222222-2222-4222-8222-222222222222',author:'33333333-3333-4333-8333-333333333333',reader:'44444444-4444-4444-8444-444444444444',other:'55555555-5555-4555-8555-555555555555',circle:'77777777-7777-4777-8777-777777777777',circle2:'88888888-8888-4888-8888-888888888888',circle3:'99999999-9999-4999-8999-999999999999'};
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
    'The actual relevant Circle SQL stack and a minimal synthetic members table are applied; billing/auth/native behavior is verified separately.',
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
    '-qAt', '-P', 'null=__SOE_SQL_NULL__', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
}
function prefix(app = 'soe-threads-fixture', role = null) {
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
  assert.match(name, /^soe_circle_[a-z_]+$/);
  return `public.${name}(${args.map(quote).join(',')})`;
};
async function rpc(name, args, { error = null, app = 'soe-threads-rpc' } = {}) {
  const result = await sql(`SELECT ${functionSQL(name, args)}::text;`, { role: 'service_role', app, allowError: error !== null });
  if (error !== null) {
    assert.notEqual(result.code, 0); assert.match(result.stderr, new RegExp(`\\b${error}\\b`));
    return result;
  }
  const raw = result.stdout.trim();
  // An absent own receipt is SQL NULL, distinct from a malformed empty reply.
  return raw === '__SOE_SQL_NULL__' ? null : JSON.parse(raw);
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
async function start() {
  const endpoint = await docker(['context', 'inspect', 'colima', '--format', '{{json .Endpoints.docker.Host}}']);
  socket = JSON.parse(endpoint.stdout.trim());
  assert.match(socket, /^unix:\/\//); assert.equal((await stat(socket.slice(7))).isSocket(), true);
  const cached = await docker(['image', 'inspect', IMAGE]);
  const image = JSON.parse(cached.stdout)[0]; assert.equal(image.RepoDigests.includes(IMAGE), true);
  report.cachedImageId = image.Id; report.architecture = image.Architecture; report.container.socket = socket;
  const created = await docker(['run', '--detach', '--pull=never', '--name', NAME,
    '--label', 'soe.local.task=discussion-threads', '--label', `soe.local.run=${RUN}`,
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

const STACK = [
 '../../supabase/book_cohorts.sql',
 '../../supabase/migrations/20261027_soe_circles.sql',
 '../../docs/sql/circle-moderation.sql',
 '../../docs/sql/circle-message-moderation.sql',
 '../../docs/sql/circle-participation.sql',
 '../../docs/sql/circle-reading-programs.sql',
 '../../docs/sql/circle-passage-posts.sql',
 '../../docs/sql/circle-discussion-threads.sql',
];
const CONTENT='An independently authored fictional discussion contribution.';
const key=()=>randomUUID();
const postArgs=(requestId,{circle=IDS.circle,content=CONTENT,parent=null,revision=null,hash=null,name='Synthetic Author',actor=IDS.author}={})=>[actor,circle,requestId,content,parent,revision,hash,name];
const ownReceipt=(requestId,circle=IDS.circle)=>rpc('soe_circle_discussion_receipt',[IDS.author,circle,requestId]);
const target=(parent,circle=IDS.circle)=>rpc('soe_circle_discussion_target',[IDS.author,circle,parent]);
const revision=async circle=>Number((await sql(`SELECT circle_participation_revision FROM public.book_cohorts WHERE id=${quote(circle)};`)).stdout.trim());
const messageCount=async circle=>Number((await sql(`SELECT count(*) FROM seminar_messages WHERE cohort_id=${quote(circle)};`)).stdout.trim());
const rejoin=async circle=>rpc('soe_circle_join',[IDS.author,circle,await revision(circle),key()]);
const makePost=(opts={})=>rpc('soe_circle_discussion_post',postArgs(key(),opts));
const makeReply=async(parent,opts={})=>{const preview=(await target(parent,opts.circle)).target;return makePost({...opts,parent,revision:preview.revision,hash:preview.contentHash});};
const hideArgs=(message,hash)=>[IDS.reviewer,IDS.circle,message,0,hash,key(),'hide','misleading','A human reviewed this synthetic contribution and recorded an explanation.',null,'fictional discussion'];
const sqlHashes={};
try{
 sourceHash=sha(await readFile(SQL_PATH));report.sqlSHA256=sourceHash;report.runnerSHA256=sha(await readFile(fileURLToPath(import.meta.url)));
 for(const file of STACK)sqlHashes[file]=sha(await readFile(resolve(ROOT,file)));report.appliedSqlSHA256=sqlHashes;
 log(`Threads SQL SHA256 ${sourceHash}`);await start();
 await sql(`CREATE DATABASE ${DB};`,{database:'postgres'});
 report.engine=(await sql('SELECT version();')).stdout.trim();assert.match(report.engine,/PostgreSQL 17[.]11 /);
 const setup=`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE TABLE public.members(id uuid PRIMARY KEY,display_name text);
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
 INSERT INTO members(id,display_name) VALUES ${['host','reviewer','author','reader','other'].map(name=>`(${quote(IDS[name])},${quote('Synthetic '+name)})`).join(',')};`;
 report.fixtureSetupSHA256=sha(setup);await sql(setup);
 for(const file of STACK)await sql((await readFile(resolve(ROOT,file))).toString('utf8'));
 const fixture=`INSERT INTO public.book_cohorts(id,book_id,title,description,max_members,start_date,status,created_by,circle_format,circle_city,circle_venue_name,circle_venue_type,circle_weekday,circle_time,circle_timezone,circle_path_id)
 SELECT id,'soe-circles-path','Synthetic public reading Circle','Synthetic local test description.',8,
 ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC','forming',${quote(IDS.host)}::uuid,
 'in_person','Fictional City','Fictional library','library',extract(dow FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+1)::smallint,'19:00','UTC','starter-12'
 FROM unnest(ARRAY[${[IDS.circle,IDS.circle2,IDS.circle3].map(quote).join(',')}]::uuid[]) id;
 INSERT INTO public.book_cohort_members(cohort_id,member_id) SELECT c.id,m.id FROM book_cohorts c CROSS JOIN members m WHERE m.id IN(${quote(IDS.author)},${quote(IDS.reader)});
 INSERT INTO public.circle_reviewer_grants(cohort_id,member_id) SELECT id,${quote(IDS.reviewer)}::uuid FROM book_cohorts;
 CREATE FUNCTION public.fixture_hide_circle(p_circle uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN UPDATE public.book_cohorts SET circle_hidden=true WHERE id=p_circle;RETURN jsonb_build_object('hidden',true);END $$;`;
 report.fixtureRowsSHA256=sha(fixture);await sql(fixture);

 await check('independent same-key sends wait and recover one original immutable standalone message',async()=>{
  const requestId=key(),before=await messageCount(IDS.circle);
  const holder=await heldRpc('soe_circle_discussion_post',postArgs(requestId),`thread-${RUN}-same-holder`);
  const app=`thread-${RUN}-same-waiter`,pending=rpc('soe_circle_discussion_post',postArgs(requestId,{name:'A changed later name'}),{app});
  await waitForLock(app,holder,'same-key standalone send');await release(holder);const replay=await pending;
  assert.equal(replay.replayed,true);assert.equal(replay.message.id,holder.value.message.id);assert.equal(replay.message.member_name,'Synthetic Author');assert.equal(await messageCount(IDS.circle),before+1);
 });
 await check('same-key changed payload refuses after lock wait without a duplicate',async()=>{
  const requestId=key(),before=await messageCount(IDS.circle),holder=await heldRpc('soe_circle_discussion_post',postArgs(requestId),`thread-${RUN}-changed-holder`);
  const app=`thread-${RUN}-changed-waiter`,pending=rpc('soe_circle_discussion_post',postArgs(requestId,{content:CONTENT+' Changed.'}),{app,error:'PT409'});
  await waitForLock(app,holder,'changed same-key payload');await release(holder);await pending;assert.equal(await messageCount(IDS.circle),before+1);
 });
 await check('one actor key across Circles waits on unique receipt and rolls the losing body back',async()=>{
  const requestId=key(),before=await messageCount(IDS.circle2),holder=await heldRpc('soe_circle_discussion_post',postArgs(requestId),`thread-${RUN}-cross-holder`);
  const app=`thread-${RUN}-cross-waiter`,pending=rpc('soe_circle_discussion_post',postArgs(requestId,{circle:IDS.circle2}),{app,error:'PT409'});
  await waitForLock(app,holder,'cross-Circle key uniqueness');await release(holder);await pending;assert.equal(await messageCount(IDS.circle2),before);
 });
 await check('first-backend rollback lets the waiter create one original reply and edge',async()=>{
  const parent=await makePost(),preview=(await target(parent.message.id)).target,requestId=key();
  const args=postArgs(requestId,{parent:parent.message.id,revision:preview.revision,hash:preview.contentHash}),before=await messageCount(IDS.circle);
  const holder=await heldRpc('soe_circle_discussion_post',args,`thread-${RUN}-rollback-holder`);
  const app=`thread-${RUN}-rollback-waiter`,pending=rpc('soe_circle_discussion_post',args,{app});
  await waitForLock(app,holder,'reply rollback and retry');await release(holder,false);const saved=await pending;
  assert.equal(saved.replayed,false);assert.equal(saved.message.parentMessageId,parent.message.id);assert.equal(await messageCount(IDS.circle),before+1);
  assert.equal((await sql(`SELECT count(*) FROM circle_message_reply_links WHERE message_id=${quote(saved.message.id)};`)).stdout.trim(),'1');
 });
 await check('human parent hide winning first rejects a waiting new reply yet exact earlier reply recovers',async()=>{
  const parent=await makePost(),preview=(await target(parent.message.id)).target,requestId=key(),replyArgs=postArgs(requestId,{parent:parent.message.id,revision:0,hash:preview.contentHash});
  const earlier=await rpc('soe_circle_discussion_post',replyArgs);
  const holder=await heldRpc('soe_circle_message_review_decide',hideArgs(parent.message.id,preview.contentHash),`thread-${RUN}-hide-holder`);
  const app=`thread-${RUN}-reply-after-hide`,pending=rpc('soe_circle_discussion_post',postArgs(key(),{parent:parent.message.id,revision:0,hash:preview.contentHash}),{app,error:'PT409'});
  await waitForLock(app,holder,'human hide before new reply');await release(holder);await pending;
  await rpc('soe_circle_discussion_target',[IDS.author,IDS.circle,parent.message.id],{error:'PT409'});
  const replay=await rpc('soe_circle_discussion_post',replyArgs);assert.equal(replay.replayed,true);assert.equal(replay.message.id,earlier.message.id);assert.equal(replay.message.visibility,'visible');
  const view=await rpc('soe_circle_discussion_thread',[IDS.author,IDS.circle,earlier.message.id,null,25]);assert.equal(view.root.content,null);assert.equal(view.root.visibility,'hidden');assert.equal(view.focus.content,CONTENT);
 });
 await check('reply winning first commits independently while a waiting human decision holds only its parent',async()=>{
  const parent=await makePost(),preview=(await target(parent.message.id)).target;
  const holder=await heldRpc('soe_circle_discussion_post',postArgs(key(),{parent:parent.message.id,revision:0,hash:preview.contentHash}),`thread-${RUN}-reply-holder`);
  const app=`thread-${RUN}-hide-after-reply`,pending=rpc('soe_circle_message_review_decide',hideArgs(parent.message.id,preview.contentHash),{app});
  await waitForLock(app,holder,'reply before human hide');await release(holder);await pending;
  const view=await rpc('soe_circle_discussion_thread',[IDS.author,IDS.circle,holder.value.message.id,null,25]);assert.equal(view.root.content,null);assert.equal(view.focus.visibility,'visible');
 });
 await check('a held archive page serializes human withdrawal and a subsequent page withholds raw text',async()=>{
  const saved=await makePost();
  const holder=await heldRpc('soe_circle_discussion_read',[IDS.author,IDS.circle,null,25],`thread-${RUN}-read-holder`);
  const app=`thread-${RUN}-withdraw-after-read`,pending=rpc('soe_circle_message_action',[IDS.author,IDS.circle,saved.message.id,0,sha(Buffer.from(CONTENT)),key(),'withdraw',null,null],{app});
  await waitForLock(app,holder,'archive read before author withdrawal');assert.equal(holder.value.items.find(x=>x.id===saved.message.id).content,CONTENT);await release(holder);await pending;
  const view=await rpc('soe_circle_discussion_thread',[IDS.author,IDS.circle,saved.message.id,null,25]);assert.equal(view.focus.content,null);assert.equal(view.focus.visibility,'withdrawn');
 });
 await check('leave winning first denies waiting reply and all subsequent archive and receipt access',async()=>{
  const parent=await makePost({circle:IDS.circle2}),preview=(await target(parent.message.id,IDS.circle2)).target,requestId=key();
  const holder=await heldRpc('soe_circle_leave',[IDS.author,IDS.circle2,await revision(IDS.circle2),key()],`thread-${RUN}-leave-holder`);
  const app=`thread-${RUN}-reply-after-leave`,pending=rpc('soe_circle_discussion_post',postArgs(requestId,{circle:IDS.circle2,parent:parent.message.id,revision:0,hash:preview.contentHash}),{app,error:'PT403'});
  await waitForLock(app,holder,'leave before reply');await release(holder);await pending;
  await rpc('soe_circle_discussion_read',[IDS.author,IDS.circle2,null,25],{error:'PT403'});await ownReceipt(requestId,IDS.circle2).then(()=>assert.fail('Departed receipt read succeeded'),e=>assert.match(String(e),/PT403/));await rejoin(IDS.circle2);
 });
 await check('Circle quarantine serializes a waiting archive read and refuses it without a roster or body',async()=>{
  const holder=await heldExpression(`public.fixture_hide_circle(${quote(IDS.circle3)})`,`thread-${RUN}-circle-hide-holder`,null);
  const app=`thread-${RUN}-read-after-hide`,pending=rpc('soe_circle_discussion_read',[IDS.author,IDS.circle3,null,25],{app,error:'PT404'});
  await waitForLock(app,holder,'Circle hide before archive');await release(holder);await pending;
 });
 await check('nested replies retain exact canonical root and thread focus with deterministic flat pages',async()=>{
  const parent=await makePost(),ids=[];let immediate=parent.message.id;
  for(let n=0;n<28;n++){const saved=await makeReply(immediate,{content:`Independent nested reply ${n}.`});ids.push(saved.message.id);assert.equal(saved.message.rootMessageId,parent.message.id);immediate=saved.message.id;}
  const first=await rpc('soe_circle_discussion_thread',[IDS.author,IDS.circle,ids.at(-1),null,10]);assert.equal(first.focus.id,ids.at(-1));assert.equal(first.root.id,parent.message.id);
  assert.deepEqual((await rpc('soe_circle_discussion_thread',[IDS.author,IDS.circle,ids.at(-1),parent.message.id,10])).items,first.items);
  const second=await rpc('soe_circle_discussion_thread',[IDS.author,IDS.circle,parent.message.id,first.nextCursor,10]),third=await rpc('soe_circle_discussion_thread',[IDS.author,IDS.circle,parent.message.id,second.nextCursor,10]);
  assert.deepEqual([...first.items,...second.items,...third.items].map(x=>x.id),ids);assert.equal(third.nextCursor,null);
  await rpc('soe_circle_discussion_thread',[IDS.author,IDS.circle,parent.message.id,(await makePost()).message.id,10],{error:'PT400'});
 });
 await check('archive pages include legacy posts beyond 100 with exact microsecond ties and held cursor anchors',async()=>{
  await sql(`INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content,created_at)
   SELECT ('f0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,${quote(IDS.circle2)},${quote(IDS.author)},'Synthetic legacy author','Retained synthetic legacy post.',
   CASE WHEN n<4 THEN '2020-01-01 00:00:00.000001+00'::timestamptz ELSE '2020-01-01 00:00:00+00'::timestamptz+n*interval '1 microsecond' END FROM generate_series(1,107)n;
   INSERT INTO circle_message_states(message_id,cohort_id,hidden) VALUES('f0000000-0000-4000-8000-000000000085',${quote(IDS.circle2)},true);`);
  const expected=JSON.parse((await sql(`SELECT json_agg(id ORDER BY coalesce(created_at,'-infinity'::timestamptz) DESC,id DESC) FROM seminar_messages WHERE cohort_id=${quote(IDS.circle2)};`)).stdout.trim());
  let before=null;const ids=[];do{const page=await rpc('soe_circle_discussion_read',[IDS.author,IDS.circle2,before,25]);ids.push(...page.items.map(x=>x.id));before=page.nextCursor;}while(before);
  assert.deepEqual(ids,expected);assert.ok(ids.length>100);assert.equal(new Set(ids).size,ids.length);
  const afterHeld=await rpc('soe_circle_discussion_read',[IDS.author,IDS.circle2,'f0000000-0000-4000-8000-000000000085',25]);assert.equal(afterHeld.items.some(x=>x.id==='f0000000-0000-4000-8000-000000000085'),false);
 });
 await check('matching expression archive index supports bounded keyset plans on synthetic history',async()=>{
  await sql(`INSERT INTO seminar_messages(cohort_id,member_id,member_name,content,created_at)
   SELECT ${quote(IDS.circle2)},${quote(IDS.author)},'Synthetic indexed author','Synthetic indexed history.',
   '2010-01-01+00'::timestamptz+n*interval '1 second' FROM generate_series(1,5000)n;ANALYZE seminar_messages;`);
  const plan=JSON.parse((await sql(`EXPLAIN(FORMAT JSON) SELECT id FROM seminar_messages WHERE cohort_id=${quote(IDS.circle2)} ORDER BY coalesce(created_at,'-infinity'::timestamptz) DESC,id DESC LIMIT 26;`)).stdout.trim());
  report.archiveExplain=plan;assert.match(JSON.stringify(plan),/circle_discussion_archive/);assert.equal(JSON.stringify(plan).includes('"Node Type":"Sort"'),false);
 });
 await check('invalid legacy dates and bodies are explicit unavailable tombstones and cannot become reply targets',async()=>{
  await sql(`INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content,created_at) VALUES
   ('f1000000-0000-4000-8000-000000000001',${quote(IDS.circle)},${quote(IDS.author)},'Synthetic','Retained nil date',NULL),
   ('f1000000-0000-4000-8000-000000000002',${quote(IDS.circle)},${quote(IDS.author)},'Synthetic',repeat('x',2001),clock_timestamp()),
   ('f1000000-0000-4000-8000-000000000003',${quote(IDS.circle)},${quote(IDS.author)},'Synthetic',chr(10)||chr(9)||chr(160),clock_timestamp());`);
  for(let n=1;n<=3;n++){const id=`f1000000-0000-4000-8000-${String(n).padStart(12,'0')}`,value=await rpc('soe_circle_discussion_thread',[IDS.author,IDS.circle,id,null,25]);assert.equal(value.focus.visibility,'unavailable');assert.equal(value.focus.content,null);if(n===1)assert.equal(value.focus.created_at,null);await rpc('soe_circle_discussion_target',[IDS.author,IDS.circle,id],{error:'PT409'});}
 });
 await check('late receipt failure atomically rolls back reply body and edge',async()=>{
  const parent=await makePost(),preview=(await target(parent.message.id)).target,requestId=key(),before=await messageCount(IDS.circle);
  const links=Number((await sql('SELECT count(*) FROM circle_message_reply_links;')).stdout.trim());
  await sql(`CREATE FUNCTION fixture_thread_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.request_id=${quote(requestId)}::uuid THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Synthetic receipt failure';END IF;RETURN NEW;END $$;
  CREATE TRIGGER fixture_thread_receipt_failure BEFORE INSERT ON circle_discussion_post_receipts FOR EACH ROW EXECUTE FUNCTION fixture_thread_receipt_failure();`);
  await rpc('soe_circle_discussion_post',postArgs(requestId,{parent:parent.message.id,revision:0,hash:preview.contentHash}),{error:'23514'});
  assert.equal(await messageCount(IDS.circle),before);assert.equal(Number((await sql('SELECT count(*) FROM circle_message_reply_links;')).stdout.trim()),links);assert.equal(await ownReceipt(requestId),null);
 });
 await check('current completion allows member wrap-up while browser grants and new actor foreign keys remain absent',async()=>{
  await sql(`UPDATE book_cohorts SET status='completed' WHERE id=${quote(IDS.circle2)};`);const parent=await makePost({circle:IDS.circle2});assert.equal((await makeReply(parent.message.id,{circle:IDS.circle2})).message.visibility,'visible');
  for(const role of ['anon','authenticated'])for(const statement of [`SELECT soe_circle_discussion_read(${quote(IDS.author)},${quote(IDS.circle)},NULL,25);`,'SELECT * FROM circle_discussion_post_receipts;','SELECT * FROM circle_message_reply_links;']){const value=await sql(statement,{role,allowError:true});assert.notEqual(value.code,0);assert.match(value.stderr,/42501/);}
  assert.equal((await sql("SELECT count(*) FROM pg_constraint WHERE conrelid='circle_discussion_post_receipts'::regclass AND confrelid='members'::regclass AND contype='f';")).stdout.trim(),'0');
  assert.equal((await sql("SELECT has_column_privilege('service_role','members','display_name','UPDATE');")).stdout.trim(),'f');
 });
 for(const file of STACK)assert.equal(sha(await readFile(resolve(ROOT,file))),sqlHashes[file]);
 report.sourceUnchanged=true;report.existingSqlUnchanged=true;report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error?.stack||error);process.exitCode=1;log(`FAIL ${report.error}`);}
finally{
 try{await cleanup();}catch(error){report.status='FAIL';report.cleanupError=String(error?.stack||error);process.exitCode=1;log(`CLEANUP FAIL ${report.cleanupError}`);}
 for(const[file,hash]of Object.entries(sqlHashes)){try{assert.equal(sha(await readFile(resolve(ROOT,file))),hash);}catch(error){report.status='FAIL';report.sourceError=String(error);process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();log(`${report.status}: ${report.checks.length} checks, ${report.observedLockWaits.length} observed backend lock waits; owned container removed=${report.container.removed}`);
 await mkdir(resolve(ROOT,'evidence'),{recursive:true});await writeFile(resolve(ROOT,'evidence/threads-postgres.json'),`${JSON.stringify(report,null,2)}\n`);await writeFile(resolve(ROOT,'evidence/threads-postgres.log'),`${lines.join('\n')}\n`);
}

