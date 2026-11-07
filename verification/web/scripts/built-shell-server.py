"""Serve the existing build for coordinated local browser baselines only."""
from pathlib import Path
import argparse, hashlib, json, os, re, signal, socket, stat, subprocess, time, urllib.request

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / 'verification/web/evidence'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--build-prefix', required=True)
parser.add_argument('--evidence-prefix', required=True)
parser.add_argument('--port', required=True, type=int)
parser.add_argument('--member-public-fixture', action='store_true')
options = parser.parse_args()
for prefix in [options.build_prefix, options.evidence_prefix]:
    assert re.fullmatch(r'built-shell-[a-z0-9-]{1,48}-', prefix), 'Use a fresh built-shell-prefixed name ending in a hyphen'
PORT = options.port
assert 1024 <= PORT <= 65535
ORIGIN = f'http://127.0.0.1:{PORT}'
RECEIPT = EVIDENCE / (options.evidence_prefix + 'server.json')
GUARD = ROOT / 'verification/web/scripts/built-shell-network-guard.cjs'
RUNTIME = EVIDENCE / (options.evidence_prefix + 'server-runtime.json')
LOG = EVIDENCE / (options.evidence_prefix + 'server.log')
READY = EVIDENCE / (options.evidence_prefix + 'server-ready.json')
assert all(not name.exists() for name in [RECEIPT, RUNTIME, LOG, READY]), 'Preserve existing server evidence; use a new prefix'
def read(name):
    p = Path(name); p = p if p.is_absolute() else ROOT / p
    s = p.lstat()
    assert stat.S_ISREG(s.st_mode) and (s.st_blocks or not s.st_size), 'Unavailable resident leaf: ' + str(p)
    return p.read_bytes()
def digest(name): return hashlib.sha256(read(name)).hexdigest()
def save(): RECEIPT.write_text(json.dumps(report, indent=2) + '\n')
build_name = 'verification/web/evidence/' + options.build_prefix + 'next-build.json'
source_name = 'verification/web/evidence/' + options.build_prefix + 'build-source-sha256.json'
build = json.loads(read(build_name)); sources = json.loads(read(source_name))
assert build['status'] == 'completed' and build['exitCode'] == 0 and build['sourceUnchangedDuringBuild']
expected_config = 'nonissued member browser fixture' if options.member_public_fixture else 'invalid offline placeholders'
assert build['publicBuildConfig'] == expected_config and not build['privateOrIssuedCredentialsSupplied']
assert len(sources) == build['sourceFiles'] and sources
assert hashlib.sha256(json.dumps(sources, separators=(',', ':')).encode()).hexdigest() == build['sourceSha256']
def current_sources():
    found = {}
    for name in ['app', 'components', 'lib', 'public', 'content', 'styles', 'scripts', 'platforms/quest', 'platforms/shared', 'platforms/native/src/circles']:
        folder = ROOT / name
        if not folder.exists(): continue
        for base, dirs, files in os.walk(folder, followlinks=False):
            dirs[:] = [d for d in dirs if d not in ['node_modules', '.next', '.git', '__pycache__'] and not (Path(base) / d).is_symlink()]
            for filename in files:
                file = Path(base) / filename
                if not file.is_symlink(): found[str(file.relative_to(ROOT))] = digest(file)
    for name in ['package.json', 'package-lock.json', 'next.config.ts', 'proxy.ts', 'tsconfig.json', 'postcss.config.mjs']:
        if (ROOT / name).exists(): found[name] = digest(name)
    for file in ROOT.glob('*.d.ts'):
        if file.name == 'next-env.d.ts': continue
        assert not file.is_symlink(), 'Linked root type declaration'
        found[file.name] = digest(file)
    return dict(sorted(found.items()))
assert current_sources() == sources, 'Current source differs from built source, including added/removed files'
for name in ['.env', '.env.local', '.env.production', '.env.production.local']:
    assert not (ROOT / name).exists(), 'Runtime dotenv is not authorized'
inputs = {name: digest(name) for name in [build_name, source_name, 'verification/web/scripts/build-offline.py', 'verification/web/scripts/built-shell-build.py', 'verification/web/scripts/deny-build-network.cjs', 'verification/web/scripts/built-shell-server.py', 'verification/web/scripts/built-shell-network-guard.cjs', 'verification/web/scripts/built-shell-guard-check.cjs', 'verification/web/evidence/built-shell-guard-check.json', 'node_modules/next/package.json', 'node_modules/next/dist/bin/next', 'node_modules/next/dist/cli/next-start.js', 'node_modules/next/dist/server/lib/start-server.js']}
built = {}
for base, dirs, files in os.walk(ROOT / '.next', followlinks=False):
    dirs[:] = [name for name in dirs if name not in ['cache', 'types', 'diagnostics']]
    for name in dirs: assert not (Path(base) / name).is_symlink(), 'Linked build directory'
    for name in files:
        file = Path(base) / name
        if file.parent == ROOT / '.next' and name in ['trace', 'trace-build']: continue
        relative = str(file.relative_to(ROOT)); built[relative] = digest(file)
