import { spawnSync } from 'node:child_process';

const allowedArgs = new Set(['--with-routes', '--list']);
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));

if (unknownArgs.length > 0) {
  console.error(`Unknown operator smoke argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: npm run operator:smoke -- [--list] [--with-routes]');
  process.exit(1);
}

const includeRoutes = args.includes('--with-routes');
const listOnly = args.includes('--list');
const DEFAULT_STEP_TIMEOUT_MS = 120_000;
const MAX_STEP_TIMEOUT_MS = 600_000;

function resolveStepTimeoutMs(value) {
  if (!value) {
    return DEFAULT_STEP_TIMEOUT_MS;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 5_000 || parsed > MAX_STEP_TIMEOUT_MS) {
    throw new Error(`OPERATOR_SMOKE_STEP_TIMEOUT_MS must be a finite number between 5000 and ${MAX_STEP_TIMEOUT_MS}.`);
  }

  return Math.trunc(parsed);
}

let stepTimeoutMs;
try {
  stepTimeoutMs = resolveStepTimeoutMs(process.env.OPERATOR_SMOKE_STEP_TIMEOUT_MS);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function commandText(step) {
  return step.command.join(' ');
}

function validateOperatorPlan(plan) {
  const failures = [];

  if (commandText(plan[0] ?? { command: [] }) !== 'npm run operator:script-boundary:smoke') {
    failures.push('operator:script-boundary:smoke must be the first operator smoke step');
  }

  if (commandText(plan[1] ?? { command: [] }) !== 'npm run operator:manifest:smoke') {
    failures.push('operator:manifest:smoke must be the second operator smoke step');
  }

  const seenCommands = new Set();
  const seenLabels = new Set();
  for (const step of plan) {
    if (typeof step.label !== 'string' || step.label.trim() === '') {
      failures.push('operator smoke steps must have non-empty labels');
    } else if (seenLabels.has(step.label)) {
      failures.push(`operator smoke step label is duplicated: ${step.label}`);
    }
    seenLabels.add(step.label);

    if (step.command.length !== 3 || step.command[0] !== 'npm' || step.command[1] !== 'run') {
      failures.push(`${step.label} must use an npm run smoke command`);
    }

    const text = commandText(step);
    if (seenCommands.has(text)) {
      failures.push(`${step.label} duplicates operator smoke command ${text}`);
    }
    seenCommands.add(text);
  }

  if (failures.length > 0) {
    console.error('Operator smoke plan invalid:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

const steps = [
  {
    label: 'Operator script boundary',
    command: ['npm', 'run', 'operator:script-boundary:smoke'],
  },
  {
    label: 'Operator smoke manifest',
    command: ['npm', 'run', 'operator:manifest:smoke'],
  },
  {
    label: 'Prompt Atlas safety manifest',
    command: ['npm', 'run', 'prompt-atlas:verify'],
  },
  {
    label: 'Capital preflight contract',
    command: ['npm', 'run', 'capital:preflight:smoke'],
  },
  {
    label: 'Capital metadata privacy',
    command: ['npm', 'run', 'capital:metadata:smoke'],
  },
  {
    label: 'Capital checkout safety',
    command: ['npm', 'run', 'capital:checkout-safety:smoke'],
  },
  {
    label: 'Capital funding conversion',
    command: ['npm', 'run', 'capital:funding-conversion:smoke'],
  },
  {
    label: 'Membership billing integrity',
    command: ['npm', 'run', 'membership:billing:smoke'],
  },
  {
    label: 'Capital webhook safety',
    command: ['npm', 'run', 'capital:webhook-safety:smoke'],
  },
  {
    label: 'Capital webhook dedupe',
    command: ['npm', 'run', 'capital:webhook-dedupe:smoke'],
  },
  {
    label: 'Capital admin privacy',
    command: ['npm', 'run', 'capital:privacy:smoke'],
  },
  {
    label: 'Capital private page reliability',
    command: ['npm', 'run', 'capital:private-pages:smoke'],
  },
  {
    label: 'Private route helper',
    command: ['npm', 'run', 'private:route-helper:smoke'],
  },
  {
    label: 'Private route proxy',
    command: ['npm', 'run', 'private:route-proxy:smoke'],
  },
  {
    label: 'Stale Supabase auth recovery',
    command: ['npm', 'run', 'auth:stale-supabase:smoke'],
  },
  {
    label: 'Wallet session secret boundary',
    command: ['npm', 'run', 'auth:wallet-session-secret:smoke'],
  },
  {
    label: 'Member wallet route guard',
    command: ['npm', 'run', 'member:wallet-route:smoke'],
  },
  {
    label: 'Capital admin response shape',
    command: ['npm', 'run', 'capital:admin-shape:smoke'],
  },
  {
    label: 'Capital redaction',
    command: ['npm', 'run', 'capital:redaction:smoke'],
  },
  {
    label: 'Capital approval checklist',
    command: ['npm', 'run', 'capital:approvals:smoke'],
  },
  {
    label: 'Capital patron brief',
    command: ['npm', 'run', 'capital:patron-brief:smoke'],
  },
  {
    label: 'Capital window kit',
    command: ['npm', 'run', 'capital:window-kit:smoke'],
  },
  {
    label: 'Capital scenario planner',
    command: ['npm', 'run', 'capital:scenarios:smoke'],
  },
  {
    label: 'Capital outreach lab',
    command: ['npm', 'run', 'capital:outreach-lab:smoke'],
  },
  {
    label: 'Capital weekly review',
    command: ['npm', 'run', 'capital:weekly-review:smoke'],
  },
  {
    label: 'Capital revenue snapshot contract',
    command: ['npm', 'run', 'capital:revenue:smoke'],
  },
  {
    label: 'Capital live payment readiness contract',
    command: ['npm', 'run', 'capital:live-payment:smoke'],
  },
  {
    label: 'Capital profit gate contract',
    command: ['npm', 'run', 'capital:profit:smoke'],
  },
  {
    label: 'Capital first revenue readiness contract',
    command: ['npm', 'run', 'capital:first-revenue:smoke'],
  },
  {
    label: 'Capital post-promotion verifier contract',
    command: ['npm', 'run', 'capital:post-promotion:smoke'],
  },
  {
    label: 'Capital go-live readiness contract',
    command: ['npm', 'run', 'capital:go-live:readiness:smoke'],
  },
  {
    label: 'Capital go-live packet contract',
    command: ['npm', 'run', 'capital:go-live:smoke'],
  },
  {
    label: 'Capital paid-traffic packet contract',
    command: ['npm', 'run', 'capital:paid-traffic:smoke'],
  },
  {
    label: 'Public discovery and 92B claims',
    command: ['npm', 'run', 'public:discovery:smoke'],
  },
  {
    label: 'Memory privacy',
    command: ['npm', 'run', 'memory:privacy:smoke'],
  },
  {
    label: 'Memory retrieval exclusion',
    command: ['npm', 'run', 'memory:retrieval:smoke'],
  },
  {
    label: 'Memory state migration draft',
    command: ['npm', 'run', 'memory:state-migration:smoke'],
  },
  {
    label: 'Memory consent action readiness',
    command: ['npm', 'run', 'memory:consent-actions:smoke'],
  },
  {
    label: 'Movement private surfaces',
    command: ['npm', 'run', 'movement:private-surfaces:smoke'],
  },
  {
    label: 'Movement API boundary',
    command: ['npm', 'run', 'movement:api-boundary:smoke'],
  },
  {
    label: 'Voice consent',
    command: ['npm', 'run', 'voice:consent:smoke'],
  },
  {
    label: 'AI status',
    command: ['npm', 'run', 'ai:status:smoke'],
  },
  {
    label: 'Creator operations',
    command: ['npm', 'run', 'creator:ops:smoke'],
  },
  {
    label: 'Pod export manifest',
    command: ['npm', 'run', 'pod:export:smoke'],
  },
  {
    label: 'Pod wallet seal',
    command: ['npm', 'run', 'pod:wallet-seal:smoke'],
  },
  {
    label: 'Sovereignty passport',
    command: ['npm', 'run', 'sovereignty:passport:smoke'],
  },
  {
    label: 'World permissions',
    command: ['npm', 'run', 'world:permissions:smoke'],
  },
  {
    label: 'Twiddle cron authorization',
    command: ['npm', 'run', 'twiddle:cron-auth:smoke'],
  },
  {
    label: 'External action boundary',
    command: ['npm', 'run', 'external:boundary:smoke'],
  },
  {
    label: 'External effect route inventory',
    command: ['npm', 'run', 'external:effects:smoke'],
  },
  {
    label: 'External effect lazy clients',
    command: ['npm', 'run', 'external:lazy-clients:smoke'],
  },
  {
    label: 'Image proxy guard',
    command: ['npm', 'run', 'image-proxy:smoke'],
  },
  {
    label: 'Environment readiness',
    command: ['npm', 'run', 'env:readiness:smoke'],
  },
];

if (includeRoutes) {
  steps.push({
    label: 'Capital localhost routes',
    command: ['npm', 'run', 'capital:routes:smoke'],
  });
}

validateOperatorPlan(steps);

if (listOnly) {
  console.log(`Operator smoke plan: ${steps.length} step(s), ${stepTimeoutMs}ms timeout per step.`);
  for (const [index, step] of steps.entries()) {
    console.log(`${index + 1}. ${step.label}: ${step.command.join(' ')}`);
  }
  console.log('Nested Prompt Atlas smoke plan: npm run prompt-atlas:verify:list');
  if (!includeRoutes) {
    console.log('Optional localhost route smoke omitted. Add --with-routes while next dev is running to include it.');
  }
  process.exit(0);
}

for (const step of steps) {
  console.log(`\n== ${step.label} ==`);
  const [cmd, ...args] = step.command;
  const result = spawnSync(cmd, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
    timeout: stepTimeoutMs,
  });

  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      console.error(`\nOperator smoke timed out during ${step.label} after ${stepTimeoutMs}ms.`);
      process.exit(1);
    }

    console.error(`\nOperator smoke failed during ${step.label}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    console.error(`\nOperator smoke failed during ${step.label}: terminated by ${result.signal}.`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\nOperator smoke failed during ${step.label}.`);
    process.exit(result.status || 1);
  }
}

console.log('\nOperator smoke passed.');
if (!includeRoutes) {
  console.log('Skipped localhost route smoke. Run npm run operator:smoke -- --with-routes while next dev is running to include it.');
}
