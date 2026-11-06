import { NextRequest } from 'next/server'
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server'
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember'
import { privateJson } from '@/lib/http/routeError'
import { isUuid } from '@/lib/ids/uuid'
import { DIRECT_MESSAGE_ACK_LIMIT, DIRECT_MESSAGE_OWNER_HEADER, parseDirectMessageBlockChange,
  parseDirectMessageBlockPage, parseDirectMessageBlockReceipt, parseDirectMessageThread } from '@/lib/members/direct-message'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

type WriteRequest =
  | { ok: false; response: Response }
  | { ok: true; memberId: string; body: Record<string, unknown> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function memberIdField(value: unknown): string | null {
  const memberId = typeof value === 'string' ? value.trim() : null
  return isUuid(memberId) ? memberId.toLowerCase() : null
}

async function messageOwner(req: NextRequest) {
  const auth = await getAuthenticatedMember(req)
  const expected = req.headers.get(DIRECT_MESSAGE_OWNER_HEADER)
  return expected === null || expected === auth?.memberId ? auth : null
}

async function messageWrite(req: NextRequest): Promise<WriteRequest> {
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

async function reply<T>(name: DirectMessageRpc, args: Record<string, string | number | boolean | string[] | null>,
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

const confirmed = (value: unknown) => isRecord(value) && value.ok === true ? { ok: true } : null

export async function GET(req: NextRequest) {
  const auth = await messageOwner(req)
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 })

  const query = req.nextUrl.searchParams
  if (query.has('blocked')) {
    const after = query.get('after')
    if (query.getAll('blocked').length !== 1 || query.get('blocked') !== '1' || query.has('peerId') ||
        query.getAll('after').length > 1 || after !== null && !isUuid(after)) {
      return privateJson({ error: 'Use a valid blocked-members page.' }, { status: 400 })
    }
    return reply('soe_direct_message_blocks', { p_actor: auth.memberId, p_after: after }, parseDirectMessageBlockPage)
  }

  const peerIdParam = query.get('peerId')
  const peerId = peerIdParam === null ? null : memberIdField(peerIdParam)
  if (query.getAll('peerId').length > 1 || peerIdParam !== null && peerId === null || query.has('after')) {
    return privateJson({ error: 'Invalid peer id' }, { status: 400 })
  }
  return reply<unknown>('soe_direct_message_read', { p_actor: auth.memberId, p_peer: peerId }, value => {
    if (peerId) return parseDirectMessageThread(value, auth.memberId, peerId)
    return isRecord(value) && typeof value.unreadCount === 'number' &&
      Number.isSafeInteger(value.unreadCount) && value.unreadCount >= 0 ? { unreadCount: value.unreadCount } : null
  })
}

export async function PATCH(req: NextRequest) {
  const request = await messageWrite(req)
  if (!request.ok) return request.response

  const { body, memberId } = request
  const peerId = memberIdField(body.peerId)
  const ids = body.messageIds
  if (Object.keys(body).length !== 2 || !peerId || !Array.isArray(ids) ||
      ids.length === 0 || ids.length > DIRECT_MESSAGE_ACK_LIMIT || !ids.every(isUuid)) {
    return privateJson({ error: 'Use a valid message selection.' }, { status: 400 })
  }

  return reply('soe_direct_message_ack', {
    p_actor: memberId, p_peer: peerId, p_ids: ids.map(id => id.toLowerCase()),
  }, confirmed)
}

export async function POST(req: NextRequest) {
  const request = await messageWrite(req)
  if (!request.ok) return request.response

  const { body, memberId } = request
  const recipientId = memberIdField(body.recipientId)
  const content = boundedText(body.content, 4_000)
  if (!recipientId || !content) return privateJson({ error: 'Missing fields' }, { status: 400 })

  return reply('soe_direct_message_send', { p_actor: memberId, p_peer: recipientId, p_content: content }, confirmed)
}

export async function PUT(req: NextRequest) {
  const request = await messageWrite(req)
  if (!request.ok) return request.response
  if (req.headers.get(DIRECT_MESSAGE_OWNER_HEADER) !== request.memberId) {
    return privateJson({ error: 'Review this block while signed in to the same account.' }, { status: 401 })
  }
  const input = parseDirectMessageBlockChange(request.body)
  if (!input || input.blocked && input.peerId === request.memberId) {
    return privateJson({ error: 'Use a reviewed block change.' }, { status: 400 })
  }
  return reply('soe_direct_message_set_block', {
    p_actor: request.memberId, p_peer: input.blocked ? input.peerId : null,
    p_block_id: input.blocked ? null : input.blockId, p_blocked: input.blocked,
    p_expected_revision: input.expectedRevision, p_request_id: input.requestId,
  }, value => parseDirectMessageBlockReceipt(value, input))
}
