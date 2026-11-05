"""Record current local proofs without rerunning or upgrading their scope."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = 'docs/integration/source-reader-verification.json'
BASE = '5006dfba8d7dd2853d8a19aaf855eb663c897a54'
ENV = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin', 'HOME': '/Users/christaylor', 'GIT_OPTIONAL_LOCKS': '0'}
memo = {}


def read(name):
    path = Path(name) if Path(name).is_absolute() else ROOT / name
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode) and (not info.st_size or info.st_blocks), f'Refuse linked/offloaded input: {path}'
    return path.read_bytes()


def digest(name):
    if name not in memo:
        memo[name] = hashlib.sha256(read(name)).hexdigest()
    return memo[name]


def document(name):
    return json.loads(read(name))


def git(*args, cwd=ROOT):
    return subprocess.check_output(['git', *args], cwd=cwd, env=ENV)


source, runtime, evidence = {}, {}, {}


def bind(name, expected=None):
    actual = digest(name)
    assert expected is None or actual == expected, f'Source/evidence changed: {name}'
    table = runtime if Path(name).is_absolute() or name.startswith('node_modules/') else source
    assert name not in table or table[name] == actual
    table[name] = actual


proof_names = [
    'verification/web/evidence/source-reader-backend.json',
    'verification/web/evidence/source-reader-fidelity-browser.json',
    'platforms/evidence/native-source-reader-policy.json',
    'verification/web/evidence/native-source-reading-browser.json',
    'verification/web/evidence/native-reading-browser.json',
    'verification/web/evidence/native-saved-reading-browser.json',
    'verification/web/evidence/native-hosting-browser.json',
]
proofs = []
for name in proof_names:
    value = document(name)
    assert value['status'] == 'PASS', name
    assert not value.get('errors') and not value.get('unexpected') and not value.get('failure'), name
    assert all(v == 'closed' for v in value.get('cleanup', {}).values()), name
    for field in ['sourceHashes', 'runtimeHashes']:
        for path, expected in value.get(field, {}).items():
            bind(path, expected)
    for entry in value.get('runtimes', {}).values():
        bind(entry['path'], entry['sha256'])
    for check in value.get('checks', []):
        assert check['ok'] and check['exitCode'] == 0
        assert digest(check['log']) == check['logSha256']
        evidence[check['log']] = check['logSha256']
    evidence[name] = digest(name)
    proofs.append({'path': name, 'sha256': digest(name), 'status': 'PASS',
                   'stories': len(value['stories']) if 'stories' in value else None,
                   'requests': len(value['http']) if 'http' in value else None})

build_name = 'verification/web/evidence/source-reader-next-build.json'
build = document(build_name)
assert build['exitCode'] == 0 and build['status'] == 'completed' and build['sourceUnchangedDuringBuild']
build_inputs = 'verification/web/evidence/source-reader-build-source-sha256.json'
for name, expected in document(build_inputs).items():
    bind(name, expected)
assert build['sourceFiles'] == 1022
controller_log = 'verification/web/evidence/source-reader-controller-tests.log'
controller_text = read(controller_log).decode()
assert re.search(r'^# pass 106$', controller_text, re.M) and re.search(r'^# fail 0$', controller_text, re.M)
for name in ['verification/web/evidence/source-reader-ui-lint.log', 'verification/web/evidence/source-reader-portable-typecheck.log']:
    assert read(name) == b'', name

# Bind every managed source change and new file; ignored local evidence is
# enumerated separately. This is an isolated, reviewed milestone checkout.
managed = set(git('diff', '--name-only', BASE).decode().splitlines())
managed.update(git('ls-files', '--others', '--exclude-standard').decode().splitlines())
for name in sorted(managed - {OUTPUT}):
    bind(name)

extra_evidence = [build_name, build_inputs, controller_log,
    'verification/web/evidence/source-reader-next-build.log',
    'verification/web/evidence/source-reader-build-cache-reset.json',
    'verification/web/evidence/source-reader-build-first-attempt/source-reader-next-build.json',
    'verification/web/evidence/source-reader-build-first-attempt/source-reader-next-build.log',
    'verification/web/evidence/source-reader-build-first-attempt/source-reader-build-source-sha256.json',
    'verification/web/evidence/source-reader-ui-lint.log',
    'verification/web/evidence/source-reader-portable-typecheck.log',
    'verification/web/evidence/source-reader-fidelity-lint.log',
    'verification/web/evidence/native-source-reading-320.png',
    'platforms/evidence/native-source-reader-policy.log',
    'platforms/evidence/native-source-reader-lint.log',
]
for label in ['hamlet-320', 'hamlet-large-text-320', 'divine-comedy-320', 'relativity-equation-320', 'relativity-table-320', 'relativity-table-scrolled-320']:
    extra_evidence.append(f'verification/web/evidence/source-reader-fidelity-{label}.png')
for label in ['reading', 'saved-reading', 'hosting', 'source-reading']:
    for leaf in ['page.js', 'source-manifest.json']:
        extra_evidence.append(f'verification/web/evidence/native-{label}-fixture/{leaf}')
    extra_evidence.append(f'verification/web/evidence/source-reader-{label}-driver.log')
for name in extra_evidence:
    evidence[name] = digest(name)

archive = 'verification/web/evidence/checkpoint-5006dfb/'
original_receipt = archive + 'profile-navigation-verification.original.json'
assert digest(original_receipt) == 'c01a3ff93da526790cb9f79a96383cf9b2d25f7ba6021774b7a39a24e7baf299'
original = document(original_receipt)
for name, expected in original['evidenceSha256'].items():
    assert digest(archive + 'files/' + name) == expected, name
assert len(original['evidenceSha256']) == 68

baseline = '/Users/christaylor/Documents/Codex/2026-11-03/soe-discovery-search/evidence/original-checkout-status-before.bin'
old = read(baseline)
now = git('status', '--porcelain=v1', '-z', '--untracked-files=all', cwd='/Users/christaylor/society-of-explorers')
assert now == old and hashlib.sha256(now).hexdigest() == '7ed999f481d8d714e18d5bc8fbf9c4c999e0a07b39c106c4f45e118bb3214683'
assert len(now) == 26781 and now.count(b'\0') == 681

result = {
    'version': 1, 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'status': 'LOCAL_COMPLETE_SOURCE_READER_PASS_PRODUCTION_HOLD', 'productionCleared': False,
    'baseCheckpoint': BASE,
    'scope': 'Complete-source backend and browser fidelity; actual native App composition with explicit Fabric/OS/provider doubles; uncompiled Android/iOS source.',
    'tests': {'backend': 36, 'generator': 5, 'controllerRegressionGroup': 106, 'newSourceControllerSubset': 16,
              'nativePolicyAndWrapper': 10, 'staticNativeAssertions': 4, 'countsMayOverlap': True},
    'proofs': proofs,
    'staticChecks': {'portableTypecheck': 'PASS including pure native reading policy; native TSX excluded',
                     'fullWebTypecheck': 'PASS standalone and in guarded web build',
                     'scopedLint': 'PASS zero warnings', 'offlineWebBuild': {'pages': 238, 'inputs': 1022, 'sourceUnchanged': True}},
    'historicalArchive': {'checkpoint': BASE, 'receipt': original_receipt, 'evidenceFiles': 68, 'byteIdentical': True},
    'originalCheckout': {'statusEntries': 681, 'statusBytes': 26781, 'statusSha256': hashlib.sha256(now).hexdigest(), 'unchanged': True},
    'review': ['Independent backend/controller/UI and native source reviews found no blocking defect.',
               'Root and independent browser reviewer inspected the 320px App layout; fidelity reviewer inspected source illustrations, equations and tables.'],
    'limits': ['No native Codegen/compilation/full TSX typecheck, OS transport/renderer execution, device or accessibility acceptance.',
               'Native App eight-story proof uses Hamlet with no assets; standalone nine-story proof separately covers all eight editions and 312 assets.',
               'One raw Chromium CSS request has only the exact public same-edition reader referrer; no raw-browser zero-referrer claim.',
               'iOS source/podspec integration is not an existing app project or an owned account bridge.',
               'No provider sign-in, issued credential, API credit activation/use, install, SDK acquisition, deployment, production SQL or spending.',
               'Current backend source, native platform implementation, browser primitives and synthetic SQL/provider delivery have distinct proof scopes.',
               'A generated webpack cache failure is archived; the identical source build passed after preserving/replacing that generated cache.',
               'Local ignored evidence is not a portable export; earlier source hashes describe historical checkpoints.'],
    'sourceSha256': dict(sorted(source.items())), 'runtimeSha256': dict(sorted(runtime.items())),
    'evidenceSha256': dict(sorted(evidence.items())),
}
(ROOT / OUTPUT).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'sources': len(source), 'runtimes': len(runtime), 'evidence': len(evidence), 'originalCheckoutUnchanged': True}))
