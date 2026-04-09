import { NextRequest, NextResponse } from 'next/server';
import { approveTx } from '@/lib/wallets/disburse';
import { checkPermission } from '@/lib/governance/hats';

export async function POST(req: NextRequest) {
  const { txId, memberId, communitySlug } = await req.json();
  if (!txId || !memberId || !communitySlug) return NextResponse.json({ error: 'txId, memberId, communitySlug required' }, { status: 400 });

  const canManage = await checkPermission(memberId, communitySlug, 'manage_governance');
  if (!canManage) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

  const result = await approveTx(txId, memberId);
  return NextResponse.json(result);
}