assert '.next/BUILD_ID' in built and '.next/required-server-files.json' in built
with socket.socket() as probe: probe.bind(('127.0.0.1', PORT))
report = {'status': 'STARTING', 'origin': ORIGIN, 'port': PORT, 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'wrapperPid': os.getpid(), 'buildId': read('.next/BUILD_ID').decode().strip(), 'buildReceipt': build_name, 'publicBuildConfig': expected_config, 'sourceHashes': sources, 'inputHashes': inputs, 'builtHashes': built, 'excludedNonRuntimeBuildPaths': ['.next/cache', '.next/types', '.next/diagnostics', '.next/trace', '.next/trace-build'], 'runtimeReceipt': str(RUNTIME.relative_to(ROOT)), 'serverLog': str(LOG.relative_to(ROOT)), 'scope': 'Actual existing Next build. Clean environment, invalid public configuration, Node external-network denial with only this exact HTTP loopback listener/client allowed. Not an OS firewall. Browser tests must separately deny non-loopback traffic. No database/provider/issued credentials or deployment.', 'cleanup': 'pending'}
save()
env = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin', 'HOME': '/Users/christaylor', 'CI': '1', 'NODE_ENV': 'production', 'NEXT_TELEMETRY_DISABLED': '1', 'NO_COLOR': '1', 'SOE_BUILT_SHELL_PORT': str(PORT), 'SOE_BUILT_SHELL_RUNTIME_RECEIPT': str(RUNTIME), 'NEXT_PUBLIC_SUPABASE_URL': 'https://offline.invalid', 'NEXT_PUBLIC_SUPABASE_ANON_KEY': 'OFFLINE_PUBLIC_BUILD_PLACEHOLDER_NOT_A_CREDENTIAL'}
child = None; stopping = False
def stop(signum, frame):
    global stopping
    stopping = True
    if child and child.poll() is None: child.terminate()
signal.signal(signal.SIGTERM, stop); signal.signal(signal.SIGINT, stop)
try:
    with LOG.open('w') as output:
        child = subprocess.Popen(['node', '--require', str(GUARD), 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', str(PORT)], cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT)
        report['serverPid'] = child.pid; save()
        for attempt in range(100):
            if child.poll() is not None: raise RuntimeError('Owned Next process exited before ready; inspect its bounded log')
            try:
                with urllib.request.urlopen(ORIGIN + '/circles/message-ai-policy', timeout=1) as response:
                    body = response.read(); assert response.status == 200 and b'Optional AI review of your message' in body
                    report['health'] = {'path': '/circles/message-ai-policy', 'status': response.status, 'bodySha256': hashlib.sha256(body).hexdigest()}; break
            except (OSError, TimeoutError): time.sleep(.1)
        else: raise RuntimeError('Owned Next server did not become ready')
        child.send_signal(signal.SIGUSR2)
        for attempt in range(50):
            if RUNTIME.exists():
                runtime = json.loads(read(RUNTIME))
                if runtime['pid'] == child.pid: break
            time.sleep(.05)
        else: raise RuntimeError('Guard runtime receipt was not observed')
        report['status'] = 'READY'; report['initialRuntimeHashes'] = runtime['runtimeHashes']; report['initialDeniedOperations'] = runtime['denied']; save()
        READY.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'status': 'READY', 'origin': ORIGIN, 'serverPid': child.pid, 'wrapperPid': os.getpid(), 'builtFiles': len(built), 'sourceFiles': len(sources), 'receipt': str(RECEIPT.relative_to(ROOT)), 'immutableReadyReceipt': str(READY.relative_to(ROOT))}), flush=True)
        while child.poll() is None and not stopping: time.sleep(.25)
        if not stopping: raise RuntimeError('Owned Next process stopped unexpectedly')
except Exception as error:
    report['status'] = 'FAIL'; report['failure'] = str(error); raise
finally:
    if child and child.poll() is None:
        child.terminate()
        try: child.wait(timeout=5)
        except subprocess.TimeoutExpired: child.kill(); child.wait(timeout=5)
    report['cleanup'] = 'owned-process-stopped'; report['serverExitCode'] = child.returncode if child else None
    final_sources = current_sources()
    report['sourceMismatches'] = [name for name in set(sources) | set(final_sources) if sources.get(name) != final_sources.get(name)]
    report['builtMismatches'] = [name for name, sha in built.items() if digest(name) != sha]
    report['inputMismatches'] = [name for name, sha in inputs.items() if digest(name) != sha]
    if RUNTIME.exists():
        runtime = json.loads(read(RUNTIME)); report['finalRuntimeHashes'] = runtime['runtimeHashes']; report['deniedOperations'] = runtime['denied']
        report['runtimeMismatches'] = [name for name, sha in runtime['runtimeHashes'].items() if digest(name) != sha]
    else: report['runtimeMismatches'] = ['missing runtime receipt']
    if report['status'] != 'FAIL': report['status'] = 'STOPPED' if not any(report[key] for key in ['sourceMismatches', 'builtMismatches', 'inputMismatches', 'runtimeMismatches']) else 'FAIL'
    report['completedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()); save()
