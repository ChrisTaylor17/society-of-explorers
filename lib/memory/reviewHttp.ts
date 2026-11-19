import { MemoryReviewError, type MemoryCommand, type ReviewedMemoryService } from './reviewedMemory';
import { AUTH_INTENT_HEADER, EXPECTED_MEMBER_HEADER, parseBrowserIntent } from '../auth/browserIntent';

const headers = { 'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache', Expires: '0', Vary: 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff' };
const response = (body: unknown, status = 200) => Response.json(body, { status, headers });
export const REVIEW_UNAVAILABLE = {
  available: false, enabled: false, error: 'Reviewed memory is not connected yet. Memory remains off; no suggestions or new memories were saved.',
};

async function commandFrom(req: Request): Promise<MemoryCommand> {
  const reader = req.body?.getReader();
  if (!reader) throw new MemoryReviewError('invalid', 'A memory action is required.');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16_384) { await reader.cancel(); throw new MemoryReviewError('invalid', 'The memory request is too large.'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(buffer)); }
  catch { throw new MemoryReviewError('invalid', 'Use a valid memory action.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MemoryReviewError('invalid', 'Use a valid memory action.');
  const body = value as Record<string, unknown>;
  const allowed: Record<string, string[]> = {
    prepare: ['sourceId', 'sourceRevision', 'consent'], accept: ['candidateId', 'text'], reject: ['candidateId'],
    cancel: [], 'set-enabled': ['enabled'], forget: ['memoryId'],
  };
  if (typeof body.action !== 'string' || !Object.hasOwn(allowed, body.action)
    || Object.keys(body).some(key => !['action', 'requestId', 'expectedRevision', ...allowed[body.action as string]].includes(key))
    || typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) {
    throw new MemoryReviewError('invalid', 'Use a valid memory action.');
  }
  return body as MemoryCommand;
}

export function createMemoryReviewHandlers(options: {
  service: ReviewedMemoryService | null;
  authenticate(req: Request): Promise<string | null>;
  originAllowed(req: Request): boolean;
}) {
  async function run(req: Request, write: boolean) {
    if (!options.originAllowed(req)) return response({ error: 'Forbidden' }, 403);
    if (new URL(req.url).searchParams.size) return response({ error: 'Invalid query' }, 400);
    if (!options.service) return response(REVIEW_UNAVAILABLE, 503);
    try {
      if (!parseBrowserIntent(req.headers.get(AUTH_INTENT_HEADER))) return response({ error: 'Refresh your sign-in before reviewing memory.' }, 401);
      const memberId = await options.authenticate(req);
      if (!memberId) return response({ error: 'Sign in to review your memory.' }, 401);
      const expectedMember = req.headers.get(EXPECTED_MEMBER_HEADER);
      if ((write && !expectedMember) || (expectedMember && expectedMember !== memberId)) {
        return response({ error: 'Your sign-in changed. Refresh before continuing.', code: 'identity_changed', refreshRequired: true }, 403);
      }
      if (!write) return response(await options.service.view(memberId));
      return response(await options.service.execute(memberId, await commandFrom(req)));
    } catch (error) {
      if (error instanceof MemoryReviewError) {
        const status = error.code === 'invalid' ? 400 : error.code === 'conflict' || error.code === 'expired' ? 409 : 503;
        return response({ error: error.message, code: error.code, refreshRequired: error.code !== 'invalid' }, status);
      }
      return response({ error: 'Memory could not be confirmed. Refresh before continuing.', code: 'unconfirmed', refreshRequired: true }, 503);
    }
  }
  return { GET: (req: Request) => run(req, false), POST: (req: Request) => run(req, true) };
}
