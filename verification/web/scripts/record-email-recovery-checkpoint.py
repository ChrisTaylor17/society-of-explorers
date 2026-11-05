"""Bind local web recovery acceptance, preserving the preceding consent proof."""
from pathlib import Path
import datetime
import hashlib
import json
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[3]
BASE = '21e404e24e010c34c8fbe810465bc74c4d4c7d4a'
OUTPUT = 'docs/integration/web-email-recovery-verification.json'
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
    assert name not in table or table[name] == actual
    table[name] = actual


proofs = []
for name in ['verification/web/evidence/email-recovery-unit.json',
             'verification/web/evidence/email-recovery-callback.json',
             'verification/web/evidence/email-recovery-browser.json']:
    value = document(name)
    assert value['status'] == 'PASS' and not value.get('errors')
    assert value.get('providerCalls', 0) == 0 and value.get('remainingListeners', 0) == 0
    assert value.get('sourceUnchanged', True) and value.get('runtimeUnchanged', True)
    if name.endswith('-unit.json'):
        assert value['tests'] == 19 and value['sdkRuntimeBound']
        assert value['cleanup']['fixtures'] == value['cleanup']['closed'] == 30
    elif name.endswith('-callback.json'):
        assert value['tests'] == 11
    else:
        assert len(value['stories']) == 21 and len(value['http']) == 36
        assert value['cleanup'] == {'browser': 'closed', 'server': 'closed'}
    for field in ['sourceHashes', 'runtimeHashes', 'evidenceHashes']:
        for path, expected in value.get(field, {}).items():
            if isinstance(expected, dict):
                bind(expected['path'], expected['sha256'])
            else:
                bind(path, expected)
    for check in value.get('checks', []):
        assert check['ok'] and check['exitCode'] == 0
        bind(check['log'], check['logSha256'])
    for field in ['log', 'screenshot', 'priorReceipt']:
        if isinstance(value.get(field), dict):
            bind(value[field]['path'], value[field]['sha256'])
    bind(name)
    proofs.append({'path': name, 'sha256': digest(name), 'tests': value.get('tests'),
                   'stories': len(value['stories']) if 'stories' in value else None,
                   'syntheticRequests': len(value['http']) if 'http' in value else None,
                   'scope': value.get('scope', 'Actual cached SDK with synthetic browser storage, locks, time and provider HTTP.')})

build_name = 'verification/web/evidence/email-recovery-next-build.json'
build = document(build_name)
assert build['status'] == 'completed' and build['exitCode'] == 0
assert build['externalNetworkBlocked'] and not build['privateOrIssuedCredentialsSupplied']
assert build['sourceUnchangedDuringBuild']
build_inputs = 'verification/web/evidence/email-recovery-build-source-sha256.json'
inputs = document(build_inputs)
assert len(inputs) == build['sourceFiles'] == 1027
for name, expected in inputs.items():
    bind(name, expected)
for name in ['email-recovery-web-typecheck.log', 'email-recovery-web-lint.log']:
    assert read('verification/web/evidence/' + name) == b''

archive = 'verification/web/evidence/checkpoint-21e404e/'
original_name = archive + 'consent-intent-verification.original.json'
original = document(original_name)
assert read(original_name) == git('show', BASE + ':docs/integration/consent-intent-verification.json')
assert len(original['evidenceSha256']) == 31
for name, expected in original['evidenceSha256'].items():
    assert digest(archive + 'files/' + name) == expected
historical = document('docs/integration/consent-intent-verification.json')
assert historical['historicalCheckpoint']['commit'] == BASE
for name, expected in historical['evidenceSha256'].items():
    assert digest(name) == expected

managed = set(git('diff', '--name-only', BASE).decode().splitlines())
managed.update(git('ls-files', '--others', '--exclude-standard').decode().splitlines())
for name in sorted(managed - {OUTPUT}):
    bind(name)
for name in ['email-recovery-next-build.json', 'email-recovery-next-build.log',
             'email-recovery-build-source-sha256.json', 'email-recovery-browser.log',
             'email-recovery-web-typecheck.log', 'email-recovery-web-lint.log']:
    bind('verification/web/evidence/' + name)

baseline = '/Users/christaylor/Documents/Codex/2026-11-03/soe-discovery-search/evidence/original-checkout-status-before.bin'
original_status = git('status', '--porcelain=v1', '-z', '--untracked-files=all', cwd='/Users/christaylor/society-of-explorers')
assert original_status == read(baseline)
assert hashlib.sha256(original_status).hexdigest() == '7ed999f481d8d714e18d5bc8fbf9c4c999e0a07b39c106c4f45e118bb3214683'

result = {
    'version': 1, 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'status': 'LOCAL_WEB_EMAIL_RECOVERY_PASS_PRODUCTION_HOLD', 'productionCleared': False,
    'baseCheckpoint': BASE, 'scope': 'Isolated web password recovery, ordinary callback purpose guard and login entrypoint.',
    'proofs': proofs, 'staticChecks': {'fullWebTypecheck': 'PASS', 'scopedLint': 'PASS', 'offlineWebBuild': 'PASS', 'buildInputs': 1027},
    'historicalArchive': {'checkpoint': BASE, 'receipt': original_name, 'sha256': digest(original_name), 'evidenceFiles': 31, 'byteIdentical': True},
    'originalCheckout': {'statusEntries': original_status.count(b'\0'), 'statusBytes': len(original_status),
                         'statusSha256': hashlib.sha256(original_status).hexdigest(), 'unchanged': True},
    'limits': ['Synthetic provider replies do not establish hosted AMR compatibility, email delivery or successful sign-in with a changed password.',
               'Browser proof mounts the actual Recovery component; full deployed Next routing, existing Login lifecycle and native recovery are outside acceptance.',
               'A matching password PUT proves acceptance only; lost responses remain uncertain and no durable recovery journal is claimed.',
               'No provider sign-in, email, issued credential, spending, install, SDK acquisition, deployment or production SQL.',
               'Prior provisional browser evidence is diagnostic or historical; current frozen-source proof supplies acceptance.',
               'Local ignored evidence is not a portable export.'],
    'sourceSha256': sources, 'runtimeSha256': runtimes, 'evidenceSha256': evidence,
}
(ROOT / OUTPUT).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'sourceInputs': len(sources), 'runtimeInputs': len(runtimes),
                  'evidenceFiles': len(evidence), 'receiptSha256': digest(OUTPUT)}))
