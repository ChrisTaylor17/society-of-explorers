// Adapter tests execute canonical TypeScript with an explicit native double.
// Kotlin/manifest checks are source-policy assertions, NOT Android execution,
// Codegen, compilation, Keystore, callback delivery, or provider acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {sourceLoader} from './load-source.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const native='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/';
function read(path){const full=root+path,s=fs.lstatSync(full);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Only materialized regular source');return fs.readFileSync(full,'utf8');}
const session=()=>read(native+'member/EmailLinkSession.kt');
const moduleSource=()=>read(native+'member/NativeSoeMemberModule.kt');
const transport=()=>read(native+'member/MemberTransport.kt');
const methods=['prepareEmailLink','pendingEmailLink','claimEmailLink','discardEmailLink','sendEmailAuth'];
const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',flow='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function adapter(withEmail){
 const calls=[];
 const nativeModule={capabilities:async()=>({version:2}),begin:async()=> 'native-handle',send:async()=>({}),cancel:async()=>{},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>({}),getConnectivitySnapshot:()=> 'online',onConnectivityChange:()=>({remove(){}})};
 if(withEmail)for(const name of methods)nativeModule[name]=async function(...args){assert.equal(this,nativeModule);calls.push([name,...args]);return{name};};
 const load=sourceLoader({'react-native':{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>nativeModule}}});
 return{calls,nativeModule,bridge:load('platforms/native/src/circles/android-member.ts').createAndroidMemberAdapter(nativeModule).bridge};
}

