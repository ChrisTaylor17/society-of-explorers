"""Bind current web account proof and preserved historical checkpoints."""
from pathlib import Path
import datetime
import hashlib
import json
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[3]
BASE = 'fcafaff39db6b71b0fd2fbe806139611e7772aa0'
OUTPUT = 'docs/integration/web-account-entry-verification.json'
ENV = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin', 'HOME': '/Users/christaylor', 'GIT_OPTIONAL_LOCKS': '0'}
sources, runtimes, evidence = {}, {}, {}


def read(name):
    path = Path(name) if Path(name).is_absolute() else ROOT / name
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode) and (not info.st_size or info.st_blocks), name
    return path.read_bytes()


def digest(name):
    return hashlib.sha256(read(name)).hexdigest()


def document(name):
    return json.loads(read(name))


def git(*args, cwd=ROOT):
    return subprocess.check_output(['git', *args], cwd=cwd, env=ENV)


def bind(name, expected=None):
    actual = digest(name)
    assert expected is None or actual == expected, 'Changed input: ' + name
    table = runtimes if Path(name).is_absolute() or 'node_modules/' in name else evidence if '/evidence/' in name else sources
    assert name not in table or table[name] == actual, name
    table[name] = actual


proofs = []
for leaf, expected_count in [('email-signup-unit.json', 18), ('web-account-unit.json', 20), ('web-wallet-unit.json', 9),
                             ('browser-intent-verification.json', None), ('web-login-browser.json', None), ('web-account-static.json', None)]:
    name = 'verification/web/evidence/' + leaf
    value = document(name)
    assert value['status'] == 'PASS' and not value.get('errors'), name
    if expected_count is not None:
        assert value['tests'] == expected_count, name
    if leaf == 'browser-intent-verification.json':
        assert value['tests'] >= 125 and value['proofBound'], name
    if leaf == 'web-login-browser.json':
        assert len(value['observations']) == 15 and len(value['requests']) == 23 and value['cleanup']['browser'] == 'closed', name
    for field in ['sourceUnchanged', 'runtimeUnchanged', 'sdkRuntimeBound', 'testedSourcesBound']:
        assert value.get(field, True), (name, field)
    cleanup = value.get('cleanup', {})
    if 'fixtures' in cleanup:
        assert cleanup['fixtures'] == cleanup['closed'] and cleanup.get('providerCalls', 0) == 0, name
    for field in ['timers', 'observers', 'walletListeners']:
        assert cleanup.get(field, 0) == 0, name
    for field in ['sourceHashes', 'runtimeHashes', 'servedHashes', 'evidenceHashes']:
        for path, expected in value.get(field, {}).items():
            bind(expected['path'], expected['sha256']) if isinstance(expected, dict) else bind(path, expected)
    for check in value.get('checks', []):
        assert check['exitCode'] == 0, (name, check)
        bind(check['log'], check.get('logSha256', check.get('sha256')))
    bind(name)
    proofs.append({'path': name, 'sha256': digest(name), 'tests': value.get('tests'),
                   'browserStories': len(value['observations']) if 'observations' in value else None,
                   'syntheticRequests': len(value['requests']) if 'requests' in value else None})

build_name = 'verification/web/evidence/web-account-next-build.json'
build = document(build_name)
assert build['status'] == 'completed' and build['exitCode'] == 0 and build['sourceUnchangedDuringBuild']
assert build['externalNetworkBlocked'] and not build['privateOrIssuedCredentialsSupplied']
manifest_name = 'verification/web/evidence/web-account-build-source-sha256.json'
manifest = document(manifest_name)
assert len(manifest) == build['sourceFiles'] == 1033
assert hashlib.sha256(json.dumps(manifest, separators=(',', ':')).encode()).hexdigest() == build['sourceSha256']
for name, expected in manifest.items():
    bind(name, expected)
for name in [build_name, manifest_name, 'verification/web/' + build['log'],
             'verification/web/evidence/web-login-browser.log', 'verification/web/evidence/web-login-ui-lint.log',
             'verification/web/evidence/web-login-signup-320.png']:
    bind(name)

archive = 'verification/web/evidence/checkpoint-fcafaff/'
original_name = archive + 'native-email-auth-verification.original.json'
original = document(original_name)
assert read(original_name) == git('show', BASE + ':docs/integration/native-email-auth-verification.json')
assert len(original['evidenceSha256']) == 17
for name, expected in original['evidenceSha256'].items():
    bind(archive + 'files/' + name, expected)
