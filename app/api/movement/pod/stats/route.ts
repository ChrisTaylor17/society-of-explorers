import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getPodStats } from '@/lib/movement/pod';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stats = await getPodStats(auth.memberId);
    return NextResponse.json({ stats });
  } catch (err) {
    console.error('[movement/pod/stats] failed', err);
    return NextResponse.json({ error: 'Pod stats failed', details: String(err) }, { status: 500 });
  }
}
