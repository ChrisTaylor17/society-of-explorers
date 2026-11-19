# Society of Explorers platforms

`native/` is the active Expo member entry. `quest/` is the active member Circle browser host used by the canonical web Quest route. Both reuse `shared/archive.ts`, which imports the canonical web discussion parser and UUID contract. They share the same archive, thread roots, tombstones and cursor rules.

The complete 300-file app-bearing source from the prior task is preserved byte for byte in `source/account-handover/`. It includes the historical synthetic app, Android project and XR prototypes. It is provenance, not the default product experience. The account-authority security model is not substituted for the app.

Run local checks from the repository root:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/christaylor python3 platforms/scripts/checks.py
```

This uses existing installed tooling and blocks external network access from application/test startup. It does not install dependencies or verify a signed native binary, real provider account or headset. The native runtime currently contains offloaded files; consult `evidence/native-runtime-readiness.json` before attempting exports.

See [the integration report](../docs/integration/platform-integration.md) for exact scope, evidence and release gates.
