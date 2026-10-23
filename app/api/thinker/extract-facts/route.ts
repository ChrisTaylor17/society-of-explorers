import { NextRequest } from 'next/server';
import { createAnthropicClient, resolveClaudeModel } from '@/lib/ai/anthropic';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ExtractFactsBody = {
  memberId?: unknown;
  thinkerId?: unknown;
  messages?: unknown;
};

type ExtractedMemory = {
  life_facts: Record<string, string>;
  intellectual_interests: string[];
  emotional_patterns: string[];
  commitments: string[];
};

type ExistingMemoryRow = {
  life_facts: Record<string, string> | null;
  intellectual_interests: string[] | null;
  emotional_patterns: string[] | null;
  commitments: string[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimmedText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseMessages(value: unknown): ConversationMessage[] | null {
  if (!Array.isArray(value)) return null;

  const messages: ConversationMessage[] = [];
  for (const item of value.slice(-20)) {
    if (!isRecord(item)) return null;
    const content = trimmedText(item.content);
    if (!content) continue;
    messages.push({
      role: item.role === 'user' ? 'user' : 'assistant',
      content: content.slice(0, 8000),
    });
  }

  return messages.length > 0 ? messages : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
      .map(([key, val]) => [key, val.trim().slice(0, 500)]),
  );
}

function parseExtractedMemory(text: string): ExtractedMemory | null {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) candidates.push(match[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!isRecord(parsed)) continue;
      return {
        life_facts: stringRecord(parsed.life_facts),
        intellectual_interests: stringArray(parsed.intellectual_interests).slice(-15),
        emotional_patterns: stringArray(parsed.emotional_patterns).slice(-8),
        commitments: stringArray(parsed.commitments).slice(-10),
      };
    } catch {}
  }

  return null;
}

function mergeUnique(existing: string[] | null | undefined, extracted: string[], limit: number): string[] {
  return [...new Set([...(existing || []), ...extracted])].slice(-limit);
}

export async function POST(req: NextRequest) {
  let body: ExtractFactsBody;

  try {
    body = (await req.json()) as ExtractFactsBody;
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const requestedMemberId = trimmedText(body.memberId);
  const thinkerId = trimmedText(body.thinkerId);
  const messages = parseMessages(body.messages);

  if (!thinkerId || !messages) {
    return privateJson({ error: 'thinkerId and messages required' }, { status: 400 });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const cronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
  const auth = cronAuthorized ? null : await getAuthenticatedMember(req);

  if (!cronAuthorized && !auth) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  if (cronAuthorized && !requestedMemberId) {
    return privateJson({ error: 'memberId required for cron extraction' }, { status: 400 });
  }

  if (auth && requestedMemberId && requestedMemberId !== auth.memberId) {
    return privateJson({ error: 'Cannot extract facts for another member' }, { status: 403 });
  }

  const targetMemberId = auth?.memberId || requestedMemberId;
  if (!targetMemberId) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  const transcript = messages
    .map((message) => `${message.role === 'user' ? 'Member' : thinkerId}: ${message.content}`)
    .join('\n\n');

  try {
    const anthropic = createAnthropicClient();
    const model = resolveClaudeModel('memory', 'claude-sonnet-4-20250514');
    const response = await anthropic.messages.create({
      model,
      max_tokens: 500,
      system: `Extract key facts from this conversation. Return ONLY valid JSON with these fields:

{
  "life_facts": { "key": "value" pairs - job, location, relationships, current_projects, goals, struggles, background },
  "intellectual_interests": ["topics they showed interest in"],
  "emotional_patterns": ["observed emotional patterns"],
  "commitments": ["specific things they said they would do"]
}

Only extract what's clearly stated. Don't infer. Return ONLY the JSON object.`,
      messages: [{ role: 'user', content: `CONVERSATION:\n${transcript}` }],
    });

    const text = response.content.find((block) => block.type === 'text')?.text || '';
    const extracted = parseExtractedMemory(text);
    if (!extracted) {
      return privateJson({ error: 'Failed to parse extraction' }, { status: 500 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existing, error: readError } = await supabaseAdmin
      .from('thinker_memory')
      .select('life_facts, intellectual_interests, emotional_patterns, commitments')
      .eq('member_id', targetMemberId)
      .eq('thinker_id', thinkerId)
      .maybeSingle()
      .returns<ExistingMemoryRow>();

    if (readError) {
      return privateJson({ error: 'Failed to load memory' }, { status: 500 });
    }

    const mergedFacts = { ...stringRecord(existing?.life_facts), ...extracted.life_facts };
    const mergedInterests = mergeUnique(existing?.intellectual_interests, extracted.intellectual_interests, 15);
    const mergedPatterns = mergeUnique(existing?.emotional_patterns, extracted.emotional_patterns, 8);
    const mergedCommitments = mergeUnique(existing?.commitments, extracted.commitments, 10);

    const writePayload = {
      life_facts: mergedFacts,
      intellectual_interests: mergedInterests,
      emotional_patterns: mergedPatterns,
      commitments: mergedCommitments,
      updated_at: new Date().toISOString(),
    };

    const { error: writeError } = existing
      ? await supabaseAdmin
          .from('thinker_memory')
          .update(writePayload)
          .eq('member_id', targetMemberId)
          .eq('thinker_id', thinkerId)
      : await supabaseAdmin
          .from('thinker_memory')
          .insert({
            member_id: targetMemberId,
            thinker_id: thinkerId,
            summary: '',
            message_count: 0,
            ...writePayload,
          });

    if (writeError) {
      return privateJson({ error: 'Failed to save memory' }, { status: 500 });
    }

    return privateJson({
      success: true,
      extracted,
      merged: {
        life_facts: mergedFacts,
        intellectual_interests: mergedInterests,
        commitments: mergedCommitments,
      },
    });
  } catch {
    return privateJson({ error: 'Extraction failed' }, { status: 500 });
  }
}
