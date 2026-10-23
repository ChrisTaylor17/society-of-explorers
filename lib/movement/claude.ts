import { createAnthropicClient, logClaudeUsage, resolveClaudeModel } from '@/lib/ai/anthropic';
import type { ContentBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages';

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

function isTextContentBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}

export async function completeClaudeText({
  system,
  messages,
  maxTokens = 1000,
  model,
}: ClaudeTextRequest): Promise<string> {
  const client = createAnthropicClient();
  const resolvedModel = resolveClaudeModel('movement', model);
  const startedAt = Date.now();

  const response = await client.messages.create({
    model: resolvedModel,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages,
  });

  logClaudeUsage({
    purpose: 'movement',
    model: resolvedModel,
    operation: 'messages.create',
    latencyMs: Date.now() - startedAt,
    usage: response.usage,
  });

  const textBlocks = response.content.filter(isTextContentBlock);
  const text = textBlocks
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Claude returned no text content');
  return text;
}
