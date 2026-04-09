import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || '';

function encryptPrivateKey(privateKey: string): { encrypted: string; iv: string } {
  if (!WALLET_ENCRYPTION_KEY) return { encrypted: 'unencrypted:' + privateKey, iv: '' };
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(WALLET_ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted: encrypted + ':' + authTag, iv: iv.toString('hex') };
}

export async function createAgentWallet(
  agentKey: string, communityId: string, chain: 'base' = 'base'
): Promise<{ address: string } | null> {
  const { data: existing } = await supabase
    .from('agent_wallets')
    .select('wallet_address')
    .eq('agent_key', agentKey)
    .eq('community_id', communityId)
    .eq('chain', chain)
    .single();

  if (existing) return { address: existing.wallet_address };

  try {
    const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts');
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const { encrypted, iv } = encryptPrivateKey(privateKey);

    const { error } = await supabase.from('agent_wallets').insert({
      agent_key: agentKey,
      community_id: communityId,
      wallet_address: account.address,
      chain,
      encrypted_key: encrypted,
      key_iv: iv,
    });

    if (error) { console.error('[agentWallet] create error:', error); return null; }
    return { address: account.address };
  } catch (err) {
    console.error('[agentWallet] wallet generation error:', err);
    return null;
  }
}

export async function initializeAgentWallets(communityId: string): Promise<void> {
  const { data: thinkers } = await supabase
    .from('community_thinkers')
    .select('thinker_key')
    .eq('community_id', communityId)
    .eq('is_active', true);

  if (!thinkers) return;

  // Create treasury wallet
  const { data: existingTreasury } = await supabase
    .from('community_treasuries')
    .select('id')
    .eq('community_id', communityId)
    .eq('chain', 'base')
    .single();

  if (!existingTreasury) {
    try {
      const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts');
      const pk = generatePrivateKey();
      const account = privateKeyToAccount(pk);
      const { encrypted, iv } = encryptPrivateKey(pk);

      await supabase.from('community_treasuries').insert({
        community_id: communityId,
        chain: 'base',
        wallet_address: account.address,
        encrypted_key: encrypted,
        key_iv: iv,
        token_symbol: 'EXP',
      });
    } catch {}
  }

  // Create wallet for each thinker
  for (const t of thinkers) {
    await createAgentWallet(t.thinker_key, communityId, 'base');
  }

  // Seed default spending limits
  const { data: existingLimits } = await supabase
    .from('agent_spending_limits')
    .select('id')
    .eq('community_id', communityId)
    .limit(1);

  if (!existingLimits || existingLimits.length === 0) {
    await supabase.from('agent_spending_limits').insert({
      community_id: communityId,
      agent_key: '*',
      max_per_tx: 50,
      max_per_day: 200,
      max_per_week: 1000,
      require_human_above: 100,
    });
  }
}

export async function getAgentWallet(
  agentKey: string, communityId: string
): Promise<{ address: string; balance: number; totalDisbursed: number } | null> {
  const { data } = await supabase
    .from('agent_wallets')
    .select('wallet_address, balance_cached, total_disbursed')
    .eq('agent_key', agentKey)
    .eq('community_id', communityId)
    .eq('is_active', true)
    .single();

  if (!data) return null;
  return { address: data.wallet_address, balance: Number(data.balance_cached || 0), totalDisbursed: Number(data.total_disbursed || 0) };
}
