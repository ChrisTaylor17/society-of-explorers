// lib/thinkerActions.ts
// Executes structured actions emitted by thinkers

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ACTIONS_DELIMITER = '|||ACTIONS|||';

export interface ThinkerAction {
  type: string;
  data: Record<string, any>;
}

/**
 * Parse response text to separate clean text from action JSON.
 */
export function parseActions(responseText: string): { cleanText: string; actions: ThinkerAction[] } {
  if (!responseText.includes(ACTIONS_DELIMITER)) {
    return { cleanText: responseText, actions: [] };
  }

  const parts = responseText.split(ACTIONS_DELIMITER);
  const cleanText = parts[0].trim();
  let actions: ThinkerAction[] = [];

  try {
    actions = JSON.parse(parts[1].trim());
    if (!Array.isArray(actions)) actions = [];
  } catch (e) {
    console.error('Failed to parse thinker actions:', e);
  }

  return { cleanText, actions };
}

/**
 * Execute a single thinker action server-side.
 */
export async function executeThinkerAction(
  action: ThinkerAction,
  memberId: string,
  thinkerId: string
): Promise<void> {
  switch (action.type) {
    case 'create_task':
      await supabaseAdmin.from('hub_tasks').insert({
        member_id: memberId,
        title: action.data.title,
        status: 'todo',
        agent_id: thinkerId,
        created_at: new Date().toISOString(),
      });
      break;

    case 'save_note':
      await supabaseAdmin.from('thinker_notes').insert({
        member_id: memberId,
        thinker_id: thinkerId,
        content: action.data.content,
        category: action.data.category || 'insight',
        created_at: new Date().toISOString(),
      });
      break;

    case 'update_goal':
      await supabaseAdmin.from('members').update({
        project_description: action.data.goal,
      }).eq('id', memberId);
      break;

    case 'create_artifact_prompt':
      await supabaseAdmin.from('artifact_queue').insert({
        member_id: memberId,
        thinker_id: thinkerId,
        prompt: action.data.prompt,
        context: action.data.context,
      });
      break;

    case 'schedule_ritual':
      await supabaseAdmin.from('scheduled_rituals').insert({
        member_id: memberId,
        ritual_id: action.data.ritualId,
        scheduled_for: action.data.scheduledFor || new Date().toISOString(),
        suggested_by: thinkerId,
      });
      break;

    default:
      console.warn('Unknown thinker action:', action.type);
  }
}
