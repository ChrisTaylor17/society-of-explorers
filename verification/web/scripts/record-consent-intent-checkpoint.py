"""Bind completed consent proofs to their actual source and preserve prior evidence."""
from pathlib import Path
import datetime
import hashlib
import json
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[3]
BASE = '7e7490c439c613308f51e065f600721e18cde41e'
OUTPUT = 'docs/integration/consent-intent-verification.json'
ENV = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin', 'HOME': '/Users/christaylor', 'GIT_OPTIONAL_LOCKS': '0'}
source, runtime, evidence = {}, {}, {}


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
    assert expected is None or expected == actual, f'Changed input: {name}'
    table = evidence if '/evidence/' in name else runtime if Path(name).is_absolute() or 'node_modules/' in name else source
    assert name not in table or table[name] == actual
    table[name] = actual


proofs = []
for name in ['verification/web/evidence/consent-intent-backend.json', 'verification/web/evidence/consent-intent-browser.json']:
    value = document(name)
    assert value['status'] == 'PASS' and not value.get('errors') and not value.get('failure'), name
    assert value['providerCalls'] == 0
    assert value.get('remainingAuthListeners', 0) == 0
    assert value.get('sourceUnchanged', True) and value.get('runtimeUnchanged', True)
    cleanup = value.get('cleanup', {})
    if isinstance(cleanup, dict) and 'created' in cleanup:
        assert cleanup['created'] > 0 and cleanup['closed'] == cleanup['created'] and cleanup['providerCalls'] == 0
    else:
        assert cleanup == 'closed' or cleanup and all(v == 'closed' for v in cleanup.values()), name
    for field in ['sourceHashes', 'runtimeHashes', 'evidenceHashes', 'preservedEvidenceHashes']:
        for path, expected in value.get(field, {}).items():
            if isinstance(expected, dict):
                bind(expected['path'], expected['sha256'])
            else:
                bind(path, expected)
    for check in value.get('checks', []):
        assert check['ok'] and check['exitCode'] == 0
        bind(check['log'], check['logSha256'])
    bind(name)
    proofs.append({'path': name, 'sha256': digest(name), 'scope': value.get('scope', 'Actual SQL/current handlers and parsers with synthetic server identity and disposable PGlite.'),
                   'stories': len(value['stories']) if 'stories' in value else None,
                   'requests': len(value['http']) if 'http' in value else None,
                   'tests': value.get('tests'), 'count': value.get('count')})

build_name = 'verification/web/evidence/consent-intent-next-build.json'
build = document(build_name)
assert build['status'] == 'completed' and build['exitCode'] == 0 and build['sourceUnchangedDuringBuild']
build_inputs = 'verification/web/evidence/consent-intent-build-source-sha256.json'
inputs = document(build_inputs)
assert len(inputs) == build['sourceFiles']
for name, expected in inputs.items():
    bind(name, expected)
for name in ['consent-intent-web-typecheck.log', 'consent-intent-web-lint.log', 'consent-intent-lint.log']:
    assert read('verification/web/evidence/' + name) == b''

# Baselines describe the vulnerable source, not acceptance of the current code.
baselines = []
for name in ['verification/web/evidence/consent-recovery-baseline.json', 'verification/web/evidence/consent-recovery-baseline-browser.json']:
    value = document(name)
    assert value['status'] == 'REPRODUCED' and value['providerCalls'] == 0
    for path, expected in value['sourceHashes'].items():
        if digest(path) != expected:
            historical = git('show', BASE + ':' + path)
            assert hashlib.sha256(historical).hexdigest() == expected, path
    bind(name)
    baselines.append({'path': name, 'sha256': digest(name), 'observations': len(value['observations']), 'checkpoint': BASE})

archive = 'verification/web/evidence/checkpoint-7e7490c/'
original_receipt = archive + 'source-reader-verification.original.json'
original = document(original_receipt)
assert read(original_receipt) == git('show', BASE + ':docs/integration/source-reader-verification.json')
for name, expected in original['evidenceSha256'].items():
    assert digest(archive + 'files/' + name) == expected
assert len(original['evidenceSha256']) == 43

managed = set(git('diff', '--name-only', BASE).decode().splitlines())
managed.update(git('ls-files', '--others', '--exclude-standard').decode().splitlines())
for name in sorted(managed - {OUTPUT}):
    bind(name)
for leaf in ['consent-intent-backend.log', 'consent-intent-browser.log', 'consent-intent-320.png',
             'consent-intent-backend-verification.log', 'consent-intent-lint.log',
             'consent-intent-web-typecheck.log', 'consent-intent-web-lint.log',
             'consent-intent-next-build.json', 'consent-intent-next-build.log', 'consent-intent-build-source-sha256.json',
             'consent-intent-build-driver.log', 'consent-intent-typecheck-build-overlap.log',
             'consent-recovery-baseline-stale-off-320.png']:
    bind('verification/web/evidence/' + leaf)

baseline = '/Users/christaylor/Documents/Codex/2026-11-03/soe-discovery-search/evidence/original-checkout-status-before.bin'
now = git('status', '--porcelain=v1', '-z', '--untracked-files=all', cwd='/Users/christaylor/society-of-explorers')
assert now == read(baseline)
assert hashlib.sha256(now).hexdigest() == '7ed999f481d8d714e18d5bc8fbf9c4c999e0a07b39c106c4f45e118bb3214683'

result = {
    'version': 1, 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'status': 'LOCAL_WEB_CONSENT_INTENT_PASS_PRODUCTION_HOLD', 'productionCleared': False,
    'baseCheckpoint': BASE, 'scope': 'Web author consent ordering, explicit recovery and stale-action retirement; unapplied SQL successor.',
    'proofs': proofs, 'historicalBaselines': baselines,
    'staticChecks': {'fullWebTypecheck': 'PASS', 'scopedLint': 'PASS', 'offlineWebBuild': 'PASS', 'buildInputs': len(inputs)},
    'historicalArchive': {'checkpoint': BASE, 'receipt': original_receipt, 'sha256': digest(original_receipt), 'evidenceFiles': 43, 'byteIdentical': True},
    'originalCheckout': {'statusEntries': now.count(b'\0'), 'statusBytes': len(now), 'statusSha256': hashlib.sha256(now).hexdigest(), 'unchanged': True},
    'limits': ['Disposable PGlite and synthetic server identity are not hosted database or independent-session acceptance.',
               'No native/Quest consent or reviewer parity, device acceptance, provider calls, issued credentials, deployment, production SQL or spending.',
               'Recovery is explicit; no durable queue, automatic retry, provider recall or historical delivery proof.',
               'Consent and allowance candidates remain unapplied; the real AI provider remains disabled.',
               'A standalone typecheck overlapped generated build types and is preserved; the sequential post-build check supplies acceptance.',
               'Local ignored evidence is not a portable export.'],
    'sourceSha256': dict(sorted(source.items())), 'runtimeSha256': dict(sorted(runtime.items())), 'evidenceSha256': dict(sorted(evidence.items())),
}
(ROOT / OUTPUT).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'sources': len(source), 'runtimes': len(runtime), 'evidence': len(evidence)}))
