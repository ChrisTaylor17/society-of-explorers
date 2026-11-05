"""Scoped source checks. The adapter fixture substitutes RN names, not Codegen."""
from pathlib import Path
import datetime
import hashlib
import json
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[3]
ENV = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin', 'HOME': '/Users/christaylor', 'GIT_OPTIONAL_LOCKS': '0'}
PREFIX = 'verification/web/evidence/native-email-auth-'


def read(name):
    path = Path(name) if Path(name).is_absolute() else ROOT / name
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode) and (not info.st_size or info.st_blocks), name
    return path.read_bytes()


def digest(name):
    return hashlib.sha256(read(name)).hexdigest()


names = set()
for proof in ['native-email-auth-unit.json', 'native-email-auth-browser.json', 'native-email-bridge-policy.json']:
    value = json.loads(read('verification/web/evidence/' + proof))
    assert value['status'] == 'PASS'
    names.update(value.get('sourceHashes', {}))
    names.update(value.get('selectedInputHashes', {}))
names.update(['platforms/native/OwnedAccountScreen.tsx', 'platforms/native/NativeEmailAccountForm.tsx',
              'platforms/native/src/auth/android-owned-account.ts', 'platforms/native/src/circles/android-member.ts',
              'platforms/native/specs/NativeSoeMember.ts', 'platforms/tests/native-email-adapter-types.d.ts',
              'platforms/tests/tsconfig.native-email-adapter.json', 'platforms/tsconfig.portable.json',
              'tsconfig.json', 'verification/web/scripts/verify-native-email-auth-static.py',
              'verification/web/scripts/deny-build-network.cjs'])
before = {name: digest(name) for name in sorted(names)}
node = '/opt/homebrew/bin/node'
guard = ['--require', './verification/web/scripts/deny-build-network.cjs']
tsc = 'node_modules/typescript/bin/tsc'
eslint = 'node_modules/eslint/bin/eslint.js'
runtime_names = [str(Path(node).resolve()), tsc, 'node_modules/typescript/lib/_tsc.js', eslint]
runtimes = {name: digest(name) for name in runtime_names}
changed = subprocess.check_output(['git', 'diff', '--name-only', '9b9435f9bbe9b7c2571b61b306ff6bf9af39bdb1'], cwd=ROOT, env=ENV).decode().splitlines()
changed += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=ROOT, env=ENV).decode().splitlines()
lint_files = sorted({name for name in changed if name.endswith(('.ts', '.tsx', '.mjs'))})
checks = []
commands = [
    ('web-types', [node, *guard, tsc, '--noEmit', '--incremental', 'false']),
    ('portable-types', [node, *guard, tsc, '--project', 'platforms/tsconfig.portable.json', '--noEmit']),
    ('adapter-types', [node, *guard, tsc, '--project', 'platforms/tests/tsconfig.native-email-adapter.json', '--noEmit']),
    ('lint', [node, *guard, eslint, *lint_files]),
]
for label, command in commands:
    result = subprocess.run(command, cwd=ROOT, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
    log = PREFIX + label + '.log'
    (ROOT / log).write_bytes(result.stdout)
    checks.append({'name': label, 'command': command, 'exitCode': result.returncode, 'log': log, 'logSha256': digest(log)})
    print(label, result.returncode, flush=True)
    if result.returncode:
        print(result.stdout.decode()[-4000:], flush=True)
        break
assert {name: digest(name) for name in before} == before, 'Source changed during checks'
assert {name: digest(name) for name in runtimes} == runtimes, 'Direct compiler/runtime inputs changed'
receipt = {
    'status': 'PASS' if len(checks) == 4 and all(check['exitCode'] == 0 for check in checks) else 'FAIL',
    'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'checks': checks,
    'sourceHashes': before, 'runtimeHashes': runtimes, 'sourceUnchanged': True,
    'scope': 'Full web types, portable controller types, narrow adapter-to-Spec types with explicit RN name substitutes, and changed TS/TSX/MJS lint.',
    'limits': ['RN fixture is not actual React Native types, Codegen, Kotlin, Hermes or native compilation.',
               'No new web production build: this milestone changes native product source only.',
               'Source bindings cover the selected proof union; direct compiler entrypoints are bound, not the complete static checker dependency graph.'],
}
(ROOT / (PREFIX + 'static.json')).write_text(json.dumps(receipt, indent=2) + '\n')
assert receipt['status'] == 'PASS'
