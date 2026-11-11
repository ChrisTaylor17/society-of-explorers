import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { authWriteOriginAllowed } from '@/lib/auth/request';
import { createMemoryReviewHandlers } from '@/lib/memory/reviewHttp';
import { getReviewedMemoryService } from '@/lib/memory/reviewRuntime';

export const runtime = 'nodejs';

const handlers = createMemoryReviewHandlers({
  service: getReviewedMemoryService(),
  authenticate: async req => (await getAuthenticatedMember(req as NextRequest))?.memberId ?? null,
  originAllowed: req => authWriteOriginAllowed(req as NextRequest),
});

export const GET = handlers.GET;
export const POST = handlers.POST;
