// lib/thinkerMemory.ts
// Manages persistent thinker memory across sessions.
// Each thinker maintains a running summary + structured facts
// about their relationship with each member.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SUMMARY_INTERVAL = 8;

export interface StructuredMemory {
  summary: string | null;
  life_facts: Record<string, string>;
  intellectual_interests: string[];
  emotional_patterns: string[];
  commitments: string[];
}

/**
 * Fetch the full memory record for a member-thinker pair.
 * Returns structured memory including summary, life facts, interests, and commitments.
 */
export async function getMemory(memberId: string, thinkerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('thinker_memory')
    .select('summary, life_facts, intellectual_interests, emotional_patterns, commitments')
    .eq('member_id', memberId)
    .eq('thinker_id', thinkerId)
    .single();

  if (!data) return null;

  return buildMemoryString(data);
}

/**
 * Get the full structured memory record.
 */
export async function getStructuredMemory(memberId: string, thinkerId: string): Promise<StructuredMemory | null> {
  const { data } = await supabaseAdmin
    .from('thinker_memory')
    .select('summary, life_facts, intellectual_interests, emotional_patterns, commitments')
    .eq('member_id', memberId)
    .eq('thinker_id', thinkerId)
    .single();

  if (!data) return null;

  return {
    summary: data.summary || null,
    life_facts: data.life_facts || {},
    intellectual_interests: data.intellectual_interests || [],
    emotional_patterns: data.emotional_patterns || [],
    commitments: data.commitments || [],
  };
}

/**
 * Build a memory string for system prompt injection.
 * Prioritizes structured facts over raw summary, capped at ~800 chars.
 */
function buildMemoryString(data: any): string | null {
  const parts: string[] = [];

  const facts = data.life_facts || {};
  const factEntries = Object.entries(facts).filter(([, v]) => v);
  if (factEntries.length > 0) {
    const factLines = factEntries.map(([k, v]) => `${k}: ${v}`).join('. ');
    parts.push(`WHAT YOU KNOW: ${factLines}`);
  }

  const commitments: string[] = data.commitments || [];
  if (commitments.length > 0) {
    parts.push(`COMMITMENTS THEY'VE MADE: ${commitments.slice(-5).join('; ')}`);
  }

  const interests: string[] = data.intellectual_interests || [];
  if (interests.length > 0) {
    parts.push(`INTELLECTUAL INTERESTS: ${interests.slice(-8).join(', ')}`);
  }

  const patterns: string[] = data.emotional_patterns || [];
  if (patterns.length > 0) {
    parts.push(`PATTERNS: ${patterns.slice(-4).join('; ')}`);
  }

  if (data.summary) {
    parts.push(`RELATIONSHIP HISTORY: ${data.summary}`);
  }

  const full = parts.join('\n');
  if (!full) return null;

  // Cap at 800 chars, prioritizing structured facts (they come first)
  return full.length > 800 ? full.slice(0, 800) + '...' : full;
}

/**
 * Increment the message count and trigger summary + fact extraction at intervals.
 */
export async function recordInteraction(
  memberId: string,
  thinkerId: string,
  thinkerName: string,
  salonId: string
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('thinker_memory')
    .select('id, message_count, summary, life_facts, intellectual_interests, emotional_patterns, commitments')
    .eq('member_id', memberId)
    .eq('thinker_id', thinkerId)
    .single();

  const newCount = (existing?.message_count || 0) + 1;

  if (existing) {
    await supabaseAdmin
      .from('thinker_memory')
      .update({ message_count: newCount, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin
      .from('thinker_memory')
      .insert({
        member_id: memberId,
        thinker_id: thinkerId,
        summary: '',
        message_count: 1,
      });
  }

  // Every SUMMARY_INTERVAL messages, update summary and extract facts
  if (newCount > 0 && newCount % SUMMARY_INTERVAL === 0) {
    await updateSummary(memberId, thinkerId, thinkerName, salonId, existing?.summary || '');
    await extractAndStoreFacts(memberId, thinkerId, thinkerName, salonId, existing);
  }
}

/**
 * Generate an updated summary from recent messages.
 */
async function updateSummary(
  memberId: string,
  thinkerId: string,
  thinkerName: string,
  salonId: string,
  existingSummary: string
): Promise<void> {
  try {
    const transcript = await getRecentTranscript(salonId, thinkerId, thinkerName);
    if (!transcript) return;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: `You are maintaining a living memory record for ${thinkerName} about a member of the Society of Explorers.

Your job: condense the conversation into a brief, dense summary that captures what matters for future conversations. Focus on:
- Key topics discussed and decisions made
- The member's current projects, challenges, and goals
- Advice given and commitments made
- Emotional tone and relationship dynamics
- Unresolved questions or threads to pick up later

Write in third person about the member. Be dense — every sentence should carry information. Max 200 words.
Do not include any preamble or explanation. Just the summary.`,
      messages: [{
        role: 'user',
        content: `${existingSummary ? `PREVIOUS SUMMARY:\n${existingSummary}\n\n` : ''}RECENT CONVERSATION:\n${transcript}\n\nWrite the updated summary. If a previous summary exists, integrate the new information — don't just append. Prioritize the most recent and important details. Keep it under 200 words.`
      }],
    });

    const newSummary = response.content.find(b => b.type === 'text')?.text || '';

    if (newSummary) {
      await supabaseAdmin
        .from('thinker_memory')
        .update({ summary: newSummary, updated_at: new Date().toISOString() })
        .eq('member_id', memberId)
        .eq('thinker_id', thinkerId);
    }
  } catch (err) {
    console.error('Summary update failed:', err);
  }
}

