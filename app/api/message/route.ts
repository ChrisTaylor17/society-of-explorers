import { NextRequest } from 'next/server'
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember'
import { privateJson } from '@/lib/http/routeError'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

type MessageCreateBody = {
  recipientId?: unknown
  content?: unknown
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  const memberId = boundedText(value, 80)
  if (!memberId || !UUID_PATTERN.test(memberId)) return null
  return memberId
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req)
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
    .select('*, sender:sender_id(id,display_name,wallet_address)')
    .or(`and(sender_id.eq.${auth.memberId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${auth.memberId})`)
    .order('created_at', { ascending: true })

  if (error) return privateJson({ error: 'Failed to fetch messages' }, { status: 500 })

  await supabaseAdmin
    .from('direct_messages')
    .update({ read: true })
    .eq('recipient_id', auth.memberId)
    .eq('sender_id', peerId)
    .eq('read', false)

  return privateJson({ messages: messages || [] })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req)
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await safeRequestJson(req)
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 })

  const body: MessageCreateBody = parsed
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
    sender_id: auth.memberId,
    recipient_id: recipientId,
    content,
  })

  if (error) return privateJson({ error: 'Failed to send message' }, { status: 500 })

  return privateJson({ ok: true })
}
