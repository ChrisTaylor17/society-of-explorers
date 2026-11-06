import { NextRequest } from 'next/server'
import { privateJson } from '@/lib/http/routeError'
import { isUuid } from '@/lib/ids/uuid'
import { DIRECT_MESSAGE_ACK_LIMIT, DIRECT_MESSAGE_OWNER_HEADER, parseDirectMessageBlockChange,
  parseDirectMessageBlockPage, parseDirectMessageBlockReceipt, parseDirectMessageThread } from '@/lib/members/direct-message'
import { directMessageReply, isRecord, messageOwner, messageWrite } from '@/lib/members/direct-message-server'

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
    return directMessageReply('soe_direct_message_blocks', { p_actor: auth.memberId, p_after: after }, parseDirectMessageBlockPage)
  }

  const peerIdParam = query.get('peerId')
  const peerId = peerIdParam === null ? null : memberIdField(peerIdParam)
  if (query.getAll('peerId').length > 1 || peerIdParam !== null && peerId === null || query.has('after')) {
    return privateJson({ error: 'Invalid peer id' }, { status: 400 })
  }
  return directMessageReply<unknown>('soe_direct_message_read', { p_actor: auth.memberId, p_peer: peerId }, value => {
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

  return directMessageReply('soe_direct_message_ack', {
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

  return directMessageReply('soe_direct_message_send', { p_actor: memberId, p_peer: recipientId, p_content: content }, confirmed)
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
  return directMessageReply('soe_direct_message_set_block', {
    p_actor: request.memberId, p_peer: input.blocked ? input.peerId : null,
    p_block_id: input.blocked ? null : input.blockId, p_blocked: input.blocked,
    p_expected_revision: input.expectedRevision, p_request_id: input.requestId,
  }, value => parseDirectMessageBlockReceipt(value, input))
}
