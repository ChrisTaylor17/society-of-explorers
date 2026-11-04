# Preserved platform source

`account-handover/` contains all 300 files listed by `ACCOUNT_HANDOVER_SHA256.json`, copied from the app-bearing `soe-account-handover/candidate` without modification. `ACCOUNT_HANDOVER_HANDOFF.json` is the original handoff. `support/` preserves source build entry and boundary documentation from that same milestone.

The active native and Quest code lives outside this directory. Historical fictional identities, unrelated Meridian/prototype routes, local backend adapters and development instrumentation remain source evidence here; they are not the canonical app entry or an approved production service. The later account-authority folder is a model, not a full application, and was not imported as the product.

`../scripts/verify-import.py` verifies the complete preserved inventory and hashes, then records the active product manifest and native entry source dependency closure. Verification does not execute archived source or read account/session configuration.
