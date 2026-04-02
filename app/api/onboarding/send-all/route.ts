import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { memberId, step } = await req.json();

  if (!memberId || step === undefined) {
    return NextResponse.json({ error: 'memberId and step required' }, { status: 400 });
  }

  const res = await fetch(new URL('/api/onboarding/trigger', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, step }),
  });

  const result = await res.json();
  return NextResponse.json(result);
}
