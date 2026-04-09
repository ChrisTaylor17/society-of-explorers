import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ActionResult {
  type: string;
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Execute parsed thinker actions and return structured results.
 * This wraps the existing executeThinkerAction with richer return types.
 */
export async function executeActionsWithResults(
  actions: { type: string; data: Record<string, any> }[],
  memberId: string,
  thinkerId: string
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'create_task': {
          const { error } = await supabase.from('hub_tasks').insert({
            member_id: memberId,
            title: action.data.title || 'Untitled task',
            status: 'todo',
            agent_id: thinkerId,
            priority: action.data.priority || 'medium',
            created_at: new Date().toISOString(),
          });
          results.push({ type: 'create_task', success: !error, message: error ? 'Task failed' : `Task created: "${action.data.title}"` });
          break;
        }

        case 'save_note': {
          const { error } = await supabase.from('thinker_notes').insert({
            member_id: memberId,
            thinker_id: thinkerId,
            content: action.data.content || '',
            category: action.data.category || 'insight',
            created_at: new Date().toISOString(),
          });
          results.push({ type: 'save_note', success: !error, message: error ? 'Note failed' : 'Note saved' });
          break;
        }

        case 'update_goal': {
          const { error } = await supabase.from('members').update({ project_description: action.data.goal }).eq('id', memberId);
          results.push({ type: 'update_goal', success: !error, message: error ? 'Goal update failed' : 'Goal updated' });
          break;
        }

        case 'award_exp': {
          const amount = Math.min(Math.max(parseInt(action.data.amount) || 10, 1), 500);
          const { error } = await supabase.from('exp_events').insert({
            member_id: memberId,
            amount,
            reason: action.data.reason || `Awarded by ${thinkerId}`,
          });
          if (!error) {
            const { data: m } = await supabase.from('members').select('exp_tokens').eq('id', memberId).single();
            if (m) await supabase.from('members').update({ exp_tokens: (m.exp_tokens || 0) + amount }).eq('id', memberId);
          }
          results.push({ type: 'award_exp', success: !error, message: error ? 'EXP failed' : `+${amount} $EXP: ${action.data.reason || 'council action'}`, data: { amount } });
          break;
        }

        case 'check_exp': {
          const { data: m } = await supabase.from('members').select('exp_tokens').eq('id', memberId).single();
          results.push({ type: 'check_exp', success: true, message: `$EXP balance: ${m?.exp_tokens || 0}`, data: { balance: m?.exp_tokens || 0 } });
          break;
        }

        case 'schedule_ritual': {
          const { error } = await supabase.from('scheduled_rituals').insert({
            member_id: memberId,
            ritual_id: action.data.ritualId,
            scheduled_for: action.data.scheduledFor || new Date(Date.now() + 86400000).toISOString(),
            suggested_by: thinkerId,
          });
          results.push({ type: 'schedule_ritual', success: !error, message: error ? 'Ritual scheduling failed' : 'Ritual scheduled' });
          break;
        }

        case 'create_artifact_prompt': {
          const { error } = await supabase.from('artifact_queue').insert({
            member_id: memberId,
            thinker_id: thinkerId,
            prompt: action.data.prompt,
            context: action.data.context,
          });
          results.push({ type: 'create_artifact_prompt', success: !error, message: error ? 'Artifact failed' : 'Artifact queued' });
          break;
        }

        default:
          results.push({ type: action.type, success: false, message: `Unknown action: ${action.type}` });
      }
    } catch (err: any) {
      results.push({ type: action.type, success: false, message: err.message || 'Action failed' });
    }
  }

  return results;
}
