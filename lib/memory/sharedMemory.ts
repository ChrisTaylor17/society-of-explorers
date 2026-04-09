import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── PERSONA LENSES ──────────────────────────────────────────
export const PERSONA_LENSES: Record<string, string> = {
  socrates: `YOUR LENS: You read these facts looking for unexamined assumptions. When you see a goal, ask what belief underlies it. When you see a challenge, question whether it's the real problem or a symptom.`,
  plato: `YOUR LENS: You read these facts looking for underlying structures. When you see scattered goals, find the single framework that unifies them. Give them the mental model that makes everything click.`,
  aurelius: `YOUR LENS: You read these facts looking for what's in their control vs. what isn't. When you see goals, identify the single next action. Be warm but unflinching about accountability.`,
  nietzsche: `YOUR LENS: You read these facts looking for where they're playing it safe. Challenge whether their goals are ambitious enough. Identify the comfortable lie they're telling themselves.`,
  einstein: `YOUR LENS: You read these facts looking for elegant simplifications. Find a parallel in nature or everyday life that makes the solution obvious. Make the complex simple through analogy.`,
  jobs: `YOUR LENS: You read these facts looking for the user experience — what should the customer FEEL? Reframe challenges as design problems. Identify the one thing that changes everything.`,
};

// ── GET THINKER CONTEXT ─────────────────────────────────────
export async function getThinkerContext(
  memberId: string,
  thinkerId: string,
  userMessage: string,
  options: { isCouncil?: boolean; maxTokens?: number } = {}
): Promise<string> {
  const { isCouncil = false, maxTokens = 1500 } = options;
  const parts: string[] = [];

  try {
    // Profile summary (fast)
    const { data: profile } = await supabase
      .from('user_profile_summary')
      .select('*')
      .eq('member_id', memberId)
      .single();

    if (profile?.summary_text) {
      parts.push(`ABOUT THIS PERSON:\n${profile.summary_text}`);
    }

    if (profile?.active_goals && Array.isArray(profile.active_goals) && profile.active_goals.length > 0) {
      const goalLines = profile.active_goals.slice(0, 3)
        .map((g: any) => `- ${g.goal}${g.deadline ? ` (by ${g.deadline})` : ''}${g.status ? ` [${g.status}]` : ''}`)
        .join('\n');
      parts.push(`ACTIVE GOALS:\n${goalLines}`);
    }

    if (profile?.pending_commitments && Array.isArray(profile.pending_commitments) && profile.pending_commitments.length > 0) {
      const commitLines = profile.pending_commitments.slice(0, 3)
        .map((c: any) => `- ${c.commitment}${c.due_date ? ` (due ${c.due_date})` : ''}`)
        .join('\n');
      parts.push(`COMMITMENTS:\n${commitLines}`);
    }

    if (profile?.current_emotional_state && profile.current_emotional_state !== 'unknown') {
      parts.push(`EMOTIONAL STATE: ${profile.current_emotional_state}`);
    }

    // Semantic search for relevant facts
    try {
      const embedding = await generateEmbedding(userMessage);
      const { data: facts } = await supabase.rpc('match_facts', {
        query_embedding: embedding,
        match_member_id: memberId,
        match_count: isCouncil ? 5 : 8,
      });

      if (facts && facts.length > 0) {
        const factLines = facts
          .filter((f: any) => f.similarity > 0.3)
          .map((f: any) => `[${f.category}] ${f.key}: ${f.value}`)
          .join('\n');
        if (factLines) parts.push(`RELEVANT FACTS:\n${factLines}`);
      }
    } catch {
      // match_facts RPC may not exist yet — graceful degradation
    }

    // Episodic memory (skip for council to stay fast)
    if (!isCouncil) {
      try {
        const embedding = await generateEmbedding(userMessage);
        const { data: episodes } = await supabase.rpc('match_episodes', {
          query_embedding: embedding,
          match_member_id: memberId,
          match_count: 3,
          min_significance: 0.5,
        });

        if (episodes && episodes.length > 0) {
          const episodeLines = episodes
            .filter((e: any) => e.similarity > 0.35)
            .map((e: any) => {
              const date = new Date(e.created_at).toLocaleDateString();
              return `[${date} with ${e.thinker_id}] ${(e.summary || e.content || '').slice(0, 150)}`;
            })
            .join('\n');
          if (episodeLines) parts.push(`PAST CONVERSATIONS:\n${episodeLines}`);
        }
      } catch {
        // match_episodes RPC may not exist yet
      }
    }

    // Persona lens
    const lens = PERSONA_LENSES[thinkerId];
    if (lens) parts.push(lens);

  } catch (err) {
    console.error('[sharedMemory] getThinkerContext error:', err);
  }

  const assembled = parts.join('\n\n');
  const charLimit = maxTokens * 4;
  return assembled.length > charLimit ? assembled.slice(0, charLimit) + '...' : assembled;
}

