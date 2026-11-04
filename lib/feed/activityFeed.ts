import { createAnthropicClient, resolveClaudeModel } from '@/lib/ai/anthropic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type EventType =
  | 'task_created' | 'task_completed' | 'exp_awarded'
  | 'artifact_minted' | 'verdict_shared' | 'ritual_logged'
  | 'project_created' | 'project_joined' | 'member_joined'
  | 'room_started' | 'room_ended' | 'thinker_insight'
  | 'salon_created' | 'salon_joined' | 'session_completed'
  | 'member_graduated' | 'guide_promoted';

export async function emitActivity({
  communityId, memberId, agentKey, eventType, title, description, metadata = {}, isPublic = true,
}: {
  communityId?: string; memberId?: string; agentKey?: string; eventType: EventType;
  title: string; description?: string; metadata?: Record<string, unknown>; isPublic?: boolean;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('activity_feed').insert({
    community_id: communityId || null, member_id: memberId || null, agent_key: agentKey || null,
    event_type: eventType, title, description, metadata, is_public: isPublic,
  });
  if (error) console.error('[feed] emit error:', error);
}

export async function generateSocialDraft(
  eventId: string, memberId: string, platform: 'twitter' | 'linkedin'
): Promise<{ content: string; postId: string } | null> {
  const supabase = getSupabaseAdmin();
  // The service-role client bypasses RLS: scope both reads before loading event content.
  // Copy a bounded projection so later changes cannot mutate our authorization snapshot.
  const readAuthorizedEvent = async () => {
    const columns = 'id, member_id, community_id, is_public, event_type, title, description';
    const own = await supabase.from('activity_feed').select(columns)
      .eq('id', eventId).eq('member_id', memberId).maybeSingle();
    if (own.error) throw new Error('Event unavailable');
    let row = own.data;
    if (!row) {
      const visible = await supabase.from('activity_feed').select(columns)
        .eq('id', eventId).eq('is_public', true).maybeSingle();
      if (visible.error) throw new Error('Event unavailable');
      row = visible.data;
    }
    if (!row || row.id !== eventId || (row.member_id !== memberId && row.is_public !== true) ||
        typeof row.title !== 'string' || row.title.length > 1000 ||
        typeof row.event_type !== 'string' || row.event_type.length > 100 ||
        (row.description != null && (typeof row.description !== 'string' || row.description.length > 12000))) return null;
    return { id: row.id, member_id: row.member_id, community_id: row.community_id,
      is_public: row.is_public, event_type: row.event_type, title: row.title, description: row.description ?? '' };
  };
  const event = await readAuthorizedEvent();
  if (!event) return null;

  const anthropic = createAnthropicClient();
  const model = resolveClaudeModel('content', 'claude-sonnet-4-20250514');
  const charLimit = platform === 'twitter' ? 270 : 600;

  const response = await anthropic.messages.create({
    model, max_tokens: 200,
    system: `Write a ${platform} post for a founder sharing a milestone. Be genuine, not cringe. No hashtag spam. Max ${charLimit} chars. Output ONLY the post text.`,
    messages: [{ role: 'user', content: `Event: ${event.event_type}\nTitle: ${event.title}\nDescription: ${event.description || ''}` }],
  });

  const content = response.content.find(b => b.type === 'text')?.text || '';
  if (!content.trim()) throw new Error('Draft unavailable');
  // Recheck after generation. This is sequential validation, not a DB transaction;
  // it cannot retract data already sent to the model while the event was readable.
  const current = await readAuthorizedEvent();
  if (!current || JSON.stringify(current) !== JSON.stringify(event)) return null;
  const { data: post, error } = await supabase.from('social_posts').insert({
    member_id: memberId, community_id: event.community_id, source_event_id: eventId,
    platform, content: content.slice(0, charLimit), status: 'draft',
  }).select('id').single();
  if (error || !post) throw new Error('Draft unavailable');
  return { content: content.slice(0, charLimit), postId: post.id };
}
