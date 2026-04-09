import { NextRequest, NextResponse } from 'next/server';
import { createLiveSession } from '@/lib/live/scheduler';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const session = await createLiveSession();
  return NextResponse.json({ created: true, session });
}
