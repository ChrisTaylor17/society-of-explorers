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

// One low-cost default for every feature (figure chat, council, reading tools).
// Override with MOVEMENT_CLAUDE_MODEL (direct) or AI_GATEWAY_*_MODEL (gateway).
const DIRECT_DEFAULT_MODEL = 'claude-haiku-5-5';
const GATEWAY_DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';
// Per-route fallbacks written for older, pricier or retired models. They now
// resolve to the default so no route calls a model that returns 404 or costs more.
const LEGACY_FALLBACK_MODELS = new Set([
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-haiku-4-5-20251001',
]);
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

  const fallback = LEGACY_FALLBACK_MODELS.has(directFallback) ? DIRECT_DEFAULT_MODEL : directFallback;
  return process.env.MOVEMENT_CLAUDE_MODEL || fallback;
}


// Haiku 5.5 thinks by default, and that thinking counts against max_tokens.
// The short replies here (figure chat, council, reading tools) were budgeted for
// a model that answered straight away, so thinking ate the budget: replies came
// back cut off or empty. Turn it off for Haiku 5 models unless a call sets its own.
// (Haiku 5.5 accepts `disabled` at effort high or below; the default is medium.)
function withThinkingOffForHaiku(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (init?.body && typeof init.body === 'string' && /\/v1\/messages(\?|$)/.test(url)) {
        const body = JSON.parse(init.body);
        if (
          body &&
          typeof body.model === 'string' &&
          /haiku-5/.test(body.model) &&
          body.thinking === undefined &&
          !['xhigh', 'max'].includes(body.output_config?.effort)
        ) {
          body.thinking = { type: 'disabled' };
          init = { ...init, body: JSON.stringify(body) };
        }
      }
    } catch {
      // Leave the request as it was if the body is not JSON.
    }
    return baseFetch(input, init);
  };
}

export function createAnthropicClient(): Anthropic {
  if (isAIGatewayEnabled()) {
    const apiKey = process.env.AI_GATEWAY_API_KEY || null;
    const authToken = apiKey ? null : process.env.VERCEL_OIDC_TOKEN || null;

    return new Anthropic({
      baseURL: process.env.AI_GATEWAY_ANTHROPIC_BASE_URL || GATEWAY_BASE_URL,
      apiKey,
      authToken,
      fetch: withThinkingOffForHaiku(),
    });
  }

  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    authToken: null,
    fetch: withThinkingOffForHaiku(),
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
