import Anthropic from '@anthropic-ai/sdk';

export type ClaudePurpose =
  | 'council'
  | 'personal-ai'
  | 'movement'
  | 'memory'
  | 'content'
  | 'default';

interface ClaudeUsageLog {
  purpose: ClaudePurpose;
  model: string;
  operation: string;
  latencyMs?: number;
  usage?: unknown;
}

const DIRECT_DEFAULT_MODEL = 'claude-sonnet-4-6';
const GATEWAY_DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';
const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh';

function gatewayToken() {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || null;
}

function gatewayModelEnvKey(purpose: ClaudePurpose): string {
  return `AI_GATEWAY_${purpose.toUpperCase().replace(/-/g, '_')}_MODEL`;
}

export function isAIGatewayEnabled(): boolean {
  return process.env.AI_GATEWAY_ENABLED !== 'false' && Boolean(gatewayToken());
}

export function resolveClaudeModel(
  purpose: ClaudePurpose = 'default',
  directFallback = DIRECT_DEFAULT_MODEL,
): string {
  if (isAIGatewayEnabled()) {
    return (
      process.env[gatewayModelEnvKey(purpose)] ||
      process.env.AI_GATEWAY_ANTHROPIC_MODEL ||
      GATEWAY_DEFAULT_MODEL
    );
  }

  return process.env.MOVEMENT_CLAUDE_MODEL || directFallback;
}

export function createAnthropicClient(): Anthropic {
  if (isAIGatewayEnabled()) {
    const apiKey = process.env.AI_GATEWAY_API_KEY || null;
    const authToken = apiKey ? null : process.env.VERCEL_OIDC_TOKEN || null;

    return new Anthropic({
      baseURL: process.env.AI_GATEWAY_ANTHROPIC_BASE_URL || GATEWAY_BASE_URL,
      apiKey,
      authToken,
    });
  }

  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    authToken: null,
  });
}

export function describeClaudeProvider(purpose: ClaudePurpose = 'default') {
  return {
    provider: isAIGatewayEnabled() ? 'vercel-ai-gateway' : 'anthropic-direct',
    model: resolveClaudeModel(purpose),
  };
}

export function logClaudeUsage({
  purpose,
  model,
  operation,
  latencyMs,
  usage,
}: ClaudeUsageLog) {
  console.info(
    '[claude]',
    JSON.stringify({
      provider: isAIGatewayEnabled() ? 'vercel-ai-gateway' : 'anthropic-direct',
      purpose,
      model,
      operation,
      latencyMs,
      usage,
    }),
  );
}
