import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const native='platforms/native/',android=native+'android/',member=android+'app/src/main/java/com/anonymous/soesyntheticdemo/member/';
function checked(relative){const full=path.join(root,relative),s=fs.lstatSync(full);assert(!s.isSymbolicLink()&&s.isFile()&&(!s.size||s.blocks),'Refuse linked/offloaded source: '+relative);return full;}
function read(relative){return fs.readFileSync(checked(relative),'utf8');}
const require=createRequire(import.meta.url);
const {memberConfig}=require(checked(android+'member-config.cjs'));
const capture=()=>({
 config:read(member+'MemberConfig.kt'),store:read(member+'MemberSecureStore.kt'),
 transport:read(member+'MemberTransport.kt'),connectivity:read(member+'MemberConnectivity.kt'),
 module:read(member+'NativeSoeMemberModule.kt'),registration:read(member+'SoeMemberPackage.kt')
});

test('actual build-policy validator accepts disabled default and explicit bounded canonical public configuration',()=>{
 assert.deepEqual(memberConfig('',''),{origin:'',storageKey:''});
 for(const origin of ['https://member.example.invalid','https://member.example.invalid:8443','https://127.0.0.1:8443'])
  assert.deepEqual(memberConfig(origin,'sb-project.auth-v2'),{origin,storageKey:'sb-project.auth-v2'});
 assert.equal(memberConfig('https://member.example.invalid','a'.repeat(160)).storageKey.length,160);
});
test('actual build-policy validator rejects partial, credential, path, normalization, injection and oversized configuration',()=>{
 for(const [origin,key] of [
  ['', 'session'],['https://member.example.invalid',''],['http://member.example.invalid','session'],
  ['https://user:password@member.example.invalid','session'],['https://member.example.invalid/','session'],
  ['https://member.example.invalid/path','session'],['https://member.example.invalid?q=1','session'],
  ['https://member.example.invalid#fragment','session'],['https://MEMBER.example.invalid','session'],
  ['https://member.example.invalid:443','session'],['https://member.example.invalid:0','session'],
  ['https://member.example.invalid:65536','session'],['https://127.1','session'],
  ['https://-member.example.invalid','session'],['https://member..example.invalid','session'],
  ['https://'+ 'a'.repeat(64)+'.invalid','session'],['https://member.example.invalid','a'.repeat(161)],
  ['https://member.example.invalid','key"; injected'],['https://member.example.invalid\n','session'],
  ['https://member.example.invalid','../secret'],[null,'session'],['https://member.example.invalid',undefined]
 ])assert.throws(()=>memberConfig(origin,key),undefined,JSON.stringify([origin,key]));
});
test('actual policy CLI rejects without echoing rejected values, and runs with startup network denial',()=>{
 const script=android+'member-config.cjs',guard='verification/web/scripts/deny-build-network.cjs';read(script);read(guard);
 const run=(...args)=>spawnSync(process.execPath,['--require',path.join(root,guard),path.join(root,script),...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',HOME:'/Users/christaylor'}});
 const ok=run('https://member.example.invalid','session');assert.equal(ok.status,0);assert.deepEqual(JSON.parse(ok.stdout),memberConfig('https://member.example.invalid','session'));
 const invalid='PUBLIC_INPUT_MUST_NOT_BE_ECHOED';const bad=run(invalid,'session');assert.equal(bad.status,1);assert.equal(bad.stdout,'');assert.equal(bad.stderr,'SoE member public configuration rejected.\n');assert(!bad.stderr.includes(invalid));
 assert.equal(run('','','extra').status,1);
});
test('actual Gradle source wires validated public properties without changing owned release or synthetic guards (STATIC)',()=>{
 const source=read(android+'app/build.gradle');
 assert.match(source,/rootProject\.file\('member-config\.cjs'\)/);
 for(const name of ['soeMemberOrigin','soeMemberStorageKey'])assert(source.includes(`providers.gradleProperty('${name}').orElse('').get()`));
 for(const name of ['SOE_MEMBER_ORIGIN','SOE_MEMBER_STORAGE_KEY'])assert(source.includes(`buildConfigField "String", "${name}"`));
 assert(source.indexOf('soeMemberPolicyProcess.waitFor() != 0')<source.indexOf('def soeMemberPolicy ='));
 assert.match(source,/signingConfig signingConfigs\.soeOwnedRelease/);assert.match(source,/SOE_EMBEDDED_SYNTHETIC/);
 const validator=read(android+'member-config.cjs');assert.doesNotMatch(validator,/process\.env|readFile|exec|spawn/);
});
test('actual typed v2 spec declares native methods/events and nullable module lookup (AST/static; not Codegen)',()=>{
 const tsFile='node_modules/typescript/lib/typescript.js';const ts=require(checked(tsFile));
 const source=read(native+'specs/NativeSoeMember.ts'),ast=ts.createSourceFile('NativeSoeMember.ts',source,ts.ScriptTarget.Latest,true);
 assert.equal(ast.parseDiagnostics.length,0);
 const spec=ast.statements.find(n=>ts.isInterfaceDeclaration(n)&&n.name.text==='Spec');assert(spec);
 const methods=new Map(spec.members.filter(ts.isMethodSignature).map(n=>[n.name.getText(ast),n]));
  assert.deepEqual([...methods.keys()],['capabilities','begin','newRequestId','send','sendReview','sendCircleReview','sendAuth','prepareEmailLink','pendingEmailLink','claimEmailLink','discardEmailLink','sendEmailAuth','sendPublic','cancel','read','write','remove','resetAccountStorage','getConnectivitySnapshot']);
  for(const [name,args]of Object.entries({begin:['generation'],newRequestId:['generation'],prepareEmailLink:['generation','purpose','email'],pendingEmailLink:['generation'],claimEmailLink:['generation','flowId'],discardEmailLink:['generation','flowId'],sendEmailAuth:['id','request'],read:['slot','generation'],write:['slot','value','generation'],remove:['slot','generation'],resetAccountStorage:['expectedGeneration']}))
  assert.deepEqual(methods.get(name).parameters.map(p=>p.name.getText(ast)),args);
 assert.equal(methods.get('getConnectivitySnapshot').type.getText(ast),'string');
 assert(source.includes('readonly onConnectivityChange: CodegenTypes.EventEmitter'));
 assert.match(source,/TurboModuleRegistry\.get<Spec>\('NativeSoeMember'\)/);assert(!source.includes('getEnforcing'));
 const pkg=JSON.parse(read(native+'package.json'));
 assert.deepEqual(pkg.codegenConfig,{
  name:'SoeMemberSpecs',type:'all',jsSrcsDir:'specs',android:{javaPackageName:'com.anonymous.soesyntheticdemo.member'},
  ios:{modules:{NativeSoeMember:{className:'NativeSoeMemberIOS',unstableRequiresMainQueueSetup:true}},
   components:{SoeSourceReader:{className:'SoeSourceReaderView'},SoeClipPlayer:{className:'SoeClipPlayerView'}}},
 });
});
test('actual app source registers new-architecture package and only network-state permission (STATIC)',()=>{
 const files=capture(),main=read(android+'app/src/main/java/com/anonymous/soesyntheticdemo/MainApplication.kt'),manifest=read(android+'app/src/main/AndroidManifest.xml');
 assert.match(main,/PackageList\(this\)\.packages\.apply\s*\{\s*add\(SoeMemberPackage\(\)\)/);
 assert.match(main,/if \(BuildConfig\.SOE_EMBEDDED_SYNTHETIC\) SyntheticHttpPolicy\.install\(\)/);
 assert.match(files.registration,/class SoeMemberPackage : BaseReactPackage/);assert.match(files.registration,/isTurboModule = true/);
 assert.match(files.module,/: NativeSoeMemberSpec\(context\)/);assert.match(files.module,/const val NAME = "NativeSoeMember"/);
 const permissions=[...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(permissions,['android.permission.INTERNET','android.permission.ACCESS_NETWORK_STATE']);assert(manifest.includes('android:allowBackup="false"'));
});
test('actual dedicated transport contains epoch/single-use/pre-send/deadline and second-exchange fences (STATIC, not HTTP execution)',()=>{
 const {transport:s}=capture();
 for(const required of ['.followRedirects(false)','.followSslRedirects(false)','.retryOnConnectionFailure(false)',
  '.authenticator(Authenticator.NONE)','.proxyAuthenticator(Authenticator.NONE)','.cookieJar(CookieJar.NO_COOKIES)','.cache(null)',
  'transmission.sent.compareAndSet(false, true)','store.withGeneration(generation)','!handle.consumed','handle.consumed = true',
  'deadlineNanoTime(handle.deadline)','require(System.nanoTime() < handle.deadline)','handle.call?.cancel()',
  'MAX_RESPONSE = 1048576','size <= 16384','output.size() + count <= MAX_RESPONSE','it.code !in 300..399','url.origin']) {
  // origin is assembled explicitly rather than provided by OkHttp's URL type.
  if(required==='url.origin')assert(s.includes('origin == config.origin'));else assert(s.includes(required),required);
 }
 assert(s.indexOf('transmission.sent.compareAndSet(false, true)')<s.indexOf('chain.proceed(chain.request())'));
 assert(s.indexOf('handle.consumed = true')<s.indexOf('call.enqueue('));
 assert(s.indexOf('require(System.nanoTime() < handle.deadline)')<s.indexOf('call.enqueue('));
 assert(!s.includes('OkHttpClientProvider'));assert(!s.includes('.followRedirects(true)'));
});
test('foreground epoch guards queued work, HTTP admission and reply delivery (STATIC)',()=>{
 const {module,transport}=capture(),lifecycle=read(member+'EmailLinkSession.kt'),entries=module.split('\n');
 for(const lane of ['begin','send','sendReview','sendCircleReview','sendAuth','sendPublic','sendEmailAuth']){
  const entry=entries.find(line=>line.includes('override fun '+lane+'('));
  assert(entry?.includes('= onlineWork(promise)'),lane+' must be fenced before queueing');
 }
 const localReset=entries.find(line=>line.includes('override fun resetAccountStorage('));
 assert(localReset?.includes('= work(promise)'),'Account clearing must remain local and available offline');
 assert.match(module,/transport\(\)\.begin\(generation, epoch\)/);
 assert.match(transport,/Handle\(generation, epoch,/);
 assert.match(transport,/requireCurrent\(handle\.epoch\)\s+\/\/[^\n]+\s+handle\.consumed = true/);
 assert.match(transport,/tag\(Transmission::class\.java, Transmission\(handle\.epoch\)\)/);
 assert.match(transport,/connectivity\.withOnline \{\s+EmailLinkLifecycle\.withCurrent\(transmission\.epoch\) \{\s+transmission\.sent\.compareAndSet\(false, true\)/);
 assert.match(transport,/connectivity\.withOnline \{\s+EmailLinkLifecycle\.withCurrent\(handle\.epoch\) \{\s+store\.withGeneration\(generation\) \{\s+synchronized\(lock\) \{[^}]*finish\(id\); success\(result\)/);
 assert.match(lifecycle,/fun background\(\) = retire\(loseForeground = true\)/);
 assert.match(lifecycle,/fun retireConnectivity\(\) = retire\(loseForeground = false\)/);
 assert.match(transport,/onRetirement \{ cutoff -> cancelAll\(beforeEpoch = cutoff\) \}/);
 assert.match(transport,/it\.epoch < beforeEpoch/);
 assert.match(transport,/offActivity\(\)/);
});
test('store confirms disk writes and closes old access before a reset can acknowledge clear (STATIC)',()=>{
 const {store:s,module}=capture();
 function inOrder(source,...steps){
  let offset=0;
  for(const step of steps){
   const index=source.indexOf(step,offset);
   assert(index>=offset,`Missing or out of order: ${step}`);
   offset=index+step.length;
  }
 }
 const section=(start,end)=>s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)+start.length));
 inOrder(section('@Synchronized fun reset(','private fun retireRecord'),
  'retireRecord()', 'atomicWrite(marker,', 'persist(empty)', 'clearResetMarker()', 'record = empty', 'previous to next');
 inOrder(section('private fun retireRecord','private fun clearResetMarker'),'record = null','retirements.toList()');
 inOrder(section('private fun clearResetMarker','private fun key'),
  'marker.delete()', 'check(!marker.baseFile.exists() && !hasPendingWrite(marker))', 'syncDirectory(directory)');
 inOrder(section('private fun atomicWrite','private fun hasPendingWrite'),
  'file.startWrite()', 'stream.write(bytes)', 'stream.fd.sync()', 'file.failWrite(stream)',
  'file.finishWrite(stream)', 'check(!hasPendingWrite(file))', 'check(readBounded(file, bytes.size).contentEquals(bytes))',
  'syncDirectory(directory)', 'if (record != null) retireRecord()', 'throw error');
 inOrder(section('private fun syncDirectory','private fun readBounded'),'Os.open(', 'Os.fsync(descriptor)', 'Os.close(descriptor)');
 inOrder(section('init {','private fun unlocked'), 'marker.baseFile.exists()', 'persist(empty)', 'clearResetMarker()', 'record = empty', 'decode(readBounded(data');
 inOrder(module.slice(module.indexOf('override fun resetAccountStorage')), 'store.reset(expectedGeneration)', 'putBoolean("cleared", true)');
 for(const required of ['context.noBackupFilesDir','"AndroidKeyStore"','"AES/GCM/NoPadding"','setRandomizedEncryptionRequired(true)',
  'cipher.updateAAD(config.namespace','@Synchronized fun <T> withGeneration','@Synchronized fun open',
  'UserManager::class.java)?.isUserUnlocked == true','KeyguardManager::class.java)?.isDeviceLocked == false'])assert(s.includes(required),required);
 assert(!s.includes('SharedPreferences'));assert(!s.includes('Log.'));
});
test('actual connectivity and module lifecycle source preserves register-before-sample, event and cleanup ordering (STATIC)',()=>{
 const {connectivity:s,module}=capture();
 assert(s.indexOf('val before = synchronized(lock) { sequence }')<s.indexOf('manager.registerDefaultNetworkCallback(callback)'));
 assert(s.indexOf('manager.registerDefaultNetworkCallback(callback)')<s.indexOf('val network = manager.activeNetwork'));
 assert(s.includes('sequence == before'));assert(s.includes('current != network'));assert(s.includes('NET_CAPABILITY_INTERNET'));assert(s.includes('NET_CAPABILITY_VALIDATED'));
 assert(s.includes('retired = true; state = "unknown"'));assert(s.includes('manager?.unregisterNetworkCallback(callback)'));
 for(const required of ['closed.compareAndSet(false, true)','connectivity.close()','transport?.close()','pending.toList()','worker.shutdownNow()'])assert(module.includes(required),required);
 assert.match(module,/transportValue = null\s+detached\s+\}\s+email\?\.retire\(\)\s+transport\?\.close\(\)/);
 assert(!module.includes('intent.'));assert(!module.includes('System.getenv'));assert(!module.includes('Log.'));
});