historical = document('docs/integration/native-email-auth-verification.json')
assert historical['historicalCheckpoint']['commit'] == BASE
for name, expected in historical['evidenceSha256'].items():
    bind(name, expected)
bind(original_name)

baseline_name = 'verification/web/evidence/web-login-baseline.json'
baseline = document(baseline_name)
assert baseline['status'] == 'BASELINE_REPRODUCED' and len(baseline['observations']) == 3 and not baseline['errors']
for name, expected in baseline['sourceHashes'].items():
    bind('verification/web/evidence/web-login-baseline-sources/' + name, expected)
for name, expected in baseline['servedHashes'].items():
    bind(name, expected)
bind(baseline_name)

managed = set(git('diff', '--name-only', BASE).decode().splitlines())
managed.update(git('ls-files', '--others', '--exclude-standard').decode().splitlines())
for name in sorted(managed - {OUTPUT}):
    bind(name)
saved_status = '/Users/christaylor/Documents/Codex/2026-11-03/soe-discovery-search/evidence/original-checkout-status-before.bin'
original_status = git('status', '--porcelain=v1', '-z', '--untracked-files=all', cwd='/Users/christaylor/society-of-explorers')
assert original_status == read(saved_status)
assert hashlib.sha256(original_status).hexdigest() == '7ed999f481d8d714e18d5bc8fbf9c4c999e0a07b39c106c4f45e118bb3214683'

result = {
    'version': 1, 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'status': 'LOCAL_WEB_ACCOUNT_ENTRY_PASS_PRODUCTION_HOLD', 'productionCleared': False, 'baseCheckpoint': BASE,
    'scope': 'Web email signup/resend/isolated confirmation, password/Google/wallet entry, browser intent and verified-subject selection receipts, explicit member completion and logout ordering.',
    'proofs': proofs,
    'tests': {'emailSignup': 18, 'ordinaryAccount': 20, 'walletController': 9,
              'backendAndExistingRegressions': document('verification/web/evidence/browser-intent-verification.json')['tests'],
              'browserStories': 15, 'syntheticBrowserRequests': 23, 'countsOverlap': True, 'liveProviderCalls': 0},
    'build': {'status': 'PASS', 'sourceInputs': 1033, 'sourceUnchanged': True, 'networkDenied': True, 'credentialsSupplied': False},
    'static': {'fullWebTypes': 'PASS', 'productLint': 'PASS', 'nativeCompilation': 'NOT_RUN'},
    'review': {'baseline': 'Three actual browser defects reproduced and original source/bundles retained.',
               'independent': 'Fixed reentrant navigation, wallet chain readback and extension exceptions, draft retirement on provider changes, and confirmation outcome loss on blur.',
               'visual320px': 'Root inspected the final signup screenshot: readable labels, fields and actions without horizontal overflow.',
               'diagnostics': 'Earlier failed/changed-source runs and pre-fix proof are retained locally; only current inputs are accepted here.'},
    'historicalArchive': {'checkpoint': BASE, 'receipt': original_name, 'sha256': digest(original_name), 'evidenceFiles': 17, 'byteIdentical': True},
    'originalCheckout': {'statusEntries': original_status.count(b'\0'), 'statusBytes': len(original_status), 'statusSha256': hashlib.sha256(original_status).hexdigest(), 'unchanged': True},
    'limits': ['Provider HTTP, member identity and lower database boundaries are explicit doubles, with disposable local SQL in selected regression tests. No live mail, Google grant, wallet extension or provider account acceptance.',
               'Delayed server responses may deny a newer session by overwriting cookies; the receipt prevents those responses from selecting an older identity under a newer current intent.',
               'Stateless SIWE nonce binding does not claim server-side one-use consumption. Wallet listener cleanup cannot force a real extension that refuses removal; retired callbacks have no operation ownership.',
               'No deployed Next routing, production Data API/RLS, backup/restore/rollout, native compilation, iOS/Android/Quest device, complete accessibility or content-rights acceptance is claimed.',
               'No provider sign-in, email, issued credential, spending, dependency acquisition, deployment or production SQL occurred.',
               'Ignored local evidence and cached runtimes are not a portable export.'],
    'sourceSha256': sources, 'runtimeSha256': runtimes, 'evidenceSha256': evidence,
}
(ROOT / OUTPUT).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'sources': len(sources), 'runtimes': len(runtimes), 'evidence': len(evidence), 'sha256': digest(OUTPUT)}))
