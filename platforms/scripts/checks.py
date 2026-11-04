from pathlib import Path
import json, os, subprocess, time

ROOT = Path(__file__).resolve().parents[2]
env = {key: value for key, value in os.environ.items() if key in ['PATH', 'HOME', 'TMPDIR', 'LANG']}
guard = str(ROOT / 'verification/web/scripts/deny-build-network.cjs')
node = ['node', '--require', guard]
commands = [
    ('shared-build', ['python3', 'platforms/scripts/build-shared.py']),
    ('portable-types', node + ['node_modules/typescript/bin/tsc', '--project', 'platforms/tsconfig.portable.json']),
    ('integration-tests', node + ['--test', 'platforms/tests/integration.test.mjs']),
    ('quest-browser', node + ['platforms/tests/browser-quest.mjs']),
    ('import-verification', ['python3', 'platforms/scripts/verify-import.py']),
]
results = []
for label, command in commands:
    start = time.time()
    result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=60)
    log = ROOT / 'platforms/evidence' / (label + '.log')
    log.write_text(result.stdout + result.stderr)
    record = {'label': label, 'command': command, 'exitCode': result.returncode,
              'seconds': round(time.time() - start, 3), 'log': str(log.relative_to(ROOT)), 'cleanEnvironment': True}
    results.append(record)
    print(json.dumps(record), flush=True)
    if result.returncode:
        break
(ROOT / 'platforms/evidence/checks.json').write_text(json.dumps(results, indent=2) + '\n')
raise SystemExit(0 if len(results) == len(commands) and all(item['exitCode'] == 0 for item in results) else 1)
