import { NextRequest } from 'next/server'
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server'
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember'
import { privateJson } from '@/lib/http/routeError'
import { isUuid } from '@/lib/ids/uuid'
import { DIRECT_MESSAGE_ACK_LIMIT, DIRECT_MESSAGE_OWNER_HEADER } from '@/lib/members/direct-message'
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

export async function GET(req: NextRequest) {
  const auth = await messageOwner(req)
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 })

  const supabaseAdmin = getSupabaseAdmin()
  const peerIdParam = req.nextUrl.searchParams.get('peerId')

  if (!peerIdParam) {
    const { count, error } = await supabaseAdmin
      .from('direct_messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', auth.memberId)
      .eq('read', false)

    if (error) return privateJson({ error: 'Failed to fetch unread count' }, { status: 500 })

    return privateJson({ unreadCount: count ?? 0 })
  }

  const peerId = memberIdField(peerIdParam)
  if (!peerId) return privateJson({ error: 'Invalid peer id' }, { status: 400 })

  const { data: peer, error: peerError } = await supabaseAdmin
    .from('members')
    .select('id')
    .eq('id', peerId)
    .single()

  if (peerError || !peer) {
    return privateJson({ error: 'Peer not found' }, { status: 404 })
  }

  const { data: messages, error } = await supabaseAdmin
    .from('direct_messages')
    .select('id,sender_id,recipient_id,content,created_at,read')
    .or(`and(sender_id.eq.${auth.memberId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${auth.memberId})`)
    .order('created_at', { ascending: true })

  if (error) return privateJson({ error: 'Failed to fetch messages' }, { status: 500 })

  return privateJson({ messages: messages || [] })
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

  const { error } = await getSupabaseAdmin()
    .from('direct_messages')
    .update({ read: true })
    .eq('recipient_id', memberId)
    .eq('sender_id', peerId)
    .eq('read', false)
    .in('id', ids.map(id => id.toLowerCase()))
  if (error) return privateJson({ error: 'Failed to mark messages read' }, { status: 500 })

  return privateJson({ ok: true })
}

export async function POST(req: NextRequest) {
  const request = await messageWrite(req)
  if (!request.ok) return request.response

  const { body, memberId } = request
  const recipientId = memberIdField(body.recipientId)
  const content = boundedText(body.content, 4_000)

  if (!recipientId || !content) {
    return privateJson({ error: 'Missing fields' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: recipient, error: recipientError } = await supabaseAdmin
    .from('members')
    .select('id')
    .eq('id', recipientId)
    .single()

  if (recipientError || !recipient) {
    return privateJson({ error: 'Recipient not found' }, { status: 404 })
  }

  const { error } = await supabaseAdmin.from('direct_messages').insert({
    sender_id: memberId,
    recipient_id: recipientId,
    content,
  })

  if (error) return privateJson({ error: 'Failed to send message' }, { status: 500 })

  return privateJson({ ok: true })
}
