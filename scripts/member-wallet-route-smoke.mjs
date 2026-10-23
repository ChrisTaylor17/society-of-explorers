#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const route = readFileSync(join(root, 'app/api/member/wallet/route.ts'), 'utf8');
const envExample = readFileSync(join(root, '.env.example'), 'utf8');
const packageJson = readFileSync(join(root, 'package.json'), 'utf8');
const operatorSmoke = readFileSync(join(root, 'scripts/operator-smoke.mjs'), 'utf8');
const docs = [
  readFileSync(join(root, 'docs/soe-operator-system.md'), 'utf8'),
  readFileSync(join(root, 'docs/soe-current-thread-handoff.md'), 'utf8'),
  readFileSync(join(root, 'docs/soe-privacy-threat-model.md'), 'utf8'),
  readFileSync(join(root, 'docs/soe-external-effect-route-inventory.md'), 'utf8'),
];

function appearsBefore(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex;
}

const checks = [
  {
    name: 'wallet route safely parses JSON before auth and db work',
    ok:
      route.includes('async function safeRequestJson') &&
      route.includes('const body = await safeRequestJson(req);') &&
      route.includes("return privateJson({ error: 'Invalid JSON body' }, { status: 400 });") &&
      appearsBefore(route, 'const body = await safeRequestJson(req);', 'getAuthenticatedMember(req)') &&
      appearsBefore(route, 'Invalid Ethereum address', 'getAuthenticatedMember(req)') &&
      appearsBefore(route, 'getAuthenticatedMember(req)', 'getSupabaseAdmin()'),
  },
  {
    name: 'wallet route rejects non-object bodies with a client error',
    ok:
      route.includes('function isRecord') &&
      route.includes('if (!isRecord(body))') &&
      route.includes("return privateJson({ error: 'Invalid body' }, { status: 400 });"),
  },
  {
    name: 'wallet route still enforces wallet ownership and normalization',
    ok:
      route.includes("return privateJson({ error: 'Cannot attach wallet to another member' }, { status: 403 });") &&
      route.includes('const normalizedWalletAddress = getAddress(walletAddress);') &&
      route.includes('memberId && memberId !== auth.memberId') &&
      !route.includes(".eq('id', memberId)") &&
      !route.includes('member_id: memberId') &&
      appearsBefore(route, 'Cannot attach wallet to another member', 'const normalizedWalletAddress = getAddress(walletAddress);'),
  },
  {
    name: 'wallet route checks duplicate ownership before wallet mutation',
    ok:
      route.includes("return privateJson({ error: 'Wallet is already attached to another member' }, { status: 409 });") &&
      route.includes(".eq('wallet_address', normalizedWalletAddress)") &&
      route.includes("from('members')") &&
      route.includes('.update({ wallet_address: normalizedWalletAddress })') &&
      route.includes(".eq('id', auth.memberId)") &&
      appearsBefore(route, "from('members')", 'Wallet is already attached to another member') &&
      appearsBefore(route, 'Wallet is already attached to another member', '.update({ wallet_address: normalizedWalletAddress })'),
  },
  {
    name: 'wallet route keeps responses private and avoids raw failure leakage',
    ok:
      route.includes('privateJson') &&
      !route.includes('NextResponse') &&
      !route.includes('console.error') &&
      !route.includes('String(error)') &&
      !route.includes('String(err)') &&
      !route.includes('error.message'),
  },
  {
    name: 'wallet route keeps membership NFT minting dynamically imported behind explicit opt-in',
    ok:
      envExample.includes('MEMBERSHIP_NFT_AUTO_MINT_ENABLED=false') &&
      route.includes("process.env.MEMBERSHIP_NFT_AUTO_MINT_ENABLED === 'true'") &&
      route.includes('if (autoMintEnabled && pendingMint)') &&
      route.includes("await import('@/lib/blockchain/membership')") &&
      route.includes('mintMembershipNFT({ walletAddress: normalizedWalletAddress') &&
      route.indexOf('MEMBERSHIP_NFT_AUTO_MINT_ENABLED') <
        route.indexOf("await import('@/lib/blockchain/membership')") &&
      route.indexOf('if (autoMintEnabled && pendingMint)') <
        route.indexOf("await import('@/lib/blockchain/membership')") &&
      !route.includes("import { mintMembershipNFT }") &&
      !route.includes('from "@/lib/blockchain/membership"') &&
      !route.includes("from '@/lib/blockchain/membership'"),
  },
  {
    name: 'wallet route mint boundary is recorded in local operator docs',
    ok: docs.every(
      (doc) =>
        doc.includes('MEMBERSHIP_NFT_AUTO_MINT_ENABLED') &&
        (doc.includes('member wallet') || doc.includes('Member wallet')),
    ),
  },
  {
    name: 'package and operator smoke include the wallet route guard',
    ok:
      packageJson.includes('"member:wallet-route:smoke"') &&
      operatorSmoke.includes("npm', 'run', 'member:wallet-route:smoke'"),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nMember wallet route smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nMember wallet route smoke passed.');
