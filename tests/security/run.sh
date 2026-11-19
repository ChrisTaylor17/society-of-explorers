#!/usr/bin/env bash
# Runs each security test file in its own bun process (module mocks are per-process).
# --no-install stops bun from auto-installing packages; tests trap fetch too.
set -u
cd "$(dirname "$0")/../.."
rc=0
for f in \
  tests/security/s1-member-identity.test.ts \
  tests/security/s1b-body-member-routes.test.ts \
  tests/security/s1c-edge-wallet-cookie.test.ts \
  tests/security/s2-memory-isolation.test.ts \
  tests/security/s3-siwe-nonce.test.ts \
  tests/security/s4-rate-limit.test.ts \
  tests/security/s5-markdown-escape.test.ts \
  tests/security/s6-verdict-endpoint.test.ts \
  tests/security/s7-no-hardcoded-ref.test.ts \
  tests/security/s8-salon-message-load.test.ts \
  tests/security/s9-salon-message-post.test.ts \
  tests/security/s10-siwe-wallet-session.test.ts; do
  bun test --no-install "$f" || rc=1
done
exit $rc
