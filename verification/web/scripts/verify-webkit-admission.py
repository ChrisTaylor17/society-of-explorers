#!/usr/bin/env python3
"""Run the compiled frontend in resident macOS WebKit against disposable SQL.

Uses resident tools only. The local fixture owns a pinned, ephemeral TLS leaf;
it never adds that leaf to an operating-system trust store.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time


def digest(path):
    info = path.lstat()
    if not path.is_file() or path.is_symlink() or info.st_size and not info.st_blocks:
        raise RuntimeError("Linked or unavailable verification input: " + str(path))
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sdk", type=Path,
                        default=Path("/Library/Developer/CommandLineTools/SDKs/MacOSX27.2.sdk"))
    parser.add_argument("--calibrate-failure", action="store_true",
                        help="Deliberately fail after SQL startup and compiled-page hydration")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if (output / "result.json").exists():
        raise RuntimeError("Refuse to overwrite an earlier verification result")
    report = {"status": "FAIL", "startedAt": time.time(), "scope":
              "Resident macOS WKWebView; actual compiled frontend and local source auth/admission handlers. "
              "Synthetic wallets, lifecycle, provider/PostgREST and API dispatch. No deployed middleware, "
              "hosted service, Safari UI, native mobile app or physical device acceptance."}
    manifest = root / "verification/web/evidence/webkit-admission-build-source-sha256.json"
    expected = json.loads(manifest.read_text())
    names = set(expected)
    names.update(str(p.relative_to(root)) for pattern in ["docs/sql/*.sql", "verification/web/tests/support/*.mjs"]
                 for p in root.glob(pattern))
    names.update([str(Path(__file__).relative_to(root)),
                  "verification/web/scripts/webkit-admission-fixture.mjs",
                  "verification/web/scripts/built-shell-network-guard.cjs",
                  "verification/web/scripts/build-offline.py", "verification/web/tests/webkit-admission.swift",
                  str(manifest.relative_to(root))])
    before = {name: digest(root / name) for name in sorted(names)}
    if any(before[name] != value for name, value in expected.items()):
        raise RuntimeError("Compiled product source no longer matches its build receipt")
    build_before = {str(p.relative_to(root / ".next")): digest(p)
                    for p in sorted((root / ".next").rglob("*")) if p.is_file()}
    node = Path(shutil.which("node")).resolve()
    compiler_entry = Path("/Library/Developer/CommandLineTools/usr/bin/swiftc")
    compiler = compiler_entry.resolve()
    sdk = args.sdk.resolve()
    report["runtime"] = {str(node): digest(node), str(compiler): digest(compiler),
                         str(sdk / "SDKSettings.json"): digest(sdk / "SDKSettings.json")}
    report["failureCalibration"] = args.calibrate_failure
    binary = output / "webkit-admission"
    work = Path(tempfile.mkdtemp(prefix="soe-webkit-admission.", dir="/private/tmp"))
    report["privateFixtureDirectory"] = str(work)
    with socket.socket() as free_port:
        free_port.bind(("127.0.0.1", 0))
        port = free_port.getsockname()[1]
    env = {"PATH": "/opt/homebrew/bin:/usr/bin:/bin", "HOME": str(Path.home()),
           "NODE_ENV": "production", "NEXT_TELEMETRY_DISABLED": "1",
           "SOE_BUILT_SHELL_PORT": str(port), "SOE_BUILT_SHELL_RUNTIME_RECEIPT": str(output / "runtime.json")}
    server = None
    try:
        # The swiftc entry-point name selects compiler mode; hash its resolved
        # binary without replacing argv[0] with the shared frontend's filename.
        command = [str(compiler_entry), "-parse-as-library", "-sdk", str(sdk),
                   "-target", "arm64-apple-macosx14.0", "-module-cache-path",
                   str(output.parent / "swift-module-cache"), "-framework", "AppKit", "-framework", "WebKit",
                   "-framework", "Security", str(root / "verification/web/tests/webkit-admission.swift"), "-o", str(binary)]
        with (output / "compile.log").open("w") as log:
            compiled = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=log, timeout=120)
        report["compilation"] = {"command": command, "exitCode": compiled.returncode,
                                 "sourceSha256": before["verification/web/tests/webkit-admission.swift"]}
        if compiled.returncode:
            raise RuntimeError("Resident Swift compilation failed; inspect compile.log")
        report["runtime"][str(binary)] = digest(binary)
        with (output / "certificate.log").open("w") as log:
            subprocess.run(["/usr/bin/openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                            "-keyout", str(work / "fixture.key"), "-out", str(work / "fixture.pem"),
                            "-days", "1", "-subj", "/CN=127.0.0.1"], env=env,
                           stdout=log, stderr=log, check=True, timeout=20)
            os.chmod(work / "fixture.key", 0o600)
            subprocess.run(["/usr/bin/openssl", "x509", "-in", str(work / "fixture.pem"),
                            "-outform", "DER", "-out", str(work / "fixture.der")], env=env,
                           stdout=log, stderr=log, check=True, timeout=20)
        report["certificateSha256"] = digest(work / "fixture.der")
        with (output / "server.log").open("w") as log:
            server = subprocess.Popen([str(node), "--require", str(root / "verification/web/scripts/built-shell-network-guard.cjs"),
                                       str(root / "verification/web/scripts/webkit-admission-fixture.mjs"), str(work)],
                                      cwd=root, env=env, stdout=log, stderr=log)
            deadline = time.monotonic() + 60
            while not (work / "fixture-ready.json").exists():
                if server.poll() is not None:
                    raise RuntimeError("Owned fixture exited before readiness; inspect server.log")
                if time.monotonic() > deadline:
                    raise RuntimeError("Owned fixture did not become ready within 60 seconds")
                time.sleep(0.1)
            ready = json.loads((work / "fixture-ready.json").read_text())
            if ready["pid"] != server.pid:
                raise RuntimeError("Fixture PID does not match the owned child")
            report["fixture"] = ready
            print("Owned local SQL/HTTPS fixture ready", flush=True)
            with (output / "browser.json").open("w") as browser, (output / "browser.log").open("w") as errors:
                result = subprocess.run([str(binary), str(work)] + (["--calibrate-failure"] if args.calibrate_failure else []), env=env, cwd=root,
                                        stdout=browser, stderr=errors, timeout=180)
            report["browserExitCode"] = result.returncode
            if result.returncode:
                raise RuntimeError("WebKit did not pass; inspect browser.log")
            browser = json.loads((output / "browser.json").read_text())
            if browser["status"] != "PASS" or len(browser["stories"]) != 8 or browser["buildId"] != ready["buildId"]:
                raise RuntimeError("Incomplete or mismatched WebKit result")
            report["stories"] = browser["stories"]
    except Exception as error:
        report["error"] = str(error)
    finally:
        if server is not None:
            if server.poll() is None:
                server.terminate()
                try:
                    server.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=10)
                    report["error"] = "Owned fixture required forced termination"
            report["serverExitCode"] = server.returncode
        try:
            after = {name: digest(root / name) for name in sorted(names)}
            build_after = {str(p.relative_to(root / ".next")): digest(p)
                           for p in sorted((root / ".next").rglob("*")) if p.is_file()}
            report["sourceUnchanged"] = before == after
            report["compiledBuildUnchanged"] = build_before == build_after
            save(output / "source-sha256.json", after)
            save(output / "compiled-build-sha256.json", build_after)
            if not report["sourceUnchanged"] or not report["compiledBuildUnchanged"]:
                raise RuntimeError("Source or compiled build changed during verification")
            stopped = json.loads((work / "fixture-stopped.json").read_text())
            report["database"] = {key: stopped[key] for key in
                                  ["members", "invitationRevision", "usedChallenges", "revokedSessions"]}
            save(output / "fixture-stopped.json", stopped)
            actors = report["fixture"]["actors"]
            expected_members = [actors["host"]["memberId"]] if args.calibrate_failure else [actors["host"]["memberId"], actors["recipient"]["memberId"]]
            if stopped["members"] != sorted(expected_members):
                raise RuntimeError("Final SQL membership differs from the two approved actors")
            revision, sessions = (1, 0) if args.calibrate_failure else (2, 3)
            if stopped["invitationRevision"] != revision or stopped["usedChallenges"] != sessions or stopped["revokedSessions"] != sessions:
                raise RuntimeError("Final SQL revision or wallet revocation invariant failed")
            runtime = json.loads((output / "runtime.json").read_text())
            if stopped["failures"] or stopped["denied"] or runtime["denied"] or server.returncode:
                raise RuntimeError("Fixture, runtime guard or owned shutdown failed")
            for name, value in runtime["runtimeHashes"].items():
                if digest(Path(name)) != value:
                    raise RuntimeError("Loaded runtime changed: " + name)
            for name, value in report["runtime"].items():
                if digest(Path(name)) != value:
                    raise RuntimeError("Verification compiler or browser binary changed: " + name)
            report["runtimeUnchanged"] = True
            if "error" not in report and report.get("browserExitCode") == 0:
                report["status"] = "PASS"
        except Exception as error:
            report.setdefault("error", str(error))
        report["finishedAt"] = time.time()
        save(output / "result.json", report)
    print(json.dumps({"status": report["status"], "error": report.get("error"), "result": str(output / "result.json")}))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(run())
