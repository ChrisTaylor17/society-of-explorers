import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface DisburseResult {
  success: boolean;
  status: 'executed' | 'pending_approval' | 'rejected';
  message: string;
  txId?: string;
}

async function checkLimits(agentKey: string, communityId: string, amount: number): Promise<{ allowed: boolean; requiresApproval: boolean; reason?: string }> {
  const { data: limits } = await supabase
    .from('agent_spending_limits')
    .select('*')
    .eq('community_id', communityId)
    .in('agent_key', [agentKey, '*'])
    .eq('is_active', true)
    .order('agent_key', { ascending: true })
    .limit(1);

  const limit = limits?.[0];
  if (!limit) return { allowed: true, requiresApproval: false }; // No limits = allow

  if (amount > Number(limit.max_per_tx)) return { allowed: false, requiresApproval: false, reason: `Exceeds per-tx limit of ${limit.max_per_tx}` };

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const { data: dailyTxs } = await supabase.from('agent_transactions').select('amount')
    .eq('community_id', communityId).eq('agent_key', agentKey)
    .in('status', ['executed', 'approved', 'pending']).gte('created_at', dayAgo);
  const dailyTotal = (dailyTxs || []).reduce((sum, tx) => sum + Number(tx.amount), 0);
  if (dailyTotal + amount > Number(limit.max_per_day)) return { allowed: false, requiresApproval: false, reason: `Would exceed daily limit of ${limit.max_per_day}` };

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: weeklyTxs } = await supabase.from('agent_transactions').select('amount')
    .eq('community_id', communityId).eq('agent_key', agentKey)
    .in('status', ['executed', 'approved', 'pending']).gte('created_at', weekAgo);
  const weeklyTotal = (weeklyTxs || []).reduce((sum, tx) => sum + Number(tx.amount), 0);
  if (weeklyTotal + amount > Number(limit.max_per_week)) return { allowed: false, requiresApproval: false, reason: `Would exceed weekly limit of ${limit.max_per_week}` };

  if (amount > Number(limit.require_human_above)) return { allowed: true, requiresApproval: true };
  return { allowed: true, requiresApproval: false };
}

export async function disburse(req: {
  agentKey: string; communityId: string; toMemberId: string; amount: number; reason: string; taskId?: string; tokenSymbol?: string;
}): Promise<DisburseResult> {
  const { agentKey, communityId, toMemberId, amount, reason, taskId, tokenSymbol = 'EXP' } = req;
  if (amount <= 0) return { success: false, status: 'rejected', message: 'Amount must be positive' };

  const limitCheck = await checkLimits(agentKey, communityId, amount);
  if (!limitCheck.allowed) return { success: false, status: 'rejected', message: limitCheck.reason || 'Spending limit exceeded' };

  const { data: agentWallet } = await supabase.from('agent_wallets').select('wallet_address')
    .eq('agent_key', agentKey).eq('community_id', communityId).eq('is_active', true).single();

  const fromAddress = agentWallet?.wallet_address || 'system';
  const { data: member } = await supabase.from('members').select('wallet_address').eq('id', toMemberId).single();
  const toAddress = member?.wallet_address || 'pending_member_wallet';

  const { data: tx, error } = await supabase.from('agent_transactions').insert({
    community_id: communityId, agent_key: agentKey, tx_type: taskId ? 'disbursement' : 'reward',
    from_address: fromAddress, to_address: toAddress, to_member_id: toMemberId,
    amount, token_symbol: tokenSymbol, reason, task_id: taskId || null,
    status: limitCheck.requiresApproval ? 'pending' : 'approved',
    requires_approval: limitCheck.requiresApproval,
  }).select('id').single();

  if (error) return { success: false, status: 'rejected', message: 'Failed to create transaction' };

  if (!limitCheck.requiresApproval) {
    // Execute immediately
    const { data: m } = await supabase.from('members').select('exp_tokens').eq('id', toMemberId).single();
    await supabase.from('members').update({ exp_tokens: (m?.exp_tokens || 0) + amount }).eq('id', toMemberId);
    await supabase.from('exp_events').insert({ member_id: toMemberId, amount, reason, source: `agent:${agentKey}` });
    await supabase.from('agent_transactions').update({ status: 'executed', executed_at: new Date().toISOString() }).eq('id', tx!.id);

    // Update agent disbursed total
    const { data: w } = await supabase.from('agent_wallets').select('total_disbursed')
      .eq('agent_key', agentKey).eq('community_id', communityId).single();
    if (w) await supabase.from('agent_wallets').update({ total_disbursed: Number(w.total_disbursed || 0) + amount })
      .eq('agent_key', agentKey).eq('community_id', communityId);

    return { success: true, status: 'executed', message: `${amount} ${tokenSymbol} sent`, txId: tx!.id };
  }

  return { success: true, status: 'pending_approval', message: `${amount} ${tokenSymbol} pending owner approval`, txId: tx!.id };
}

