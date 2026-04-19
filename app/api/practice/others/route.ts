import { NextRequest, NextResponse } from 'next/server';
import { fetchOtherExplorers } from '@/lib/practice/others';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

export async function GET(req: NextRequest) {
  const questionId = req.nextUrl.searchParams.get('questionId');
  if (!questionId) return NextResponse.json({ others: [] });

  const auth = await getAuthenticatedMember(req);
  const others = await fetchOtherExplorers({
    questionId,
    excludeMemberId: auth?.memberId || null,
    limit: 3,
  });

  return NextResponse.json({ others });
}
