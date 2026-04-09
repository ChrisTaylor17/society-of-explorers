import { NextRequest, NextResponse } from 'next/server';
import { generateSocialDraft } from '@/lib/feed/activityFeed';

export async function POST(req: NextRequest) {
  const { eventId, memberId, platform } = await req.json();
  if (!eventId || !memberId || !platform) return NextResponse.json({ error: 'eventId, memberId, platform required' }, { status: 400 });
  const result = await generateSocialDraft(eventId, memberId, platform);
  if (!result) return NextResponse.json({ error: 'Failed' }, { status: 500 });
  return NextResponse.json(result);
}
