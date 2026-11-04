# Canonical web verification

This directory imports the regression drivers from the complete web milestone and its current discovery-search descendant. The drivers resolve the canonical app root directly, two levels above this directory. There is no recursive app-root symlink. `tooling/node_modules` and the root `node_modules` reuse existing local runtimes; no dependency installation is implied.

Run from this directory:

```sh
python3 scripts/build-offline.py --webpack --fixture-public-config
python3 scripts/run-root-tests.py --non-dom --output-name canonical-backend-tests
python3 scripts/run-backend-checks.py suites --output-dir evidence/canonical-suites
```

These wrappers start app/test code in a clean environment under `scripts/deny-build-network.cjs`. Invalid public build placeholders are fixtures, not issued credentials. Real account/provider/production calls remain prohibited. Browser scripts require explicitly configured already-installed Playwright and Chromium paths.

`evidence/` holds fresh local outputs and is ignored by Git. Source/test code is versioned; historical evidence stays in its original milestone directories. Older delivery/patch verifiers in `scripts/` describe those historical envelopes; they are not a canonical release gate and require their original metadata. Use canonical source provenance in `docs/integration/` and fresh acceptance results instead.

The exact reused JSDOM runtime currently has dataless files. `--non-dom` records the excluded suite list rather than claiming a complete DOM run. Built-browser checks cover their explicitly listed stories; they do not replace all excluded suites or device acceptance.
