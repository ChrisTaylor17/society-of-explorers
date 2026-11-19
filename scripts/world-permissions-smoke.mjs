#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import * as ts from 'typescript';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function loadPermissionsModule() {
  const source = read('lib/world/permissions.ts');
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
  const require = (specifier) => {
    if (specifier === '@/lib/auth/getSession') {
      return { getMemberSession: async () => null };
    }
    if (specifier === '@/lib/supabase/server') {
      return { createClient: async () => ({}) };
    }
    throw new Error(`Unexpected module in world permissions smoke: ${specifier}`);
  };
  vm.runInNewContext(compiled.outputText, {
    module: cjsModule,
    exports: cjsModule.exports,
    require,
  });
  return cjsModule.exports;
}

const { isHostedByCurrentMember } = loadPermissionsModule();
const source = read('lib/world/permissions.ts');
const packageJson = JSON.parse(read('package.json'));
const operatorSmoke = read('scripts/operator-smoke.mjs');
const docs = [
  'docs/soe-operator-system.md',
  'docs/soe-privacy-threat-model.md',
  'docs/soe-current-thread-handoff.md',
  'docs/92b-capital-launch-runbook.md',
];

const member = {
  id: 'member-123',
  supabase_auth_id: 'auth-456',
};

const checks = [
  {
    name: 'host helper allows member id ownership',
    ok: isHostedByCurrentMember('member-123', member) === true,
  },
  {
    name: 'host helper allows supabase auth ownership',
    ok: isHostedByCurrentMember('auth-456', member) === true,
  },
  {
    name: 'host helper rejects unrelated host ids',
    ok: isHostedByCurrentMember('someone-else', member) === false,
  },
  {
    name: 'space access uses shared host helper for archived or pending spaces',
    ok: source.includes('const isHost = isHostedByCurrentMember(space.host_id, session.member);'),
  },
  {
    name: 'space permissions use the server supabase client',
    ok:
      source.includes("import { createClient } from '@/lib/supabase/server';") &&
      source.includes('const supabase = await createClient();'),
  },
  {
    name: 'grant access uses shared host helper',
    ok: source.includes('if (!isHostedByCurrentMember(space.host_id, session.member)) {'),
  },
  {
    name: 'grant access fails closed until a collaborator schema exists',
    ok:
      source.includes("if (!targetMemberId.trim()) return { success: false, error: 'Target member is required' };") &&
      source.includes("return { success: false, error: 'Space collaboration access is not configured' };") &&
      !source.includes('return { success: true };'),
  },
  {
    name: 'package scripts expose the world permissions smoke test',
    ok: packageJson.scripts?.['world:permissions:smoke'] === 'node scripts/world-permissions-smoke.mjs',
  },
  {
    name: 'operator smoke runs the world permissions smoke test',
    ok: operatorSmoke.includes("command: ['npm', 'run', 'world:permissions:smoke']"),
  },
  {
    name: 'operator docs reference the world permissions smoke test',
    ok: docs.every((docPath) => read(docPath).includes('world:permissions:smoke')),
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}`);
}

if (failures.length > 0) {
  console.error(`\nWorld permissions smoke failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nWorld permissions smoke passed.');
