import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type EventType =
  | 'task_created' | 'task_completed' | 'exp_awarded'
  | 'artifact_minted' | 'verdict_shared' | 'ritual_logged'
  | 'project_created' | 'project_joined' | 'member_joined'
  | 'room_started' | 'room_ended' | 'thinker_insight';

export async function emitActivity({
  communityId, memberId, agentKey, eventType, title, description, metadata = {}, isPublic = true,
}: {
  communityId?: string; memberId?: string; agentKey?: string; eventType: EventType;
  title: string; description?: string; metadata?: Record<string, any>; isPublic?: boolean;
}): Promise<void> {
  const { error } = await supabase.from('activity_feed').insert({
    community_id: communityId || null, member_id: memberId || null, agent_key: agentKey || null,
    event_type: eventType, title, description, metadata, is_public: isPublic,
  });
  if (error) console.error('[feed] emit error:', error);
}

export async function generateSocialDraft(
  eventId: string, memberId: string, platform: 'twitter' | 'linkedin'
): Promise<{ content: string; postId: string } | null> {
  const { data: event } = await supabase.from('activity_feed').select('*').eq('id', eventId).single();
  if (!event) return null;

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const charLimit = platform === 'twitter' ? 270 : 600;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 200,
    system: `Write a ${platform} post for a founder sharing a milestone. Be genuine, not cringe. No hashtag spam. Max ${charLimit} chars. Output ONLY the post text.`,
    messages: [{ role: 'user', content: `Event: ${event.event_type}\nTitle: ${event.title}\nDescription: ${event.description || ''}` }],
  });

  const content = response.content.find(b => b.type === 'text')?.text || '';
  const { data: post } = await supabase.from('social_posts').insert({
    member_id: memberId, community_id: event.community_id, source_event_id: eventId,
    platform, content: content.slice(0, charLimit), status: 'draft',
  }).select('id').single();

  return post ? { content: content.slice(0, charLimit), postId: post.id } : null;
}