// ── STORE EPISODE ───────────────────────────────────────────
export async function storeEpisode({
  memberId, thinkerId, role, content, sessionId, isCouncil = false,
}: {
  memberId: string; thinkerId: string; role: string; content: string; sessionId: string; isCouncil?: boolean;
}): Promise<void> {
  try {
    const embedding = await generateEmbedding(content.slice(0, 4000));
    await supabase.from('user_episodes').insert({
      member_id: memberId,
      thinker_id: thinkerId,
      role,
      content: content.slice(0, 8000),
      embedding,
      session_id: sessionId,
      is_council: isCouncil,
      significance_score: 0.5,
    });
  } catch (err) {
    console.error('[sharedMemory] storeEpisode error:', err);
  }
}

// ── EXTRACT AND UPDATE MEMORY ───────────────────────────────
export async function extractMemory(
  memberId: string,
  recentEpisodes: { role: string; content: string; thinker_id: string }[]
): Promise<void> {
  if (recentEpisodes.length === 0) return;

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const { data: existingFacts } = await supabase
      .from('user_semantic_memory')
      .select('id, category, key, value')
      .eq('member_id', memberId)
      .is('valid_until', null)
      .limit(30);

    const existingStr = existingFacts?.length
      ? `EXISTING FACTS:\n${existingFacts.map((f: any) => `[${f.category}] ${f.key}: ${f.value}`).join('\n')}`
      : '';

    const transcript = recentEpisodes
      .map(e => `${e.role === 'user' ? 'Member' : e.thinker_id}: ${e.content}`)
      .join('\n\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: `Extract facts from this conversation. Return ONLY valid JSON.\n\n${existingStr}\n\nOutput: {"facts":[{"op":"ADD|UPDATE","category":"identity|goal|challenge|value|preference|commitment","key":"string","value":"string","existing_key_to_update":"string or null"}],"emotional_tone":"calm|anxious|excited|frustrated|determined|confident","profile_summary":"2-3 sentence summary of who this person is","active_goals":[{"goal":"string","status":"active|completed|stalled"}],"pending_commitments":[{"commitment":"string","due_date":"string or null"}],"suggested_triggers":[{"type":"goal_checkin|commitment_reminder","thinker":"string","context":"string","delay_hours":48}]}`,
      messages: [{ role: 'user', content: `CONVERSATION:\n${transcript}` }],
    });

    const text = response.content.find(b => b.type === 'text')?.text || '';
    let extracted: any;
    try {
      extracted = JSON.parse(text.replace(/```json\n?|```/g, '').trim());
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) extracted = JSON.parse(match[0]);
      else return;
    }

    // Process facts
    if (extracted.facts && Array.isArray(extracted.facts)) {
      for (const fact of extracted.facts) {
        try {
          const factEmbedding = await generateEmbedding(`${fact.category} ${fact.key}: ${fact.value}`);
          if (fact.op === 'UPDATE' && fact.existing_key_to_update) {
            await supabase.from('user_semantic_memory')
              .update({ valid_until: new Date().toISOString() })
              .eq('member_id', memberId)
              .eq('key', fact.existing_key_to_update)
              .is('valid_until', null);
          }
          if (fact.op === 'ADD' || fact.op === 'UPDATE') {
            await supabase.from('user_semantic_memory').insert({
              member_id: memberId, category: fact.category, key: fact.key, value: fact.value, embedding: factEmbedding,
            });
          }
        } catch {}
      }
    }

    // Update profile summary
    await supabase.from('user_profile_summary').upsert({
      member_id: memberId,
      summary_text: extracted.profile_summary || '',
      active_goals: extracted.active_goals || [],
      current_emotional_state: extracted.emotional_tone || 'unknown',
      pending_commitments: extracted.pending_commitments || [],
      last_session_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'member_id' });

    // Create proactive triggers
    if (extracted.suggested_triggers && Array.isArray(extracted.suggested_triggers)) {
      for (const trigger of extracted.suggested_triggers) {
        const scheduledFor = new Date(Date.now() + (trigger.delay_hours || 48) * 3600000);
        await supabase.from('proactive_triggers').insert({
          member_id: memberId,
          trigger_type: trigger.type,
          suggested_thinker: trigger.thinker,
          context_summary: trigger.context,
          scheduled_for: scheduledFor.toISOString(),
        });
      }
    }
  } catch (err) {
    console.error('[sharedMemory] extractMemory error:', err);
  }
}

// ── COMMUNITY HOOKS ─────────────────────────────────────────
export function getCouncilPrompts(communitySlug?: string): Record<string, string> | null {
  if (!communitySlug || communitySlug === 'society-of-explorers') return null;
  // TODO: fetch custom thinkers from communities table
  return null;
}
