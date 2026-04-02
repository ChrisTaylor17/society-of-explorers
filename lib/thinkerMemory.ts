// lib/thinkerMemory.ts
// Manages persistent thinker memory across sessions.
// Each thinker maintains a running summary of their conversations
// with each member — a living record of the relationship.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// How many messages before we update the summary
const SUMMARY_INTERVAL = 8;

/**
 * Fetch the existing memory summary for a member-thinker pair.
 * Returns the summary string or null if no memory exists yet.
 */
export async function getMemory(memberId: string, thinkerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('thinker_memory')
    .select('summary')
    .eq('member_id', memberId)
    .eq('thinker_id', thinkerId)
    .single();

  return data?.summary || null;
}

/**
 * Increment the message count for a member-thinker pair.
 * If the count hits the SUMMARY_INTERVAL, trigger a summary update.
 * This runs fire-and-forget after the thinker response streams.
 */
export async function recordInteraction(
  memberId: string,
  thinkerId: string,
  thinkerName: string,
  salonId: string
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('thinker_memory')
    .select('id, message_count, summary')
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

  // Every SUMMARY_INTERVAL messages, update the summary
  if (newCount > 0 && newCount % SUMMARY_INTERVAL === 0) {
    await updateSummary(memberId, thinkerId, thinkerName, salonId, existing?.summary || '');
  }
}

/**
 * Generate an updated summary by reading recent messages and
 * condensing them with the existing summary.
 */
async function updateSummary(
  memberId: string,
  thinkerId: string,
  thinkerName: string,
  salonId: string,
  existingSummary: string
): Promise<void> {
  try {
    const { data: recentMessages } = await supabaseAdmin
      .from('salon_messages')
      .select('content, message_type, thinker_id, created_at')
      .eq('salon_id', salonId)
      .order('created_at', { ascending: false })
      .limit(SUMMARY_INTERVAL * 2);

    if (!recentMessages || recentMessages.length === 0) return;

    const transcript = recentMessages
      .reverse()
      .map(m => {
        if (m.message_type === 'user') return `Member: ${m.content}`;
        if (m.thinker_id === thinkerId) return `${thinkerName}: ${m.content}`;
        return `[${m.thinker_id || 'other'}]: ${m.content}`;
      })
      .join('\n\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: `You are maintaining a living memory record for ${thinkerName} about a member of the Society of Explorers.

Your job: condense the conversation into a brief, dense summary that captures what matters for future conversations. Focus on:
- Key topics discussed and decisions made
- The member's current projects, challenges, and goals as revealed in conversation
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
