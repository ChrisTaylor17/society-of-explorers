import 'server-only'
import type { NextRequest } from 'next/server'
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server'
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember'
import { privateJson } from '@/lib/http/routeError'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { DIRECT_MESSAGE_OWNER_HEADER } from './direct-message'

type WriteRequest =
  | { ok: false; response: Response }
  | { ok: true; memberId: string; body: Record<string, unknown> }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function messageOwner(req: NextRequest) {
  const auth = await getAuthenticatedMember(req)
  const expected = req.headers.get(DIRECT_MESSAGE_OWNER_HEADER)
  return expected === null || expected === auth?.memberId ? auth : null
}

export async function messageWrite(req: NextRequest): Promise<WriteRequest> {
  const originError = circleWriteOrigin(req)
  if (originError) return { ok: false, response: originError }
  const auth = await messageOwner(req)
  if (!auth) return { ok: false, response: privateJson({ error: 'Unauthorized' }, { status: 401 }) }
  if (req.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return { ok: false, response: privateJson({ error: 'Use a JSON request.' }, { status: 415 }) }
  }
  const parsed = await readCircleReviewJson(req, AbortSignal.any([req.signal, AbortSignal.timeout(5_000)]))
  if (!parsed.ok) return parsed
  if (!isRecord(parsed.value)) return { ok: false, response: privateJson({ error: 'Invalid body' }, { status: 400 }) }
  return { ok: true, memberId: auth.memberId, body: parsed.value }
}

type DirectMessageRpc = 'soe_direct_message_read' | 'soe_direct_message_send' | 'soe_direct_message_ack' |
  'soe_direct_message_blocks' | 'soe_direct_message_set_block'

export async function directMessageReply<T>(name: DirectMessageRpc, args: Record<string, string | number | boolean | string[] | null>,
  parse: (value: unknown) => T | null) {
  try {
    const { data, error } = await getSupabaseAdmin().rpc(name, args)
    if (!error) {
      const value = parse(data)
      if (value !== null) return privateJson(value)
    }
    if (error?.code === 'PT400') return privateJson({ error: 'Review a valid request.' }, { status: 400 })
    if (error?.code === 'PT403' || error?.code === 'PT404') {
      return privateJson({ error: 'This conversation is unavailable.' }, { status: Number(error.code.slice(2)) })
    }
    if (error?.code === 'PT409') return privateJson({ error: 'Review the current block before trying again.' }, { status: 409 })
  } catch { /* Fail closed without returning private provider details. */ }
  return privateJson({ error: 'Private messaging is unavailable.' }, { status: 503 })
}
