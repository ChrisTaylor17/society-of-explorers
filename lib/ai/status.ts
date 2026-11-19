import {
  describeClaudeProvider,
  isAIGatewayEnabled,
  resolveClaudeModel,
  type ClaudePurpose,
} from '@/lib/ai/anthropic';

type CapabilityStatus = 'ready' | 'missing' | 'partial';

type EnvCheck = {
  id: string;
  label: string;
  present: boolean;
  requiredFor: string;
};

type AIProviderCapability = {
  id: string;
  label: string;
  status: CapabilityStatus;
  provider: string;
  model: string;
  detail: string;
  env: EnvCheck[];
};

type AIStatusReceipt = {
  action: 'ai_status_loaded';
  generatedAt: string;
  mode: 'read_only_status_probe';
  externalActions: 'none';
  providerCallsMade: false;
  secretValuesExposed: false;
  mutableSystemsTouched: false;
  allowedUse: string;
  detail: string;
};

const CLAUDE_PURPOSES: ClaudePurpose[] = ['default', 'council', 'personal-ai', 'movement', 'memory', 'content'];

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function boolEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function envCheck(id: string, label: string, requiredFor: string): EnvCheck {
  return {
    id,
    label,
    present: hasEnv(id),
    requiredFor,
  };
}

function openAIModel(): string {
  return process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
}

export function buildAIProviderStatus() {
  const generatedAt = new Date().toISOString();
  const gatewayEnabled = isAIGatewayEnabled();
  const gatewayExplicitlyDisabled = boolEnv('AI_GATEWAY_ENABLED') === 'false';
  const hasGatewayToken = hasEnv('AI_GATEWAY_API_KEY') || hasEnv('VERCEL_OIDC_TOKEN');
  const hasAnthropicKey = hasEnv('ANTHROPIC_API_KEY');
  const hasOpenAIKey = hasEnv('OPENAI_API_KEY');
  const hasSupabaseAdmin = hasEnv('NEXT_PUBLIC_SUPABASE_URL') && hasEnv('SUPABASE_SERVICE_ROLE_KEY');

  const claudeProvider = describeClaudeProvider('default');
  const claudeReady = gatewayEnabled || hasAnthropicKey;

  const capabilities: AIProviderCapability[] = [
    {
      id: 'claude',
      label: 'Claude text generation',
      status: claudeReady ? 'ready' : 'missing',
      provider: claudeProvider.provider,
      model: claudeProvider.model,
      detail: gatewayEnabled
        ? 'Using Vercel AI Gateway for Claude calls where the shared helper is wired.'
        : 'Using direct Anthropic client path where the shared helper is wired.',
      env: [
        envCheck('ANTHROPIC_API_KEY', 'Anthropic API key', 'direct Claude calls'),
        envCheck('AI_GATEWAY_API_KEY', 'AI Gateway API key', 'Vercel AI Gateway'),
        envCheck('VERCEL_OIDC_TOKEN', 'Vercel OIDC token', 'Vercel AI Gateway fallback auth'),
      ],
    },
    {
      id: 'realtime',
      label: 'Live Council voice',
      status: hasOpenAIKey ? 'ready' : 'missing',
      provider: 'openai-realtime',
      model: openAIModel(),
      detail: 'Creates short-lived browser client secrets for WebRTC voice sessions.',
      env: [
        envCheck('OPENAI_API_KEY', 'OpenAI API key', 'Realtime client secret creation'),
        envCheck('OPENAI_REALTIME_MODEL', 'Realtime model override', 'optional model override'),
      ],
    },
    {
      id: 'embeddings',
      label: 'Memory embeddings',
      status: hasOpenAIKey && hasSupabaseAdmin ? 'ready' : hasOpenAIKey || hasSupabaseAdmin ? 'partial' : 'missing',
      provider: 'openai-embeddings',
      model: 'text-embedding-3-small',
      detail: 'Generates embeddings for semantic facts, episodes, and thinker recall.',
      env: [
        envCheck('OPENAI_API_KEY', 'OpenAI API key', 'embedding generation'),
        envCheck('NEXT_PUBLIC_SUPABASE_URL', 'Supabase URL', 'memory storage'),
        envCheck('SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role key', 'server-side memory writes'),
      ],
    },
    {
      id: 'supabase-admin',
      label: 'Private data access',
      status: hasSupabaseAdmin ? 'ready' : 'missing',
      provider: 'supabase-admin',
      model: 'not applicable',
      detail: 'Server-only admin client for private dashboards, pledge ledger, pods, and memory controls.',
      env: [
        envCheck('NEXT_PUBLIC_SUPABASE_URL', 'Supabase URL', 'admin client'),
        envCheck('SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role key', 'admin client'),
      ],
    },
  ];

  const blockers = capabilities
    .filter((capability) => capability.status === 'missing')
    .map((capability) => `${capability.label} is missing required configuration.`);

  const warnings = [
    !gatewayEnabled && !gatewayExplicitlyDisabled && hasGatewayToken
      ? 'AI Gateway token exists but gateway was not selected. Check AI_GATEWAY_ENABLED.'
      : null,
    !gatewayEnabled && hasAnthropicKey
      ? 'Direct Anthropic mode is active for shared-helper calls.'
      : null,
    gatewayEnabled && hasAnthropicKey
      ? 'Both AI Gateway and Anthropic direct credentials are present. Shared-helper calls will prefer Gateway.'
      : null,
  ].filter(Boolean) as string[];

  return {
    generatedAt,
    mode: gatewayEnabled ? 'gateway' : 'direct',
    gateway: {
      enabled: gatewayEnabled,
      explicitlyDisabled: gatewayExplicitlyDisabled,
      tokenPresent: hasGatewayToken,
    },
    claudeModels: CLAUDE_PURPOSES.map((purpose) => ({
      purpose,
      provider: describeClaudeProvider(purpose).provider,
      model: resolveClaudeModel(purpose),
    })),
    capabilities,
    summary: {
      ready: capabilities.filter((capability) => capability.status === 'ready').length,
      partial: capabilities.filter((capability) => capability.status === 'partial').length,
      missing: capabilities.filter((capability) => capability.status === 'missing').length,
    },
    blockers,
    warnings,
    safety: {
      exposesSecretValues: false,
      externalActions: 'none',
      note: 'This status only reports booleans, provider names, and model names. It does not call external AI APIs.',
    },
    receipt: {
      action: 'ai_status_loaded',
      generatedAt,
      mode: 'read_only_status_probe',
      externalActions: 'none',
      providerCallsMade: false,
      secretValuesExposed: false,
      mutableSystemsTouched: false,
      allowedUse:
        'Review provider selection, model names, and environment-presence readiness without exposing secret values or calling AI providers.',
      detail:
        'Loaded private AI Status locally. No external AI provider call, message generation, embedding generation, realtime session creation, secret value exposure, database write, connected-tool mutation, deploy, payment, outreach, or public action occurred.',
    } satisfies AIStatusReceipt,
  };
}
