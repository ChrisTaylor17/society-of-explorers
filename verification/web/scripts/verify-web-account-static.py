"""Frozen web account type/lint checks; no provider environment or network."""
from pathlib import Path
import datetime
import hashlib
import json
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[3]
ENV = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin', 'HOME': '/Users/christaylor'}
FILES = [
    'lib/auth/webAccount.ts', 'lib/auth/browserIntent.ts', 'lib/auth/emailSignup.ts',
    'lib/auth/providerSelection.ts', 'lib/auth/provider.ts', 'lib/getAuthenticatedMember.ts',
    'lib/auth/browserSignOut.ts', 'lib/auth/supabaseBrowserLogout.ts', 'lib/auth/sessionClaims.ts', 'lib/auth/callbackSession.ts', 'lib/auth/siweNonce.ts',
    'app/api/auth/provider/route.ts', 'app/api/auth/nonce/route.ts', 'app/api/auth/siwe/route.ts',
    'app/api/auth/logout/route.ts', 'app/api/auth/logout/provider/route.ts', 'app/api/auth/ensure-member/route.ts', 'app/auth/callback/route.ts',
    'app/auth/complete/page.tsx', 'app/auth/complete/Completion.tsx',
    'app/auth/confirm/page.tsx', 'app/auth/confirm/Confirmation.tsx',
    'app/login/page.tsx', 'app/login/login.module.css', 'components/PublicNav.tsx', 'components/AccountSignOut.tsx', 'proxy.ts',
    'tsconfig.json', 'verification/web/scripts/deny-build-network.cjs',
    'verification/web/scripts/verify-web-account-static.py',
]


def digest(name):
    path = ROOT / name
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode) and (not info.st_size or info.st_blocks), name
    return hashlib.sha256(path.read_bytes()).hexdigest()


sources = {name: digest(name) for name in FILES}
runtime = {name: digest(name) for name in ['node_modules/typescript/bin/tsc', 'node_modules/typescript/lib/_tsc.js', 'node_modules/eslint/bin/eslint.js']}
checks = []
commands = [
    ('full-web-types', ['node', '--require', './verification/web/scripts/deny-build-network.cjs', 'node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false']),
    ('product-lint', ['node', '--require', './verification/web/scripts/deny-build-network.cjs', 'node_modules/eslint/bin/eslint.js'] + [name for name in FILES if name.endswith(('.ts', '.tsx')) and name != 'tsconfig.json']),
]
for name, command in commands:
    result = subprocess.run(command, cwd=ROOT, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    log = 'verification/web/evidence/web-account-' + name + '.log'
    (ROOT / log).write_bytes(result.stdout)
    checks.append({'name': name, 'exitCode': result.returncode, 'log': log, 'sha256': digest(log)})
unchanged = all(digest(name) == expected for name, expected in {**sources, **runtime}.items())
report = {'status': 'PASS' if unchanged and all(check['exitCode'] == 0 for check in checks) else 'FAIL',
          'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceUnchanged': unchanged,
          'checks': checks, 'sourceHashes': sources, 'runtimeHashes': runtime,
          'limits': ['Full web types and scoped product lint only. Production build and behavioral tests are separate.',
                     'No provider configuration, native compilation, deployment or production acceptance.']}
out = ROOT / 'verification/web/evidence/web-account-static.json'
out.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'checks': checks}))
raise SystemExit(0 if report['status'] == 'PASS' else 1)