/**
 * Extract structured facts from recent conversation and merge with existing facts.
 */
async function extractAndStoreFacts(
  memberId: string,
  thinkerId: string,
  thinkerName: string,
  salonId: string,
  existing: any
): Promise<void> {
  try {
    const transcript = await getRecentTranscript(salonId, thinkerId, thinkerName);
    if (!transcript) return;

    const existingFacts = existing?.life_facts || {};
    const existingInterests = existing?.intellectual_interests || [];
    const existingPatterns = existing?.emotional_patterns || [];
    const existingCommitments = existing?.commitments || [];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `Extract key facts from this conversation between ${thinkerName} and a member. Return ONLY valid JSON with these fields:

{
  "life_facts": { "key": "value" pairs — job, location, relationships, current_projects, goals, struggles, background. Only include facts explicitly stated. },
  "intellectual_interests": ["topics they showed interest in or discussed deeply"],
  "emotional_patterns": ["observed emotional patterns — e.g. 'tends to overthink decisions', 'excited about new projects but fears commitment'"],
  "commitments": ["specific things they said they would do — e.g. 'will write the proposal by Friday', 'committed to daily meditation'"]
}

${Object.keys(existingFacts).length > 0 ? `EXISTING FACTS (update/extend, don't discard): ${JSON.stringify(existingFacts)}` : ''}
${existingInterests.length > 0 ? `EXISTING INTERESTS: ${JSON.stringify(existingInterests)}` : ''}

Only extract what's clearly stated. Don't infer or assume. Return ONLY the JSON object, no markdown.`,
      messages: [{
        role: 'user',
        content: `CONVERSATION:\n${transcript}`
      }],
    });

    const text = response.content.find(b => b.type === 'text')?.text || '';

    let extracted: any;
    try {
      extracted = JSON.parse(text.trim());
    } catch {
      // Try to extract JSON from markdown code block
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { extracted = JSON.parse(match[0]); } catch { return; }
      } else { return; }
    }

    // Merge with existing data
    const mergedFacts = { ...existingFacts, ...(extracted.life_facts || {}) };
    const mergedInterests = [...new Set([...existingInterests, ...(extracted.intellectual_interests || [])])].slice(-15);
    const mergedPatterns = [...new Set([...existingPatterns, ...(extracted.emotional_patterns || [])])].slice(-8);
    const mergedCommitments = [...new Set([...existingCommitments, ...(extracted.commitments || [])])].slice(-10);

    await supabaseAdmin
      .from('thinker_memory')
      .update({
        life_facts: mergedFacts,
        intellectual_interests: mergedInterests,
        emotional_patterns: mergedPatterns,
        commitments: mergedCommitments,
        updated_at: new Date().toISOString(),
      })
      .eq('member_id', memberId)
      .eq('thinker_id', thinkerId);

    console.log(`[memory] Facts extracted for ${memberId}/${thinkerId}: ${Object.keys(mergedFacts).length} facts, ${mergedInterests.length} interests, ${mergedCommitments.length} commitments`);
  } catch (err) {
    console.error('Fact extraction failed:', err);
  }
}

/**
 * Fetch recent transcript for a salon.
 */
async function getRecentTranscript(salonId: string, thinkerId: string, thinkerName: string): Promise<string | null> {
  const { data: recentMessages } = await supabaseAdmin
    .from('salon_messages')
    .select('content, sender_type, thinker_id, created_at')
    .eq('salon_id', salonId)
    .order('created_at', { ascending: false })
    .limit(SUMMARY_INTERVAL * 2);

  if (!recentMessages || recentMessages.length === 0) return null;

  return recentMessages
    .reverse()
    .map(m => {
      if (m.sender_type === 'member') return `Member: ${m.content}`;
      if (m.thinker_id === thinkerId) return `${thinkerName}: ${m.content}`;
      return `[${m.thinker_id || 'other'}]: ${m.content}`;
    })
    .join('\n\n');
}
