#!/usr/bin/env python3
"""Reproduce archived offline suite and fixture-lint checks in separate logs.

This script has not been executed as part of archival. It writes new output to
an explicitly selected directory, preserving the previously observed summaries.
"""
from pathlib import Path
import argparse
import collections
import json
import re
import os
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT.parents[1]
BASELINE = Path('/Users/christaylor/Documents/Codex/2026-11-01/task-4/soe-member-session-continuation/candidate')
BUN = str(ROOT / 'tooling/node_modules/@oven/bun-darwin-aarch64/bin/bun')
ENV = {k: os.environ[k] for k in ['PATH','HOME','USER','SHELL','TMPDIR','LANG','LC_ALL'] if k in os.environ}
ENV['CI'] = '1'
ENV['NODE_OPTIONS'] = '--require ' + str(ROOT / 'scripts/deny-build-network.cjs')


def suites(output):
    results = {}
    for group, pattern in [('security', 'tests/security/*.test.ts'), ('growth', 'tests/growth/g*.test.ts')]:
        files = sorted(CANDIDATE.glob(pattern))
        group_results = []
        for file in files:
            relative = str(file.relative_to(CANDIDATE))
            command = [BUN, 'test', '--no-env-file', '--no-install', '--preload',
                       str(ROOT / 'scripts/deny-build-network.cjs'), relative]
            run = subprocess.run(command, cwd=CANDIDATE, capture_output=True, text=True, timeout=30, env=ENV)
            log = run.stdout + run.stderr
            (output / (file.name + '.log')).write_text(log)
            passed = re.findall(r'\b(\d+) pass\b', log)
            assertions = re.findall(r'\b(\d+) expect\(\) calls', log)
            group_results.append({'file': relative, 'command': command, 'exit_code': run.returncode,
                                  'passed_tests': int(passed[-1]) if passed else 0,
                                  'assertions': int(assertions[-1]) if assertions else 0})
        results[group] = {'files': group_results,
                          'passed_tests': sum(r['passed_tests'] for r in group_results),
                          'assertions': sum(r['assertions'] for r in group_results)}
    (output / 'suites.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps({k: {'files': len(v['files']), 'passed_tests': v['passed_tests'], 'assertions': v['assertions']} for k,v in results.items()}))
    return all(r['exit_code'] == 0 for group in results.values() for r in group['files'])


def fixture_lint(output):
    results = {}
    command = ['node_modules/.bin/eslint', '--stdin', '--stdin-filename', 'tests/security/fakes.ts', '--format', 'json']
    for label, root in [('baseline', BASELINE), ('candidate', CANDIDATE)]:
        source = root / 'tests/security/fakes.ts'
        run = subprocess.run(command, cwd=CANDIDATE, input=source.read_text(), capture_output=True, text=True, timeout=30, env=ENV)
        (output / (label + '-fixture-eslint.json')).write_text(run.stdout)
        report = json.loads(run.stdout)[0]
        counts = collections.Counter((m['ruleId'], m['severity']) for m in report['messages'])
        results[label] = {'source': str(source), 'command': command, 'exit_code': run.returncode,
                          'counts': [{'rule': rule, 'severity': severity, 'count': count}
                                     for (rule, severity), count in sorted(counts.items())]}
    baseline_route = (BASELINE / 'app/api/circles/route.ts').read_text()
    candidate_route = (CANDIDATE / 'app/api/circles/route.ts').read_text()
    marker = '// Start a circle.'
    results['post_suffix_unchanged'] = baseline_route[baseline_route.index(marker):] == candidate_route[candidate_route.index(marker):]
    results['lint_counts_unchanged'] = results['baseline']['counts'] == results['candidate']['counts']
    (output / 'fixture-lint.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))
    return results['post_suffix_unchanged'] and results['lint_counts_unchanged']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('check', choices=['suites', 'fixture-lint', 'all'])
    parser.add_argument('--output-dir', required=True, type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    success = True
    if args.check in ('suites', 'all'):
        success = suites(args.output_dir) and success
    if args.check in ('fixture-lint', 'all'):
        success = fixture_lint(args.output_dir) and success
    raise SystemExit(0 if success else 1)


if __name__ == '__main__':
    main()
