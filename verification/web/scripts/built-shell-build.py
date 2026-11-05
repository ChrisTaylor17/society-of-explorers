# Existing guarded build procedure with a bounded 360-second cold-cache deadline.
from pathlib import Path
import subprocess,os,json,time,signal,hashlib,sys,re
ROOT=Path(__file__).resolve().parents[1];APP=ROOT.parents[1]
prefix_args=[arg.split('=',1)[1] for arg in sys.argv[1:] if arg.startswith('--evidence-prefix=')]
assert len(prefix_args)==1, 'Supply one fresh evidence prefix'
prefix=prefix_args[0]
assert re.fullmatch(r'built-shell-[a-z0-9-]{1,48}-',prefix), 'Use a fresh built-shell-prefixed name ending in a hyphen'
assert not any((ROOT/('evidence/'+prefix+name)).exists() for name in ['build-source-sha256.json','next-build.log','next-build.json']), 'Preserve previous build evidence; choose a new prefix'
def materialized_bytes(file):
 info=file.stat()
 if info.st_size and not info.st_blocks:
  raise RuntimeError(f'Refusing to materialize source placeholder: {file}')
 return file.read_bytes()
def source_snapshot():
 result={}
 directories=['app','components','lib','public','content','styles','platforms/quest','platforms/shared','platforms/native/src/circles']
 for name in directories:
  folder=APP/name
  if not folder.exists():continue
  for base,dirs,files in os.walk(folder,followlinks=False):
   dirs[:]=[d for d in dirs if d not in ['node_modules','.next','.git','__pycache__'] and not (Path(base)/d).is_symlink()]
   for filename in files:
    file=Path(base)/filename
    if not file.is_symlink():result[str(file.relative_to(APP))]=hashlib.sha256(materialized_bytes(file)).hexdigest()
 for name in ['package.json','package-lock.json','next.config.ts','proxy.ts','tsconfig.json','postcss.config.mjs']:
  file=APP/name
  if file.exists():result[name]=hashlib.sha256(materialized_bytes(file)).hexdigest()
 return dict(sorted(result.items()))

before=source_snapshot()
(ROOT/('evidence/'+prefix+'build-source-sha256.json')).write_text(json.dumps(before,indent=2)+'\n')
assert not any((APP/name).exists() for name in ['.env','.env.local','.env.production','.env.production.local']), 'Runtime dotenv must not enter an offline build'
env={k:os.environ[k] for k in ['PATH','HOME','USER','SHELL','TMPDIR','LANG','LC_ALL'] if k in os.environ}
env.update({'CI':'1','NEXT_TELEMETRY_DISABLED':'1','NODE_OPTIONS':'--require '+str(ROOT/'scripts/deny-build-network.cjs'),'NO_COLOR':'1'})
webpack='--webpack' in sys.argv
fixture='--fixture-public-config' in sys.argv
if fixture:env.update({'NEXT_PUBLIC_SUPABASE_URL':'https://offline.invalid','NEXT_PUBLIC_SUPABASE_ANON_KEY':'OFFLINE_PUBLIC_BUILD_PLACEHOLDER_NOT_A_CREDENTIAL'})
args=['node','node_modules/next/dist/bin/next','build']+(['--webpack'] if webpack else []);start=time.time()
print(json.dumps({'stage':'locked-offline-build','externalNetworkBlocked':True,'providerCredentialsNotPassed':True}),flush=True)
p=subprocess.Popen(args,cwd=APP,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
try:output=p.communicate(timeout=360)[0];status='completed'
except subprocess.TimeoutExpired:
 os.killpg(p.pid,signal.SIGTERM)
 try:output=p.communicate(timeout=5)[0]
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);output=p.communicate()[0]
 status='owned_build_timed_out_and_terminated'
(ROOT/('evidence/'+prefix+'next-build.log')).write_text(output)
after=source_snapshot()
source_changed=before!=after
if source_changed:status='source_changed_during_build'

report={'argv':args,'cwd':str(APP),'status':status,'exitCode':p.returncode,'seconds':round(time.time()-start,2),'externalNetworkBlocked':True,'providerCredentialsNotPassed':True,'compiler':'webpack' if webpack else 'turbopack','publicBuildConfig':'invalid offline placeholders' if fixture else 'not supplied','privateOrIssuedCredentialsSupplied':False,'deploymentOrServerLaunch':False,'sourceFiles':len(before),'sourceSha256':hashlib.sha256(json.dumps(before,separators=(',',':')).encode()).hexdigest(),'sourceUnchangedDuringBuild':not source_changed,'log':'evidence/'+prefix+'next-build.log'}
(ROOT/('evidence/'+prefix+'next-build.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)

raise SystemExit(0 if status == "completed" and p.returncode == 0 else 1)
