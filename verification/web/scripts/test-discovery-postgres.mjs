/** Local, synthetic, independent-backend PostgreSQL checks. No provider calls.
 * Requires the exact already-cached image and existing local Colima socket.
 * Run from this milestone: node scripts/test-discovery-postgres.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

import {offlineApp} from '../tests/support/offline-app.mjs';
const CATALOG=JSON.parse(JSON.stringify(offlineApp().load('lib/circles/discovery-catalog.ts').DISCOVERY_SEARCH_CATALOG));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'postgres@sha256:3b0cda93be7c8dba2ed484d19393d93845dc3dafb88973e248ba8e6d99d784e1';
const RUN = randomUUID().replaceAll('-', '').slice(0, 12);
const NAME = `soe-discovery-pg-${RUN}`;
const DB = `soe_discovery_${RUN}`;
const SQL_PATH = resolve(ROOT, '../../docs/sql/circle-discovery-search.sql');
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
    'Disposable local PostgreSQL 17.11 evidence; no production database, provider account, payment or deployment was used.',
    'Synthetic scale checks cover 1000 live Circles and representative public fields; these are local single-core measurements, not production capacity guarantees.',
    'The actual relevant Circle SQL stack and a minimal synthetic members table are applied; billing, full authentication and native behavior require separate verification.',
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
    '--label', 'soe.local.task=discovery-search', '--label', `soe.local.run=${RUN}`,
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
 '../../docs/sql/circle-discovery-unicode.sql',
 '../../docs/sql/circle-discovery-search.sql',
];
const q=(overrides={})=>({terms:[],cityTerms:[],format:'',open:false,sort:'next',book:null,edition:null,...overrides});
const search=(query=q(),{after=null,calendarKey=null,limit=25}={})=>rpc('soe_circle_discovery_search',[query,CATALOG,after,calendarKey,limit]);
const circle=n=>`f3000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sqlHashes={};
async function explain(query,label){
 const expression=functionSQL('soe_circle_discovery_search',[query,CATALOG,null,null,25]);
 const plan=JSON.parse((await sql(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT ${expression};`,{role:'service_role'})).stdout.trim());
 report.performance??=[];report.performance.push({label,plan});
 report.performanceBudgetMilliseconds=2000;
 assert.equal(plan[0].Plan['Actual Rows'],1);assert.ok(plan[0]['Execution Time']<report.performanceBudgetMilliseconds,`${label} exceeded the local 2s scale regression budget`);
 return plan[0]['Execution Time'];
}
try{
 assert.throws(()=>fetch('https://fixture.invalid/never-send'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/,'Startup network guard is required');
 sourceHash=sha(await readFile(SQL_PATH));report.sqlSHA256=sourceHash;report.runnerSHA256=sha(await readFile(fileURLToPath(import.meta.url)));
 for(const file of STACK)sqlHashes[file]=sha(await readFile(resolve(ROOT,file)));report.appliedSqlSHA256=sqlHashes;
 log(`Discovery SQL SHA256 ${sourceHash}`);await start();await sql(`CREATE DATABASE ${DB};`,{database:'postgres'});
 report.engine=(await sql('SELECT version();')).stdout.trim();assert.match(report.engine,/PostgreSQL 17[.]11 /);
 const setup=`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE TABLE public.members(id uuid PRIMARY KEY,display_name text);
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
 INSERT INTO members(id,display_name) VALUES(${quote(IDS.host)},'Synthetic Host'),(${quote(IDS.author)},'Synthetic Member');`;
 report.fixtureSetupSHA256=sha(setup);await sql(setup);
 for(const file of STACK)await sql((await readFile(resolve(ROOT,file))).toString('utf8'));
 const fixture=`INSERT INTO public.book_cohorts(id,book_id,title,description,max_members,start_date,status,created_by,circle_format,circle_city,circle_region,circle_venue_name,circle_venue_type,circle_weekday,circle_time,circle_timezone,circle_path_id)
 SELECT ('f3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'soe-circles-path',
 CASE WHEN n=1000 THEN 'Findable future Circle' WHEN n%10=0 THEN 'Québec Σκέψη Circle '||lpad(n::text,4,'0') ELSE 'Synthetic reading Circle '||lpad(n::text,4,'0') END,
 repeat('A local public reading group for careful thought, questions, and open discussion. ',3)||CASE WHEN n%10=0 THEN 'Éthique ΟΣ The synthetic group welcomes differing views.' ELSE 'The synthetic group welcomes differing views.' END,
 8,((statement_timestamp() AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC','forming',${quote(IDS.host)}::uuid,
 'in_person',CASE WHEN n%10=0 THEN 'Québec' ELSE 'Fictional City' END,'Fixture','Synthetic public library','library',
 extract(dow FROM (statement_timestamp() AT TIME ZONE 'UTC')::date+1)::smallint,'19:00','UTC','starter-12' FROM generate_series(1,1000)n;
 INSERT INTO public.book_cohorts(id,book_id,title,description,max_members,start_date,status,created_by,circle_format,circle_city,circle_venue_name,circle_venue_type,circle_weekday,circle_time,circle_timezone,circle_path_id)
 SELECT ('f4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'soe-circles-path','An ended retained Circle '||n,'Synthetic ended group.',8,
 ((statement_timestamp() AT TIME ZONE 'UTC')::date-365)::timestamp AT TIME ZONE 'UTC','forming',${quote(IDS.host)}::uuid,
 'in_person','Fictional City','Synthetic public library','library',extract(dow FROM (statement_timestamp() AT TIME ZONE 'UTC')::date-365)::smallint,'19:00','UTC','starter-12' FROM generate_series(1,205)n;
 ANALYZE book_cohorts;ANALYZE book_cohort_members;`;
 report.fixtureRowsSHA256=sha(fixture);await sql(fixture);
 await check('actual PostgreSQL Unicode folding preserves contextual Greek and compatibility semantics',async()=>{
  const cases=['ΟΣ','ΟΣΑ','A\u02b0Σ','AΣ\u02b0','AΣ\u02b0B','\u02b0Σ','Σ\u0301','İ','I\u0307','ﬃ','Straße','Éthique','A𝚺','A𝚺B','ASCII ONLY'];
  const rows=JSON.parse((await sql(`SELECT jsonb_agg(public._soe_circle_discovery_fold(s) ORDER BY n) FROM unnest(ARRAY[${cases.map(quote).join(',')}]) WITH ORDINALITY x(s,n);`,{role:'service_role'})).stdout.trim());
  assert.deepEqual(rows,cases.map(s=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-US')));
 });
 await check('1000 live groups plus205 stale groups preserve a later matching Circle',async()=>{
  assert.deepEqual((await search(q({terms:['findable','future']}))).items.map(x=>x.circle.id),[circle(1000)]);
  const before=(await sql('SELECT jsonb_build_object(\'members\',(SELECT count(*) FROM book_cohort_members),\'receipts\',(SELECT count(*) FROM circle_participation_receipts),\'messages\',(SELECT count(*) FROM seminar_messages));')).stdout;
  await search();await search(q({terms:['synthetic'],cityTerms:['quebec'],format:'in_person',open:true}));
  assert.equal((await sql('SELECT jsonb_build_object(\'members\',(SELECT count(*) FROM book_cohort_members),\'receipts\',(SELECT count(*) FROM circle_participation_receipts),\'messages\',(SELECT count(*) FROM seminar_messages));')).stdout,before);
 });
 await check('complete stable inventory is reachable across40 bounded pages with no global cap',async()=>{
  const ids=[];let after=null,calendarKey=null;
  do{const page=await search(q(),{after,calendarKey});assert.ok(page.items.length<=25);ids.push(...page.items.map(x=>x.circle.id));after=page.next;calendarKey=after?page.calendarKey:null;}while(after);
  assert.equal(ids.length,1000);assert.equal(new Set(ids).size,1000);
 });
 await check('representative1000live query plans remain inside the bounded request budget',async()=>{
  report.performanceMilliseconds={unfiltered:await explain(q(),'1000 live: unfiltered upcoming page'),keyword:await explain(q({terms:['careful','open']}),'1000 live: public keyword AND'),city:await explain(q({cityTerms:['quebec'],open:true}),'1000 live: city and open seats'),formatNoMatch:await explain(q({terms:['careful'],format:'online'}),'1000 live: cheap format eliminates all')};
  log(JSON.stringify({performanceMilliseconds:report.performanceMilliseconds}));
 });
 await check('a held update does not block public reads or leak uncommitted hidden state',async()=>{
  await sql(`CREATE FUNCTION fixture_discovery_hold(p_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN UPDATE book_cohorts SET circle_hidden=true WHERE id=p_id;RETURN jsonb_build_object('hidden',true);END $$;`);
  const holder=await heldExpression(`fixture_discovery_hold(${quote(circle(1000))})`,`discovery-${RUN}-holder`,null);
  try{assert.deepEqual((await search(q({terms:['findable']}))).items.map(x=>x.circle.id),[circle(1000)]);}finally{await release(holder);}
  assert.equal((await search(q({terms:['findable']}))).items.length,0);
 });
 await check('service-only invoker functions retain browser and profile boundaries',async()=>{
  for(const role of ['anon','authenticated']){const result=await sql(`SELECT ${functionSQL('soe_circle_discovery_search',[q(),CATALOG,null,null,25])};`,{role,allowError:true});assert.notEqual(result.code,0);assert.match(result.stderr,/42501/);}
  assert.equal((await sql("SELECT has_column_privilege('service_role','members','display_name','UPDATE');")).stdout.trim(),'f');
  assert.equal((await sql("SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'circle_discovery%' AND relkind='r';")).stdout.trim(),'0');
 });
 for(const file of STACK)assert.equal(sha(await readFile(resolve(ROOT,file))),sqlHashes[file]);report.sourceUnchanged=true;report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error?.stack||error);process.exitCode=1;log(`FAIL ${report.error}`);}
finally{
 try{await cleanup();}catch(error){report.status='FAIL';report.cleanupError=String(error?.stack||error);process.exitCode=1;log(`CLEANUP FAIL ${report.cleanupError}`);}
 for(const[file,hash]of Object.entries(sqlHashes)){try{assert.equal(sha(await readFile(resolve(ROOT,file))),hash);}catch(error){report.status='FAIL';report.sourceError=String(error);process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();log(`${report.status}: ${report.checks.length} checks; owned container removed=${report.container.removed}`);
 await mkdir(resolve(ROOT,'evidence'),{recursive:true});await writeFile(resolve(ROOT,'evidence/discovery-postgres.json'),`${JSON.stringify(report,null,2)}\n`);await writeFile(resolve(ROOT,'evidence/discovery-postgres.log'),`${lines.join('\n')}\n`);
}
