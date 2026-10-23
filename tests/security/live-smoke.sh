#!/usr/bin/env bash
# Live HTTP smoke test for security rounds 1-3 against a deployed URL (preview or production).
# Anonymous requests only: no secrets, no member data, nothing written on success paths.
# Usage:  BASE_URL=https://<deployment>.vercel.app bash tests/security/live-smoke.sh
# Preview deployments on this project are behind Vercel Authentication. If so, export
# VERCEL_AUTOMATION_BYPASS_SECRET in your shell first (never commit it, never echo it);
# it is sent as the x-vercel-protection-bypass header and is not printed.
set -u
: "${BASE_URL:?set BASE_URL}"
H=()
if [ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]; then H=(-H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}"); fi
pass=0; fail=0
FAKE=22222222-2222-4222-8222-222222222222   # fictional member id
check() { # name expected_codes method path [json]
  local name=$1 want=$2 method=$3 path=$4 data=${5:-}
  local args=(-s -o /dev/null -w '%{http_code}' -X "$method" "${H[@]}" -H 'content-type: application/json' --max-time 30)
  [ -n "$data" ] && args+=(--data "$data")
  local got; got=$(curl "${args[@]}" "$BASE_URL$path")
  if [[ ",$want," == *",$got,"* ]]; then echo "PASS $name ($got)"; pass=$((pass+1)); else echo "FAIL $name (got $got, want $want)"; fail=$((fail+1)); fi
}
# S9 round 3: anonymous post into a salon, impersonating a name -> 401, nothing written
check "S9 salon-message POST anon"            401     POST /api/salon-message '{"salon_id":"general","content":"smoke","sender_name":"Jules Example"}'
# S9 with a forged raw soe_wallet_id cookie -> 401
H2=("${H[@]}"); H=("${H2[@]}" -H "cookie: soe_wallet_id=$FAKE")
check "S9 salon-message POST raw cookie"      401     POST /api/salon-message '{"salon_id":"general","content":"smoke"}'
check "S1 thinker memory POST raw cookie"     401     POST /api/thinker/memory "{\"memberId\":\"$FAKE\"}"
H=("${H2[@]}")
# S8 round 2: anonymous read of someone's private salon -> 401
check "S8 salon-message/load private anon"   401     GET  "/api/salon-message/load?salonId=private-$FAKE"
# S6 round 1: anonymous verdict with a body memberId -> 401 before any model call
check "S6 council/verdict anon"               401     POST /api/council/verdict "{\"memberId\":\"$FAKE\",\"sessionId\":\"smoke\",\"messages\":[]}"
# S1b round 2: body memberId is not identity
check "S1b exp/award body memberId"           401     POST /api/exp/award "{\"memberId\":\"$FAKE\",\"amount\":1}"
check "S1b tasks body memberId"               401     POST /api/tasks "{\"memberId\":\"$FAKE\",\"title\":\"smoke\"}"
# S3 round 2: SIWE verify without a nonce cookie is rejected (400/401), and 503 means the secret is missing
check "S3 siwe without nonce cookie"          400,401 POST /api/auth/siwe '{"message":"x","signature":"0x00"}'
check "S3 nonce route works (secret set)"     200     GET  /api/auth/nonce
# Public pages still load
check "home page"                             200     GET  /
echo "live-smoke: $pass pass, $fail fail against $BASE_URL"
[ "$fail" -eq 0 ]
