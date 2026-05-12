type ClaudeRole = 'user' | 'assistant';

export interface ClaudeTextMessage {
  role: ClaudeRole;
  content: string;
}

interface ClaudeTextRequest {
  system?: string;
  messages: ClaudeTextMessage[];
  maxTokens?: number;
  model?: string;
}

interface ClaudeTextBlock {
  type: string;
  text?: string;
}

interface ClaudeResponseBody {
  content?: ClaudeTextBlock[];
  error?: { message?: string };
}

export async function completeClaudeText({
  system,
  messages,
  maxTokens = 1000,
  model = process.env.MOVEMENT_CLAUDE_MODEL || 'claude-sonnet-4-20250514',
}: ClaudeTextRequest): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as ClaudeResponseBody;
  if (!response.ok) {
    throw new Error(body.error?.message || `Claude request failed with ${response.status}`);
  }

  const text = body.content
    ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Claude returned no text content');
  return text;
}