test('actual Android adapter leaves older modules without any email authority',()=>{
 const f=adapter(false);for(const method of methods)assert.equal(f.bridge[method],undefined);assert.deepEqual(f.calls,[]);
});
test('actual Android adapter forwards typed email methods with exact receiver, generation, flow and request',async()=>{
 const f=adapter(true),request={flowId:flow,url:'https://provider.invalid/auth/v1/user',method:'PUT',bearer:'NONISSUED',body:'SYNTHETIC_BODY'};
 await f.bridge.prepareEmailLink(generation,'recovery','synthetic@example.invalid');
 await f.bridge.pendingEmailLink(generation);await f.bridge.claimEmailLink(generation,flow);await f.bridge.discardEmailLink(generation,flow);await f.bridge.sendEmailAuth('native-handle',request);
 assert.deepEqual(f.calls,[['prepareEmailLink',generation,'recovery','synthetic@example.invalid'],['pendingEmailLink',generation],['claimEmailLink',generation,flow],['discardEmailLink',generation,flow],['sendEmailAuth','native-handle',request]]);
});
test('STATIC: installed-variant callback is exact and cold/warm intents are scrubbed before React delivery',()=>{
 const config=read(native+'member/MemberConfig.kt'),activity=read(native+'MainActivity.kt'),manifest=read('platforms/native/android/app/src/main/AndroidManifest.xml');
 assert.match(config,/BuildConfig\.APPLICATION_ID \+ "\.email:\/\/auth\/callback"/);
 assert.match(manifest,/android:scheme="\$\{applicationId\}\.email" android:host="auth" android:path="\/callback"/);
 assert.doesNotMatch(manifest,/autoVerify="true"/);
 const cold=activity.slice(activity.indexOf('override fun onCreate'),activity.indexOf('override fun onPause'));
 assert(cold.indexOf('intent?.data = null')<cold.indexOf('super.onCreate'));assert(cold.indexOf('intent?.clipData = null')<cold.indexOf('super.onCreate'));assert(cold.indexOf('EmailLinkLifecycle.capture')<cold.indexOf('super.onCreate'));
 assert.match(activity,/Intent\(incoming\)\.apply \{ data = null; clipData = null \}/);assert.match(activity,/setIntent\(sanitized\)\s+super\.onNewIntent\(sanitized\)/);
 const capture=session().slice(session().indexOf('  fun capture(raw:'),session().indexOf('  /** Validation'));
 for(const guard of ['uri.rawAuthority == "auth"','uri.rawPath == "/callback"','uri.rawFragment == null','!fields.containsKey(pair[0])','value.flowId != flow || !value.started || value.phase != "waiting"'])assert(capture.includes(guard));
 assert.doesNotMatch(capture,/transmit\(|enqueue\(|sendAuth\(|sendEmailAuth\(|Log\./);
});
test('STATIC: native S256 and reserved protected pending record cannot be read through generic account slots',()=>{
 const s=session(),store=read(native+'member/MemberSecureStore.kt'),config=read(native+'member/MemberConfig.kt');
 assert.match(s,/ByteArray\(32\)\.also \{ SecureRandom\(\)\.nextBytes\(it\) \}/);assert.match(s,/MessageDigest\.getInstance\("SHA-256"\)/);assert.match(s,/Base64\.URL_SAFE or Base64\.NO_WRAP or Base64\.NO_PADDING/);assert.doesNotMatch(s,/Math\.random|grant_type=refresh_token/);
 assert.match(store,/private const val EMAIL_SLOT = "email-link-v1"/);assert.match(config,/value in setOf\("session", "pkce", "user"\)/);assert.match(store,/value\.toByteArray\(Charsets\.UTF_8\)\.size <= 8192/);
 assert.match(store,/Cipher\.getInstance\("AES\/GCM\/NoPadding"\)/);assert.match(store,/context\.noBackupFilesDir/);assert.match(store,/val empty = Record\(next, mutableMapOf\(\)\)/);
 const metadata=s.slice(s.indexOf('fun metadata()'),s.indexOf('fun encode()'));assert.doesNotMatch(metadata,/"verifier"|"code"|"bearer"|"password"/);
});
test('STATIC: one-use durable claim erases secrets before return and retains only bounded memory authority',()=>{
 const s=session(),claim=s.slice(s.indexOf('  fun claim('),s.indexOf('  fun discard('));
 assert(claim.indexOf('store.emailWrite(generation, null)')<claim.indexOf('claim = scope'));assert(claim.indexOf('store.emailWrite(generation, null)')<claim.indexOf('"code" to'));
 assert.match(s,/private const val TTL = 3600000L/);assert.match(s,/private const val CODE_TTL = 300000L/);assert.match(claim,/minOf\(value\.expiresAt, value\.receivedAt!! \+ CODE_TTL\)/);
 assert.match(s,/claimExpiry = timer\.schedule/);assert.match(s,/if \(claim === scope\) clearLocked\(\)/);
 const discard=s.slice(s.indexOf('  fun discard('),s.indexOf('  fun capture(raw:'));
 assert.match(discard,/matchesPending \|\| claim\?\.pending\?\.flowId == flowId/);assert.doesNotMatch(discard,/requireCurrent/);
});
test('STATIC: lifecycle epoch is captured before FIFO work and background retires memory without erasing pending',()=>{
 const s=session(),m=moduleSource(),activity=read(native+'MainActivity.kt');
 const helper=m.slice(m.indexOf('  private fun emailWork'),m.indexOf('  override fun getName'));
 assert(helper.indexOf('EmailLinkLifecycle.stamp()')<helper.indexOf('work(promise)'));assert.match(helper,/EmailLinkLifecycle\.withCurrent\(epoch\)/);assert.match(m,/ThreadPoolExecutor\(1, 1/);
 assert(helper.indexOf('check(connectivity.snapshot() == "online")')<helper.indexOf('EmailLinkLifecycle.stamp()'));
 assert.match(helper,/connectivity\.withOnline \{ EmailLinkLifecycle\.withCurrent\(epoch\)/);
 const connectivity=read(native+'member/MemberConnectivity.kt');assert.match(connectivity,/fun <T> withOnline\(work: \(\) -> T\): T = synchronized\(lock\) \{\s+check\(!retired && registered && state == "online"\); work\(\)/);
 assert.match(activity,/override fun onPause\(\) \{\s+EmailLinkLifecycle\.background\(\)/);assert.match(activity,/EmailLinkLifecycle\.foreground\(\)/);
 const background=s.slice(s.indexOf('  fun background()'),s.indexOf('  @Synchronized internal fun stamp'));assert.match(background,/active = false; epoch\.incrementAndGet\(\)/);assert.match(background,/EmailLinkSession\.retireAll\(\)/);assert.match(s,/@Synchronized internal fun stamp/);assert.doesNotMatch(background,/emailWrite/);
 assert.match(m,/if \(state != "online"\) EmailLinkLifecycle\.retireConnectivity\(\)/);
 const offline=s.slice(s.indexOf('  fun retireConnectivity()'),s.indexOf('  @Synchronized internal fun stamp'));
 assert.match(offline,/synchronized\(this\) \{ epoch\.incrementAndGet\(\) \}/);assert.match(offline,/EmailLinkSession\.retireAll\(\)/);assert.doesNotMatch(offline,/emailWrite/);
 assert.match(s,/store\.onRetirement \{ retire\(\) \}/);
});
test('STATIC: strict email lane cannot expand ordinary member or password allowlists',()=>{
 const s=session(),t=transport(),m=moduleSource();
 const ordinary=t.slice(t.indexOf('  private fun validateAuth('),t.indexOf('  private fun authText'));
 assert.doesNotMatch(ordinary,/signup|resend|recover|grant_type=pkce|"PUT"/);
 const member=t.slice(t.indexOf('  private fun validate(input:'),t.indexOf('  private fun validateProfileBody'));
 assert.doesNotMatch(member,/auth\/v1/);
 for(const value of ['/auth/v1/signup','/auth/v1/resend','/auth/v1/recover','/auth/v1/token?grant_type=pkce'])assert(s.includes(value));
 assert.match(s,/url\.toString\(\) == input\.url/);assert.match(s,/url\.encodedQuery == "redirect_to=" \+ URLEncoder\.encode\(value\.redirectTo, "UTF-8"\)/);assert.match(s,/family !in scope\.used/);assert.match(s,/scope\.used\.add\(family\)/);
 assert.match(m,/putString\("emailAuthPolicy", "supabase-email-pkce-v1"\)/);for(const method of methods)assert(m.includes('override fun '+method+'('));
});
test('STATIC: native requests use strict bounded canonical bodies and purpose-bound exact-token proof',()=>{
 const s=session();
 assert.match(s,/size <= 16384/);assert.match(s,/input\.body == canonicalBody\(body, order\)/);assert.match(s,/canonicalBody\(body, listOf\("auth_code", "code_verifier"\)\)/);assert.match(s,/canonicalBody\(body, listOf\("password", "code_challenge", "code_challenge_method"\)\)/);
 assert.match(s,/body\.get\("type"\) == "signup"/);assert.match(s,/value\.started = true; store\.emailWrite/);assert.match(s,/input\.bearer == scope\.bearer/);assert.match(s,/scope\.pending\.purpose == "recovery" && scope\.verified/);
 assert.match(s,/"recovery" else "email\/signup"/);assert.match(s,/claims\.get\("sub"\) == subject/);assert.match(s,/user\.get\("id"\) == scope\.subject/);assert.match(s,/scope\.expiresAt > System\.currentTimeMillis\(\) \+ 120000/);
});
test('STATIC: email requests reuse generation, deadline, single physical transmission and cookie-free cancellation engine',()=>{
 const t=transport();
 const send=t.slice(t.indexOf('  fun sendEmailAuth('),t.indexOf('  private fun transmit'));
 assert.match(send,/handles\[id\]\?\.generation/);assert.match(send,/session\.dispatch/);assert.match(send,/session\.receive/);assert.match(send,/session\.failed/);assert.match(send,/transmit\(id/);assert.doesNotMatch(send,/newCall/);
 for(const text of ['followRedirects(false)','followSslRedirects(false)','retryOnConnectionFailure(false)','CookieJar.NO_COOKIES','transmission.sent.compareAndSet(false, true)','!handle.consumed','handle.consumed = true','System.nanoTime() < handle.deadline','MAX_RESPONSE = 1048576'])assert(t.includes(text));
 assert.match(t,/else if \(method == "PUT"\) builder\.put/);assert.match(t,/handle\.call\?\.cancel\(\)/);
});
