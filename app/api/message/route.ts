import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { senderId, recipientId, content } = await req.json()
  if (!senderId || !recipientId || !content?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const supabase = createServiceClient()
  const { error } = await supabase.from('direct_messages').insert({
    sender_id: senderId,
    recipient_id: recipientId,
    content: content.trim()
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
