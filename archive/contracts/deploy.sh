#!/usr/bin/env bash
# ==============================================================
#  deploy.sh — Society of Explorers one-command deployer
#
#  Usage:
#    1. Copy .env.example → .env  and fill in PRIVATE_KEY
#    2. chmod +x deploy.sh
#    3. ./deploy.sh
#
#  What this script does:
#    ✓ Installs Foundry if not present
#    ✓ Installs OpenZeppelin contracts
#    ✓ Compiles MockSOE + RitualMarketplace
#    ✓ Deploys both to Base Sepolia
#    ✓ Captures deployed addresses
#    ✓ Updates app/lib/contracts.ts
#    ✓ git add -A && git commit && git push
#    ✓ vercel --prod --yes
# ==============================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${BOLD}[SOE]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
die()     { echo -e "${RED}[✗] $*${NC}"; exit 1; }

# ── Load .env ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  die ".env not found. Copy .env.example → .env and fill in PRIVATE_KEY."
fi

# shellcheck disable=SC2046
export $(grep -v '^#' .env | grep -v '^$' | xargs)

if [[ -z "${PRIVATE_KEY:-}" || "$PRIVATE_KEY" == "0xyour_private_key_here" ]]; then
  die "PRIVATE_KEY is not set in .env. Add your Base Sepolia wallet private key."
fi

info "Starting Society of Explorers deployment to Base Sepolia..."

# ── 1. Install Foundry if needed ──────────────────────────────
if ! command -v forge &>/dev/null; then
  info "Foundry not found — installing..."
  curl -L https://foundry.paradigm.xyz | bash
  # shellcheck disable=SC1090
  source "$HOME/.bashrc" 2>/dev/null || source "$HOME/.zshrc" 2>/dev/null || true
  foundryup
  success "Foundry installed."
else
  success "Foundry $(forge --version | head -1) found."
fi

# ── 2. Install OpenZeppelin ───────────────────────────────────
if [[ ! -d lib/openzeppelin-contracts ]]; then
  info "Installing OpenZeppelin contracts..."
  forge install OpenZeppelin/openzeppelin-contracts --no-git
  success "OpenZeppelin installed."
else
  success "OpenZeppelin already installed."
fi

# ── 3. Compile ────────────────────────────────────────────────
info "Compiling contracts..."
forge build --sizes
success "Compilation successful."

# ── 4. Deploy ─────────────────────────────────────────────────
RPC_URL="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
info "Deploying to Base Sepolia (RPC: $RPC_URL)..."

DEPLOY_OUTPUT=$(forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --verify \
  -vvvv 2>&1)

echo "$DEPLOY_OUTPUT"

# ── 5. Parse deployed addresses ───────────────────────────────
MARKETPLACE_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oP 'RitualMarketplace deployed at: \K0x[0-9a-fA-F]{40}')
SOE_ADDRESS=$(echo "$DEPLOY_OUTPUT"         | grep -oP 'MockSOE deployed at: \K0x[0-9a-fA-F]{40}')

if [[ -z "$MARKETPLACE_ADDRESS" ]]; then
  # Fallback: try to read from broadcast JSON
  BROADCAST_JSON=$(find broadcast -name "run-latest.json" | head -1)
  if [[ -n "$BROADCAST_JSON" ]]; then
    MARKETPLACE_ADDRESS=$(python3 -c "
import json, sys
data = json.load(open('$BROADCAST_JSON'))
txs = data.get('transactions', [])
for tx in reversed(txs):
    if tx.get('contractName') == 'RitualMarketplace' and tx.get('contractAddress'):
        print(tx['contractAddress'])
        sys.exit(0)
print('')
")
    SOE_ADDRESS=$(python3 -c "
import json, sys
data = json.load(open('$BROADCAST_JSON'))
txs = data.get('transactions', [])
for tx in txs:
    if tx.get('contractName') == 'MockSOE' and tx.get('contractAddress'):
        print(tx['contractAddress'])
        sys.exit(0)
print('')
")
  fi
fi

if [[ -z "$MARKETPLACE_ADDRESS" ]]; then
  die "Could not parse RitualMarketplace address from deploy output. Check the broadcast folder manually."
fi

success "MockSOE deployed at:          $SOE_ADDRESS"
success "RitualMarketplace deployed at: $MARKETPLACE_ADDRESS"

# ── 6. Update contracts.ts ────────────────────────────────────
info "Updating app/lib/contracts.ts with live addresses..."

# Replace the marketplace placeholder
sed -i.bak "s|'0x0000000000000000000000000000000000000000' // TODO: replace after deploy|'$MARKETPLACE_ADDRESS'|" \
  app/lib/contracts.ts

# Only the first occurrence is the marketplace address — now do the SOE token (second occurrence)
# Use Python for reliable multi-occurrence replacement
python3 - <<EOF
import re

with open('app/lib/contracts.ts', 'r') as f:
    content = f.read()

# Replace first occurrence → marketplace (already done by sed above)
# Now replace the second occurrence → SOE token
# (after sed, first is real address, second is still placeholder)
content = content.replace(
    "'0x0000000000000000000000000000000000000000' // TODO: replace after deploy",
    "'$SOE_ADDRESS'",
    1  # only the remaining one
)

with open('app/lib/contracts.ts', 'w') as f:
    f.write(content)

print("contracts.ts updated successfully.")
EOF

rm -f app/lib/contracts.ts.bak
success "contracts.ts updated."

# ── 7. Git commit & push ──────────────────────────────────────
info "Committing and pushing..."
git add -A
git commit -m "Deploy RitualMarketplace to Base Sepolia and connect frontend

MockSOE (testnet \$SOE): $SOE_ADDRESS
RitualMarketplace:       $MARKETPLACE_ADDRESS
Network: Base Sepolia (chain ID 84532)"
git push
success "Pushed to remote."

# ── 8. Vercel production deploy ───────────────────────────────
if command -v vercel &>/dev/null; then
  info "Deploying to Vercel..."
  VERCEL_URL=$(vercel --prod --yes 2>&1 | grep -oP 'https://\S+' | tail -1)
  success "Vercel deploy complete: $VERCEL_URL"
else
  warn "Vercel CLI not found. Run: npm i -g vercel && vercel --prod --yes"
  VERCEL_URL="(run vercel --prod --yes)"
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}=================================================${NC}"
echo -e "${GREEN}${BOLD}  CONTRACT LIVE ON BASE${NC}"
echo -e "${GREEN}${BOLD}=================================================${NC}"
echo -e "  MockSOE:          ${BOLD}$SOE_ADDRESS${NC}"
echo -e "  RitualMarketplace:${BOLD}$MARKETPLACE_ADDRESS${NC}"
echo -e "  Live site:        ${BOLD}$VERCEL_URL${NC}"
echo -e "${GREEN}${BOLD}=================================================${NC}"
