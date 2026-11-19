#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import vm from 'node:vm';
import * as ts from 'typescript';
import { Wallet, getBytes } from 'ethers';

const root = process.cwd();
const nodeRequire = createRequire(import.meta.url);
const moduleCache = new Map();

const sandbox = {
  Buffer,
  TextDecoder,
  TextEncoder,
  btoa,
  console,
  crypto: globalThis.crypto,
  process,
  window: undefined,
};

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function resolveProjectSpecifier(specifier, parentPath) {
  if (specifier.startsWith('@/')) return `${specifier.slice(2)}.ts`;
  if (specifier.startsWith('../') || specifier.startsWith('./')) {
    const parentParts = parentPath.split('/');
    parentParts.pop();
    return `${join(...parentParts, specifier).replaceAll('\\', '/')}.ts`;
  }
  return null;
}

function loadTsModule(relativePath) {
  const normalized = relative(root, join(root, relativePath)).replaceAll('\\', '/');
  if (moduleCache.has(normalized)) return moduleCache.get(normalized).exports;

  const source = read(normalized);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      baseUrl: root,
      paths: {
        '@/*': ['./*'],
      },
    },
  });

  const cjsModule = { exports: {} };
  moduleCache.set(normalized, cjsModule);

  const localRequire = (specifier) => {
    const projectPath = resolveProjectSpecifier(specifier, normalized);
    if (projectPath === 'lib/supabase/admin.ts') {
      return { getSupabaseAdmin: () => { throw new Error('Supabase admin must not be used in wallet-seal smoke.'); } };
    }
    if (projectPath) return loadTsModule(projectPath);
    if (specifier === 'crypto') return nodeRequire('crypto');
    throw new Error(`Unexpected external module in wallet-seal smoke: ${specifier}`);
  };

  vm.runInNewContext(
    compiled.outputText,
    {
      ...sandbox,
      exports: cjsModule.exports,
      module: cjsModule,
      require: localRequire,
    },
    { filename: normalized },
  );

  return cjsModule.exports;
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function packageScripts() {
  return JSON.parse(read('package.json')).scripts || {};
}

