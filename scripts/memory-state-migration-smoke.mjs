#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

const migrationPath = 'supabase/migrations/20260528_memory_consent_states.sql';
const migration = read(migrationPath);
const lowerMigration = migration.toLowerCase();
const consentPlan = read('docs/soe-memory-consent-plan.md');
const threatModel = read('docs/soe-privacy-threat-model.md');
const handoff = read('docs/soe-current-thread-handoff.md');
const operatorSystem = read('docs/soe-operator-system.md');
const packageJson = read('package.json');

const requiredColumns = [
  'status',
  'replacement_fact_id',
  'correction_note',
  'suppressed_at',
  'suppressed_reason',
  'last_member_reviewed_at',
];

const forbiddenPatterns = [
  'drop table',
  'truncate',
  'delete from public.user_semantic_memory',
  'delete from user_semantic_memory',
  'create table',
  'create function',
  'create or replace function',
];

const checks = [
  {
    name: 'memory consent state migration alters existing semantic memory table only',
    ok:
      migration.includes('ALTER TABLE public.user_semantic_memory') &&
      !forbiddenPatterns.some((pattern) => lowerMigration.includes(pattern)),
  },
  {
    name: 'migration adds explicit consent and audit columns',
    ok: requiredColumns.every((column) => migration.includes(column)),
  },
  {
    name: 'migration constrains retrieval states',
    ok:
      migration.includes('user_semantic_memory_status_check') &&
      ['active', 'corrected', 'retracted', 'do_not_use', 'expired'].every((state) =>
        migration.includes(`'${state}'`),
      ),
  },
  {
    name: 'migration links corrected facts to replacement facts',
    ok:
      migration.includes('user_semantic_memory_replacement_fact_id_fkey') &&
      migration.includes('FOREIGN KEY (replacement_fact_id)') &&
      migration.includes('ON DELETE SET NULL'),
  },
  {
    name: 'migration backfills legacy expired rows as excluded memory',
    ok:
      migration.includes("status = 'expired'") &&
      migration.includes('valid_until IS NOT NULL') &&
      migration.includes('legacy_valid_until_expiration'),
  },
  {
    name: 'migration creates active-only retrieval index',
    ok:
      migration.includes('idx_semantic_retrievable') &&
      migration.includes('valid_until IS NULL') &&
      migration.includes("status = 'active'") &&
      migration.includes('suppressed_at IS NULL'),
  },
  {
    name: 'docs mark migration as approval-gated local draft',
    ok:
      consentPlan.includes(migrationPath) &&
      consentPlan.includes('not approved for production') &&
      threatModel.includes('memory consent state migration draft') &&
      handoff.includes('memory consent state migration draft') &&
      operatorSystem.includes('memory:state-migration:smoke'),
  },
  {
    name: 'package exposes migration smoke guard',
    ok: packageJson.includes('"memory:state-migration:smoke"'),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nMemory state migration smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nMemory state migration smoke passed.');
