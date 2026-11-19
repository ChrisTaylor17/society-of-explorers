"""Compile and run selected native account suites using the resident Mac SDK."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import time


ROOT = Path(__file__).resolve().parents[2]
DEV = Path('/Library/Developer/CommandLineTools')
SDK = DEV / 'SDKs/MacOSX27.2.sdk'
TARGET = 'arm64-apple-macosx14.0'
EVIDENCE = ROOT / 'verification/web/evidence'
SANDBOX = Path('/usr/bin/sandbox-exec')
PYTHON = Path('/usr/bin/python3')
DRIVER = DEV / 'usr/bin/swift-driver'
RUNTIME = [SANDBOX, PYTHON, DRIVER, *[DEV / 'usr/bin' / name for name in ('swift-frontend', 'clang', 'ld')],
           SDK / 'SDKSettings.json', SDK / 'usr/lib/swift/libswiftCore.tbd']
for name in ('Swift', 'SwiftOnoneSupport', '_Concurrency'):
    RUNTIME.append(SDK / f'usr/lib/swift/{name}.swiftmodule/arm64e-apple-macos.swiftinterface')
FRAMEWORKS = SDK / 'System/Library/Frameworks'
for name in ('Foundation', 'Security', 'LocalAuthentication'):
    RUNTIME.append(FRAMEWORKS / f'{name}.framework/Modules/module.modulemap')
for name in ('Foundation', 'CryptoKit'):
    RUNTIME.append(FRAMEWORKS / f'{name}.framework/Modules/{name}.swiftmodule/arm64e-apple-macos.swiftinterface')


def digest(path):
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode) or (s.st_size and not s.st_blocks):
        raise ValueError(f'Unavailable resident input: {path}')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def source_path(value):
    p = Path(value)
    prefixes = [('platforms', 'native', 'ios-member'), ('verification', 'native-ios')]
    if p.is_absolute() or '..' in p.parts or p.suffix != '.swift' or not any(p.parts[:len(x)] == x for x in prefixes):
        raise ValueError(f'Expected an exact Swift source in the iOS member or verification directory: {value}')
    for parent in p.parents:
        if (ROOT / parent).is_symlink():
            raise ValueError(f'Linked source directory: {parent}')
    return ROOT / p


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    parser.add_argument('--suite', action='append', default=[])
    parser.add_argument('--async-suite', action='append', default=[])
    parser.add_argument('--objc-header', action='store_true',
                        help='Emit and bind the Swift Objective-C compatibility header for SoeMember')
    parser.add_argument('sources', nargs='+')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', args.run):
        parser.error('Use a new lowercase run name with hyphens')
    suites = args.suite + args.async_suite
    if not suites or len(set(suites)) != len(suites) or any(not re.fullmatch(r'runSoe[A-Za-z0-9]+Tests', name) for name in suites):
        parser.error('Supply distinct named Swift test suite functions')
    sources = [source_path(name) for name in args.sources]
    if len(set(sources)) != len(sources):
        parser.error('Duplicate source file')
    inputs = {str(p.relative_to(ROOT)): digest(p) for p in [Path(__file__).resolve(), *sources]}
    runtime = {str(p): digest(p) for p in RUNTIME}

    out = EVIDENCE / ('native-ios-' + args.run)
    out.mkdir(exist_ok=False)
    (out / 'tmp').mkdir()
    (out / 'modules').mkdir()
    sandbox = out / 'network-deny.sb'
    sandbox.write_text('(version 1)\n(allow default)\n(deny network*)\n')
    launcher = out / 'exec-swift.py'
    launcher.write_text(f'import os, sys\nos.execv({str(DRIVER)!r}, ["swiftc", *sys.argv[1:]])\n')
    entry = out / 'TestMain.swift'
    calls = [(name, 'try ' + name + '()') for name in args.suite]
    calls += [(name, 'try await ' + name + '()') for name in args.async_suite]
    entry.write_text('import Foundation\n\n@main\nstruct TestMain {\n    static func main() async {\n' +
                     ''.join(f'        do {{ {call} }} catch {{\n'
                             f'            FileHandle.standardError.write(Data("FAIL {name}: \\(error)\\n".utf8))\n'
                             '            exit(1)\n        }\n'
                             for name, call in calls) + '    }\n}\n')
    binary = out / 'test-suites'
    header = out / 'SoeMember-Swift.h'
    header_flags = ['-module-name', 'SoeMember', '-emit-objc-header-path', str(header)] if args.objc_header else []
    prefix = [str(SANDBOX), '-f', str(sandbox)]
    compiler = [*prefix, str(PYTHON), str(launcher)]
    env = {'PATH': str(DEV / 'usr/bin') + ':/usr/bin:/bin', 'HOME': str(Path.home()),
           'TMPDIR': str(out / 'tmp') + '/', 'DEVELOPER_DIR': str(DEV), 'SDKROOT': str(SDK),
           'SWIFT_DRIVER_SWIFT_FRONTEND_EXEC': str(DEV / 'usr/bin/swift-frontend'),
           'CLANG_MODULE_CACHE_PATH': str(out / 'modules')}
    report = {'status': 'RUNNING', 'target': TARGET, 'sdk': str(SDK), 'suites': suites,
              'scope': 'Actual resident Swift compile and synthetic Mac execution under an OS profile denying all network access. Selected SDK/tool bindings, not an iOS app, device or Keychain acceptance test.',
              'sourceHashes': inputs, 'runtimeHashes': runtime, 'generatedInputs': {}, 'steps': []}
    for path in (sandbox, launcher, entry):
        report['generatedInputs'][str(path.relative_to(ROOT))] = digest(path)

    def run_step(name, command, seconds):
        log = out / (name + '.log')
        start = time.monotonic()
        timed_out = False
        with log.open('xb') as handle:
            proc = subprocess.Popen(command, cwd=ROOT, env=env, stdout=handle, stderr=subprocess.STDOUT,
                                    start_new_session=True)
            try:
                proc.wait(timeout=seconds)
            except subprocess.TimeoutExpired:
                timed_out = True
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                proc.wait(timeout=10)
        row = {'name': name, 'argv': command, 'exitCode': proc.returncode, 'timedOut': timed_out,
               'seconds': round(time.monotonic() - start, 3), 'log': str(log.relative_to(ROOT)), 'logSha256': digest(log)}
        report['steps'].append(row)
        print(f'{name}: {proc.returncode} ({row["seconds"]}s)', flush=True)
        if proc.returncode != 0 or timed_out:
            print(log.read_text(errors='replace')[-8000:], flush=True)
            raise RuntimeError(f'{name} failed')
        return log

    try:
        deny_probe = ('import errno, socket\n'
                      'with socket.socket() as s:\n'
                      ' try: s.connect(("127.0.0.1", 9))\n'
                      ' except OSError as e: assert e.errno in (errno.EPERM, errno.EACCES), e\n'
                      ' else: raise RuntimeError("The OS allowed a network connection")\n')
        run_step('network-denial', [*prefix, str(PYTHON), '-c', deny_probe], 15)
        log = run_step('version', [*compiler, '-version'], 15)
        report['swiftVersion'] = log.read_text().splitlines()[0]
        run_step('compile', [*compiler, '-sdk', str(SDK), '-target', TARGET, '-tools-directory', str(DEV / 'usr/bin'),
                             '-module-cache-path', str(out / 'modules'), '-swift-version', '6', '-strict-concurrency=complete',
                             '-warnings-as-errors', '-parse-as-library', *header_flags,
                             '-o', str(binary), *map(str, sources), str(entry)], 120)
        report['binarySha256'] = digest(binary)
        if args.objc_header:
            report['objcHeader'] = {'path': str(header.relative_to(ROOT)), 'sha256': digest(header)}
        log = run_step('execute', [*prefix, str(binary)], 45)
        print(log.read_text()[-10000:], end='', flush=True)
        report['status'] = 'PASS'
    except Exception as exc:
        report['status'] = 'FAIL'
        report['failure'] = str(exc)
    finally:
        try:
            report['inputsUnchanged'] = all(digest(ROOT / p) == v for p, v in {**inputs, **report['generatedInputs']}.items())
            report['runtimeUnchanged'] = all(digest(Path(p)) == v for p, v in runtime.items())
            if not report['inputsUnchanged'] or not report['runtimeUnchanged']:
                report['status'] = 'FAIL'
        except (OSError, ValueError) as exc:
            report['status'] = 'FAIL'
            report['finalVerificationFailure'] = str(exc)
        receipt = out / 'receipt.json'
        receipt.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'status': report['status'], 'receipt': str(receipt.relative_to(ROOT))}), flush=True)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
