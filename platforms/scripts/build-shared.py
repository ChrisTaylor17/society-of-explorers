from pathlib import Path
import hashlib, json, os, subprocess, time

ROOT = Path(__file__).resolve().parents[2]
guard = ROOT / 'verification/web/scripts/deny-build-network.cjs'
bun = ROOT / 'verification/web/tooling/node_modules/@oven/bun-darwin-aarch64/bin/bun'
env = {key: value for key, value in os.environ.items() if key in ['PATH', 'HOME', 'TMPDIR', 'LANG']}
argv = [str(bun), '--no-env-file', '--preload', str(guard), 'platforms/scripts/bundle-shared.mjs']
start = time.time()
result = subprocess.run(argv, cwd=ROOT, env=env, capture_output=True, text=True, timeout=60)
evidence = ROOT / 'platforms/evidence'
evidence.mkdir(exist_ok=True)
(evidence / 'shared-build.log').write_text(result.stdout + result.stderr)
record = {'command': argv, 'exitCode': result.returncode, 'seconds': round(time.time() - start, 3),
          'cleanEnvironment': True, 'startupNetworkGuard': str(guard.relative_to(ROOT)), 'sourceEntry': 'platforms/shared/quest-entry.ts',
          'output': 'platforms/quest/circle-host.mjs', 'outputSHA256': hashlib.sha256((ROOT / 'platforms/quest/circle-host.mjs').read_bytes()).hexdigest()}
(evidence / 'shared-build.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record))
raise SystemExit(result.returncode)
