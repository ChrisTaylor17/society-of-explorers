"""Run root tests in a clean, externally denied Node process.

--non-dom selects transitive non-JSDOM suites while the reused exact DOM
runtime is dataless. It does not change, skip assertions inside, or fake a test.
The JSON selection makes the excluded files explicit.
"""
from pathlib import Path
import argparse
import json
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--non-dom', action='store_true')
    parser.add_argument('--output-name', default='root-tests')
    options = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9-]+', options.output_name):
        parser.error('Use a simple output name')
    seen = {}

    def needs_dom(path, trail=()):
        path = path.resolve()
        if path in seen:
            return seen[path]
        if path in trail:
            return False
        info = path.stat()
        if info.st_size and not info.st_blocks:
            raise RuntimeError(f'Refusing to materialize test placeholder: {path}')
        text = path.read_text()
        result = 'jsdom' in text
        for relative in re.findall(r'''(?:from\s*|import\s*)["'](\.[^"']+\.mjs)["']''', text):
            target = path.parent / relative
            if target.exists():
                result = result or needs_dom(target, trail + (path,))
        seen[path] = result
        return result

    all_files = sorted((ROOT / 'tests').glob('*.test.mjs'))
    files = [path for path in all_files if not options.non_dom or not needs_dom(path)]
    selection = {'selected': [str(path.relative_to(ROOT)) for path in files],
                 'excludedForDatalessDomRuntime': [str(path.relative_to(ROOT)) for path in all_files if path not in files]}
    evidence = ROOT / 'evidence'
    evidence.mkdir(exist_ok=True)
    (evidence / (options.output_name + '-selection.json')).write_text(json.dumps(selection, indent=2) + '\n')
    env = {key: os.environ[key] for key in ['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL'] if key in os.environ}
    command = ['node', '--require', './scripts/deny-build-network.cjs', '--test', '--test-concurrency=2', *selection['selected']]
    with (evidence / (options.output_name + '.log')).open('w') as output:
        run = subprocess.run(command, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT, timeout=300)
    print(json.dumps({'exitCode': run.returncode, 'files': len(files), 'log': str(evidence / (options.output_name + '.log'))}))
    raise SystemExit(run.returncode)


if __name__ == '__main__':
    main()
