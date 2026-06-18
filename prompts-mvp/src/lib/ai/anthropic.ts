import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function gatewayToken(): string | null {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || null;
}

export function isClaudeConfigured(): boolean {
  return Boolean(gatewayToken() || process.env.ANTHROPIC_API_KEY);
}

export function getClaudeModel(): string {
  if (gatewayToken()) {
    return (
      process.env.AI_GATEWAY_ANTHROPIC_MODEL || "anthropic/claude-sonnet-4.6"
    );
  }
  return process.env.PROMPT_ATLAS_CLAUDE_MODEL || "claude-sonnet-4-6";
}

export function getAnthropicClient(): Anthropic {
  if (client) return client;

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;

  if (apiKey || oidcToken) {
    client = new Anthropic({
      baseURL:
        process.env.AI_GATEWAY_ANTHROPIC_BASE_URL ||
        "https://ai-gateway.vercel.sh",
      apiKey: apiKey || null,
      authToken: apiKey ? null : oidcToken,
    });
    return client;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Claude configuration is missing.");
  }

  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

