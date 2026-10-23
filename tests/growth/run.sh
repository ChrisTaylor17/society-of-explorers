#!/usr/bin/env bash
# Growth tests (checkout test mode, funnel events, /join SEO and copy). One bun process per file.
set -u
cd "$(dirname "$0")/../.."
rc=0
for f in tests/growth/g*.test.ts; do
  bun test --no-install "./$f" || rc=1
done
exit $rc
