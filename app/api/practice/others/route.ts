import { NextRequest } from 'next/server';
import { fetchOtherExplorers } from '@/lib/practice/others';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';

export async function GET(req: NextRequest) {
  const questionId = req.nextUrl.searchParams.get('questionId')?.trim() || null;
  if (!questionId) return privateJson({ others: [] });

  const auth = await getAuthenticatedMember(req);
  const others = await fetchOtherExplorers({
    questionId,
    excludeMemberId: auth?.memberId || null,
    limit: 3,
  });

  return privateJson({ others });
}
