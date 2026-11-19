import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('gateway runs from unrelated cwd with explicit output directory and dynamic loopback ports', { timeout: 15000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'soe-gateway-cwd-'));
  const output = await mkdtemp(join(tmpdir(), 'soe-gateway-evidence-'));
  const child = spawn(process.execPath, [fileURLToPath(new URL('./soe-android-runtime-gateway.mjs', import.meta.url)), '--output-dir', output, '--prefix', 'relocated', '--port', '0', '--trap-port', '0'], {cwd, stdio: ['ignore', 'pipe', 'pipe']});
  let errors = ''; child.stderr.on('data', d => {errors += d;});
  try {
    const info = await new Promise((resolve, reject) => {
      let lines = ''; const timer = setTimeout(() => reject(Error('Gateway did not start: ' + errors)), 8000);
      child.once('exit', code => {clearTimeout(timer); reject(Error('Gateway exited ' + code + ': ' + errors));});
      child.stdout.on('data', d => {lines += d; if(lines.includes('\n')) { clearTimeout(timer); try {resolve(JSON.parse(lines.split('\n')[0]));} catch(e) {reject(e);} }});
    });
    assert.equal((await (await fetch(info.url + '/api/health')).json()).prototype, true);
    const post = async (path, body) => {const r = await fetch(info.url + path, {method:'POST', headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);};
    await post('/__runtime/audit', {tag:'relocation-only',synthetic:true});
    await post('/__runtime/report', {scope:'Android synthetic runtime controller checks',tests:[],synthetic:true});
    assert.equal(JSON.parse(await readFile(join(output,'relocated-native-lifecycle-audit.json'),'utf8'))[0].tag,'relocation-only');
    assert.equal(JSON.parse(await readFile(join(output,'relocated-native-runtime-report.json'),'utf8')).synthetic,true);
    const redirected = await fetch(info.url + '/__runtime/redirect/302/cross', {redirect:'manual'});
    assert.equal(redirected.status,302); assert.equal(redirected.headers.get('location'),info.trap_url+'/capture');
    const stats=await(await fetch(info.url+'/__runtime/redirect-stats')).json();
    assert.equal(stats.originHits.length,1);assert.equal(stats.redirectHits.length,0);
    console.log('RELOCATION_GATEWAY_OK', JSON.stringify({cwd,output,source:fileURLToPath(import.meta.url),originHits:stats.originHits.length}));
  } finally { if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => { child.once('exit',resolve); child.kill('SIGTERM'); }); }
});