async function runWalletSealFlow() {
  const testMemberId = '00000000-0000-4000-8000-000000000001';
  const testOrigin = 'http://localhost:3000';
  const testClientUpdatedAt = '2026-05-26T00:00:00.000Z';
  const wallet = Wallet.createRandom();
  const address = await wallet.getAddress();
  const provider = {
    async request(args) {
      if (args.method === 'eth_requestAccounts') return [address];

      if (args.method === 'personal_sign') {
        const params = Array.isArray(args.params) ? args.params : [];
        const messageHex = String(params[0] || '');
        return wallet.signMessage(getBytes(messageHex));
      }

      throw new Error(`Unexpected mock wallet method: ${args.method}`);
    },
  };

  sandbox.window = {
    ethereum: provider,
    localStorage: new MemoryStorage(),
  };

  const {
    getOrCreateWalletPodDeviceId,
    sealPayloadWithWalletPodKey,
  } = loadTsModule('lib/movement/walletPodCrypto.ts');
  const { verifyPodExportEnvelope } = loadTsModule('lib/movement/podExportVerification.ts');
  const { buildPodSealReceipt } = loadTsModule('lib/movement/podReceipt.ts');

  const deviceId = getOrCreateWalletPodDeviceId();
  const sealed = await sealPayloadWithWalletPodKey({
    payload: {
      version: 1,
      generated_at: testClientUpdatedAt,
      member: { id: testMemberId },
      practice_responses: [{ id: 'response-1', response_text: 'A private thought.' }],
    },
    memberId: testMemberId,
    baseSyncVersion: 0,
    deviceId,
    clientUpdatedAt: testClientUpdatedAt,
    origin: testOrigin,
  });

  assert(sealed.address.toLowerCase() === address.toLowerCase(), 'sealed address should match mock wallet');
  assert(sealed.envelope.metadata?.key_mode === 'client_wallet_derived', 'key mode should be wallet-derived');
  assert(sealed.envelope.metadata?.wallet_signature_stored === false, 'raw wallet signature must not be marked stored');
  assert(!('wallet_signature' in (sealed.envelope.metadata || {})), 'raw wallet signature must not be stored in metadata');
  assert(typeof sealed.envelope.metadata?.wallet_signature_hash === 'string', 'wallet signature hash must be recorded');
  assert(sealed.envelope.metadata?.base_sync_version === 0, 'base sync version must be exported for verification');

  const exportEnvelope = {
    kind: 'society-of-explorers.encrypted-pod',
    member_id: testMemberId,
    version: sealed.envelope.version,
    algorithm: 'AES-256-GCM',
    key_mode: 'client_wallet_derived',
    custody_status: 'Wallet-derived client key',
    sovereignty_status: 'Client-attested wallet custody',
    custody_verification: 'wallet_signature_attested',
    ciphertext_encoding: sealed.envelope.ciphertext_encoding,
    ciphertext: sealed.envelope.ciphertext,
    iv: sealed.envelope.iv,
    last_commitment_hash: sealed.envelope.commitment_hash,
    last_committed_at: testClientUpdatedAt,
    updated_at: testClientUpdatedAt,
    sync_version: 1,
    sync_device_id: sealed.envelope.device_id,
    sync_client_updated_at: sealed.envelope.client_updated_at,
    sync_status: 'accepted',
    sync_conflict_count: 0,
    sync_metadata: sealed.envelope.metadata,
  };

  const verification = await verifyPodExportEnvelope(exportEnvelope);
  assert(verification.status === 'valid', `pod export verification should be valid, got ${verification.status}`);

  const receipt = buildPodSealReceipt({
    memberId: testMemberId,
    issuedAt: testClientUpdatedAt,
    pod: {
      ciphertext: sealed.envelope.ciphertext,
      version: sealed.envelope.version,
      last_commitment_hash: sealed.envelope.commitment_hash,
      last_committed_at: testClientUpdatedAt,
      updated_at: testClientUpdatedAt,
      sync_version: 1,
      sync_device_id: sealed.envelope.device_id,
      sync_client_updated_at: sealed.envelope.client_updated_at,
      sync_status: 'accepted',
      sync_conflict_count: 0,
      sync_metadata: sealed.envelope.metadata,
    },
  });
  const receiptVerification = await verifyPodExportEnvelope(receipt);
  assert(
    receiptVerification.status === 'valid',
    `pod seal receipt verification should be valid, got ${receiptVerification.status}`,
  );

  return {
    address_hash: sealed.addressHash,
    commitment_hash: sealed.envelope.commitment_hash,
    receipt_hash: receipt.receipt_hash,
    verification: verification.status,
    receipt_verification: receiptVerification.status,
    custody: verification.custody,
    attestation: verification.attestation,
  };
}

const checks = [
  {
    name: 'package script exposes pod wallet seal smoke',
    ok: packageScripts()['pod:wallet-seal:smoke'] === 'node scripts/pod-wallet-seal-smoke.mjs',
  },
  {
    name: 'operator smoke runs pod wallet seal smoke',
    ok: read('scripts/operator-smoke.mjs').includes("command: ['npm', 'run', 'pod:wallet-seal:smoke']"),
  },
  {
    name: 'operator docs reference pod wallet seal smoke',
    ok: [
      'docs/soe-operator-system.md',
      'docs/soe-privacy-threat-model.md',
      'docs/soe-current-thread-handoff.md',
      'docs/92b-capital-launch-runbook.md',
    ].every((docPath) => read(docPath).includes('pod:wallet-seal:smoke')),
  },
];

async function main() {
  const flowResult = await runWalletSealFlow();
  checks.unshift({
    name: 'wallet-derived pod export and receipt verify without raw wallet signature storage',
    ok:
      flowResult.verification === 'valid' &&
      flowResult.receipt_verification === 'valid' &&
      flowResult.custody === 'client_wallet_derived' &&
      flowResult.attestation === 'wallet_signature_attested',
  });

  const failures = checks.filter((check) => !check.ok);

  for (const check of checks) {
    console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
  }

  if (failures.length > 0) {
    console.error(`\nPod wallet seal smoke failed: ${failures.length} check(s) failed.`);
    process.exit(1);
  }

  console.log('\nPod wallet seal smoke passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