export async function approveTx(txId: string, approverMemberId: string): Promise<{ success: boolean; message: string }> {
  const { data: tx } = await supabase.from('agent_transactions').select('*').eq('id', txId).eq('status', 'pending').single();
  if (!tx) return { success: false, message: 'Transaction not found or already processed' };

  const { data: m } = await supabase.from('members').select('exp_tokens').eq('id', tx.to_member_id).single();
  await supabase.from('members').update({ exp_tokens: (m?.exp_tokens || 0) + Number(tx.amount) }).eq('id', tx.to_member_id);
  await supabase.from('exp_events').insert({ member_id: tx.to_member_id, amount: Number(tx.amount), reason: tx.reason, source: `agent:${tx.agent_key}:approved` });
  await supabase.from('agent_transactions').update({ status: 'executed', approved_by: approverMemberId, approved_at: new Date().toISOString(), executed_at: new Date().toISOString() }).eq('id', txId);

  return { success: true, message: `${tx.amount} ${tx.token_symbol} approved and sent` };
}

export async function verifyTaskCompletion(
  taskId: string, communityId: string, verifierId: string, verifierType: 'agent' | 'human'
): Promise<{ verified: boolean; paidOut: boolean; message: string }> {
  let { data: verification } = await supabase.from('task_verifications').select('*').eq('task_id', taskId).single();

  if (!verification) {
    const { data: task } = await supabase.from('hub_tasks').select('member_id').eq('id', taskId).single();
    if (!task) return { verified: false, paidOut: false, message: 'Task not found' };

    const { data: newV } = await supabase.from('task_verifications').insert({
      task_id: taskId, community_id: communityId, member_id: task.member_id,
      reward_amount: 0, reward_token: 'EXP',
    }).select().single();
    verification = newV;
  }

  if (!verification) return { verified: false, paidOut: false, message: 'Failed to create verification' };

  if (verifierType === 'agent') {
    const agents = [...(verification.verified_by_agents || []), verifierId];
    await supabase.from('task_verifications').update({ verified_by_agents: agents }).eq('id', verification.id);
  } else {
    const humans = [...(verification.verified_by_humans || []), verifierId];
    await supabase.from('task_verifications').update({ verified_by_humans: humans }).eq('id', verification.id);
  }

  const totalVerifiers = (verification.verified_by_agents?.length || 0) + (verification.verified_by_humans?.length || 0) + 1;
  if (totalVerifiers >= (verification.verification_threshold || 1)) {
    await supabase.from('task_verifications').update({ status: 'verified' }).eq('id', verification.id);
    await supabase.from('hub_tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', taskId);

    if (verification.reward_amount && verification.reward_amount > 0) {
      const result = await disburse({
        agentKey: verifierType === 'agent' ? verifierId : 'system',
        communityId, toMemberId: verification.member_id,
        amount: Number(verification.reward_amount), reason: `Task verified: ${taskId}`,
        taskId, tokenSymbol: verification.reward_token || 'EXP',
      });
      if (result.txId) await supabase.from('task_verifications').update({ status: 'paid', payout_tx_id: result.txId }).eq('id', verification.id);
      return { verified: true, paidOut: result.success, message: result.message };
    }
    return { verified: true, paidOut: false, message: 'Task verified, no reward set' };
  }

  return { verified: false, paidOut: false, message: `Verification recorded (${totalVerifiers}/${verification.verification_threshold || 1} needed)` };
}
