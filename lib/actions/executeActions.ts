import { disburse } from '@/lib/wallets/disburse';
import { emitActivity } from '@/lib/feed/activityFeed';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface ExecutableAction {
  type: string;
  data: Record<string, unknown>;
}

export interface ActionResult {
  type: string;
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseInt(value, 10) || fallback;
  return fallback;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Action failed';
}

export async function executeActionsWithResults(
  actions: ExecutableAction[],
  memberId: string,
  thinkerId: string
): Promise<ActionResult[]> {
  const supabase = getSupabaseAdmin();
  const results: ActionResult[] = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'create_task': {
          const title = text(action.data.title, 'Untitled task');
          const { error } = await supabase.from('hub_tasks').insert({
            member_id: memberId, title,
            status: 'todo', agent_id: thinkerId, priority: text(action.data.priority, 'medium'),
            created_at: new Date().toISOString(),
          });
          results.push({ type: 'create_task', success: !error, message: error ? 'Task failed' : `Task created: "${title}"` });
          if (!error) emitActivity({ memberId, agentKey: thinkerId, eventType: 'task_created', title: `${thinkerId} assigned: ${title}` }).catch(() => {});
          break;
        }

        case 'save_note': {
          const { error } = await supabase.from('thinker_notes').insert({
            member_id: memberId, thinker_id: thinkerId,
            content: text(action.data.content), category: text(action.data.category, 'insight'),
            created_at: new Date().toISOString(),
          });
          results.push({ type: 'save_note', success: !error, message: error ? 'Note failed' : 'Note saved' });
          break;
        }

        case 'update_goal': {
          const { error } = await supabase.from('members').update({ project_description: text(action.data.goal) }).eq('id', memberId);
          results.push({ type: 'update_goal', success: !error, message: error ? 'Goal update failed' : 'Goal updated' });
          break;
        }

        case 'award_exp': {
          const pts = Math.min(Math.max(number(action.data.amount, 10), 1), 500);
          const reason = text(action.data.reason, `Awarded by ${thinkerId}`);
          // Try disbursement engine first
          const { data: membership } = await supabase.from('community_members')
            .select('community_id').eq('member_id', memberId).limit(1).single();

          if (membership) {
            const result = await disburse({
              agentKey: thinkerId, communityId: membership.community_id, toMemberId: memberId,
              amount: pts, reason, tokenSymbol: 'EXP',
            });
            results.push({
              type: 'award_exp', success: result.success,
              message: result.status === 'pending_approval' ? `${pts} $EXP pending approval` : result.success ? `+${pts} $EXP: ${reason || 'council action'}` : result.message,
              data: { amount: pts },
            });
          } else {
            // Fallback: direct update
            const { error } = await supabase.from('exp_events').insert({ member_id: memberId, amount: pts, reason });
            if (!error) {
              const { data: m } = await supabase.from('members').select('exp_tokens').eq('id', memberId).single();
              if (m) await supabase.from('members').update({ exp_tokens: (m.exp_tokens || 0) + pts }).eq('id', memberId);
            }
            results.push({ type: 'award_exp', success: !error, message: error ? 'EXP failed' : `+${pts} $EXP: ${reason || 'council action'}`, data: { amount: pts } });
          }
          break;
        }

        case 'check_exp': {
          const { data: m } = await supabase.from('members').select('exp_tokens').eq('id', memberId).single();
          results.push({ type: 'check_exp', success: true, message: `$EXP balance: ${m?.exp_tokens || 0}`, data: { balance: m?.exp_tokens || 0 } });
          break;
        }

        case 'verify_task': {
          const taskId = text(action.data.task_id);
          if (!taskId) { results.push({ type: 'verify_task', success: false, message: 'No task_id provided' }); break; }
          const { data: membership } = await supabase.from('community_members').select('community_id').eq('member_id', memberId).limit(1).single();
          if (membership) {
            const { verifyTaskCompletion } = await import('@/lib/wallets/disburse');
            const result = await verifyTaskCompletion(taskId, membership.community_id, thinkerId, 'agent');
            results.push({ type: 'verify_task', success: result.verified || result.paidOut, message: result.message });
          } else {
            results.push({ type: 'verify_task', success: false, message: 'No community found' });
          }
          break;
        }

        case 'schedule_ritual': {
          const { error } = await supabase.from('scheduled_rituals').insert({
            member_id: memberId, ritual_id: text(action.data.ritualId),
            scheduled_for: text(action.data.scheduledFor, new Date(Date.now() + 86400000).toISOString()),
            suggested_by: thinkerId,
          });
          results.push({ type: 'schedule_ritual', success: !error, message: error ? 'Ritual scheduling failed' : 'Ritual scheduled' });
          break;
        }

        case 'create_artifact_prompt': {
          const { error } = await supabase.from('artifact_queue').insert({
            member_id: memberId, thinker_id: thinkerId, prompt: text(action.data.prompt), context: text(action.data.context),
          });
          results.push({ type: 'create_artifact_prompt', success: !error, message: error ? 'Artifact failed' : 'Artifact queued' });
          break;
        }

        case 'create_project_task': {
          const project_id = text(action.data.project_id);
          const title = text(action.data.title, 'New task');
          const description = text(action.data.description);
          const reward_amount = number(action.data.reward_amount);
          if (!project_id) { results.push({ type: 'create_project_task', success: false, message: 'No project_id' }); break; }
          const { data: ptData, error: ptErr } = await supabase.from('hub_tasks').insert({
            member_id: memberId, project_id, title, description,
            reward_amount: Math.min(reward_amount, 500), reward_token: 'EXP', is_public: true,
            status: 'pending', created_by: thinkerId,
          }).select('id, title').single();
          results.push({ type: 'create_project_task', success: !ptErr, message: ptErr ? 'Task creation failed' : `Project task: "${ptData?.title}" (${reward_amount || 0} $EXP)` });
          if (!ptErr) emitActivity({ memberId, agentKey: thinkerId, eventType: 'task_created', title: `${thinkerId} created project task: "${title}"`, metadata: { project_id, reward_amount } }).catch(() => {});
          break;
        }

        case 'narrate_project': {
          const project_id = text(action.data.project_id);
          const narrativeText = text(action.data.text);
          const evt = text(action.data.event, 'observation');
          if (!project_id || !narrativeText) { results.push({ type: 'narrate_project', success: false, message: 'project_id and text required' }); break; }
          const { data: proj } = await supabase.from('projects').select('narrative_log').eq('id', project_id).single();
          const narrativeLog = Array.isArray(proj?.narrative_log) ? proj.narrative_log : [];
          const log = [...narrativeLog, { timestamp: new Date().toISOString(), thinker: thinkerId, event: evt, text: narrativeText }];
          await supabase.from('projects').update({ narrative_log: log, updated_at: new Date().toISOString() }).eq('id', project_id);
          results.push({ type: 'narrate_project', success: true, message: 'Project narrative updated' });
          break;
        }

        case 'recommend_salon': {
          const track = text(action.data.track, 'any');
          const salon_id = text(action.data.salon_id, 'any available');
          const reason = text(action.data.reason);
          await supabase.from('thinker_notes').insert({
            member_id: memberId, thinker_id: thinkerId,
            content: `Salon recommendation: ${reason}. Track: ${track}. Salon: ${salon_id}`,
            category: 'recommendation',
            created_at: new Date().toISOString(),
          });
          emitActivity({ memberId, agentKey: thinkerId, eventType: 'thinker_insight', title: `${thinkerId} recommended a salon`, description: reason }).catch(() => {});
          results.push({ type: 'recommend_salon', success: true, message: `Salon recommended: ${reason}` });
          break;
        }

        case 'celebrate_graduation': {
          const gradMemberId = text(action.data.member_id, memberId);
          const salonTitle = text(action.data.salon_title, 'salon');
          const message = text(action.data.message);
          emitActivity({ memberId: gradMemberId, agentKey: thinkerId, eventType: 'member_graduated', title: `${thinkerId} celebrates graduation from ${salonTitle}`, description: message }).catch(() => {});
          results.push({ type: 'celebrate_graduation', success: true, message: `Graduation celebrated!` });
          break;
        }

        default:
          results.push({ type: action.type, success: false, message: `Unknown action: ${action.type}` });
      }
    } catch (err: unknown) {
      results.push({ type: action.type, success: false, message: errorMessage(err) });
    }
  }

  return results;
}
