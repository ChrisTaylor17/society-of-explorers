"""Bind the frozen local native-email milestone and preserve web recovery proof."""
from pathlib import Path
import datetime
import hashlib
import json
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[3]
BASE = '9b9435f9bbe9b7c2571b61b306ff6bf9af39bdb1'
OUTPUT = 'docs/integration/native-email-auth-verification.json'
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
for leaf in ['native-email-auth-unit.json', 'native-email-auth-browser.json',
             'native-email-bridge-policy.json', 'native-email-auth-static.json']:
    name = 'verification/web/evidence/' + leaf
    value = document(name)
    assert value['status'] == 'PASS' and not value.get('errors')
    assert value.get('providerCalls', 0) == 0
    assert value.get('sourceUnchanged', True) and value.get('sourcesUnchanged', True) and value.get('runtimeUnchanged', True)
    if leaf.endswith('-unit.json'):
        assert value['tests'] == 56
        assert value['cleanup']['fixtures'] == value['cleanup']['closed'] == 42
    elif leaf.endswith('-browser.json'):
        assert len(value['stories']) == 21 and len(value['http']) == 50
        assert value['cleanup'] == {'browser': 'closed', 'database': 'closed'}
        assert value['stats']['handles'] == value['stats']['netListeners'] == value['stats']['appListeners'] == 0
    elif leaf == 'native-email-bridge-policy.json':
        assert value['tests'] == 33 and value['newExecutableAdapterTests'] == 2 and value['newStaticNativeSourceTests'] == 7
    else:
        assert len(value['checks']) == 4
    for field in ['sourceHashes', 'runtimeHashes', 'evidenceHashes', 'selectedInputHashes']:
        for path, expected in value.get(field, {}).items():
            if isinstance(expected, dict):
                bind(expected['path'], expected['sha256'])
            else:
                bind(path, expected)
    for check in value.get('checks', []) + value.get('results', []):
        assert check['exitCode'] == 0
        bind(check['log'], check.get('logSha256', check.get('sha256')))
    for field in ['log', 'screenshot', 'priorReceipt']:
        if isinstance(value.get(field), dict):
            bind(value[field]['path'], value[field]['sha256'])
    bind(name)
    proofs.append({'path': name, 'sha256': digest(name), 'tests': value.get('tests'),
                   'stories': len(value['stories']) if 'stories' in value else None,
                   'syntheticRequests': len(value['http']) if 'http' in value else None})

archive = 'verification/web/evidence/checkpoint-9b9435f/'
original_name = archive + 'web-email-recovery-verification.original.json'
original = document(original_name)
assert read(original_name) == git('show', BASE + ':docs/integration/web-email-recovery-verification.json')
assert len(original['evidenceSha256']) == 17
for name, expected in original['evidenceSha256'].items():
    assert digest(archive + 'files/' + name) == expected
historical = document('docs/integration/web-email-recovery-verification.json')
assert historical['historicalCheckpoint']['commit'] == BASE
for name, expected in historical['evidenceSha256'].items():
    assert digest(name) == expected

managed = set(git('diff', '--name-only', BASE).decode().splitlines())
managed.update(git('ls-files', '--others', '--exclude-standard').decode().splitlines())
for name in sorted(managed - {OUTPUT}):
    bind(name)
for name in ['native-email-auth-browser.log', 'native-email-auth-320.png']:
    bind('verification/web/evidence/' + name)

baseline = '/Users/christaylor/Documents/Codex/2026-11-03/soe-discovery-search/evidence/original-checkout-status-before.bin'
original_status = git('status', '--porcelain=v1', '-z', '--untracked-files=all', cwd='/Users/christaylor/society-of-explorers')
assert original_status == read(baseline)
assert hashlib.sha256(original_status).hexdigest() == '7ed999f481d8d714e18d5bc8fbf9c4c999e0a07b39c106c4f45e118bb3214683'
result = {
    'version': 1, 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'status': 'LOCAL_NATIVE_EMAIL_ACCOUNT_PASS_PRODUCTION_HOLD', 'productionCleared': False,
    'baseCheckpoint': BASE,
    'scope': 'Registered native App signup, distinct confirmation resend, explicit native PKCE callback continuation and isolated password recovery; ordinary sign-in remains required for members.',
    'proofs': proofs,
    'tests': {'sdkAndPolicy': 56, 'newSdkCases': 22, 'browserStories': 21, 'syntheticBrowserRequests': 50,
              'nativeBridgePolicy': 33, 'newExecutableAdapterCases': 2, 'newStaticNativeSourceCases': 7,
              'countsOverlap': True, 'newFixturesClosed': 42, 'liveProviderCalls': 0},
    'staticChecks': {'fullWebTypes': 'PASS', 'portableTypes': 'PASS', 'adapterSpecTypesWithRNSubstitutes': 'PASS',
                     'scopedLint': 'PASS', 'nativeCompilation': 'NOT_RUN', 'newWebBuild': 'NOT_RUN_NATIVE_ONLY_PRODUCT_CHANGE'},
    'review': {'independentUiAndFactory': 'No remaining blocking source finding after lifecycle replay fix.',
               'nativeAndJsIntegration': 'Fixed provider signup AMR, shortened claim expiry, raw bridge receipt types, atomic native lifecycle snapshot and native known-online queue guards.',
               'visual320px': 'Root inspected final recovery screen; readable, no horizontal overflow.',
               'diagnostics': 'Initial product and fixture failures preserved separately; final receipts bind frozen source.'},
    'historicalArchive': {'checkpoint': BASE, 'receipt': original_name, 'sha256': digest(original_name), 'evidenceFiles': 17, 'byteIdentical': True},
    'originalCheckout': {'statusEntries': original_status.count(b'\0'), 'statusBytes': len(original_status),
                         'statusSha256': hashlib.sha256(original_status).hexdigest(), 'unchanged': True},
    'limits': ['Native encrypted storage, cryptography, OS callback/lifecycle and HTTP delivery are explicit doubles in executable local tests.',
               'Seven native policy cases inspect source only. No actual RN types, Codegen, Kotlin, Hermes, Keystore, Android installation or physical-device acceptance.',
               'The custom scheme is not a verified App Link. Exact provider allowlisting, standard mail delivery, rate/CAPTCHA/TLS behavior and password sign-in after an update remain unverified.',
               'Password-update acceptance does not settle a lost reply or a prior sent update. No durable unknown-write journal or automatic retry is claimed.',
               'iOS lacks the equivalent generated project and protected bridge; Quest device and moderation parity remain open.',
               'No provider sign-in, email, issued credential, spending, SDK acquisition, deployment or production SQL.',
               'Local ignored evidence is not a portable export.'],
    'sourceSha256': sources, 'runtimeSha256': runtimes, 'evidenceSha256': evidence,
}
(ROOT / OUTPUT).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'sourceInputs': len(sources), 'runtimeInputs': len(runtimes),
                  'evidenceFiles': len(evidence), 'receiptSha256': digest(OUTPUT)}))
