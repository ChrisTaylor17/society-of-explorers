import Anthropic from '@anthropic-ai/sdk'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const svc = createServiceClient()

  const { query, memberProfiles, seekerName, walletMemberId } = await req.json()

  let member = null
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data } = await supabase.from('members')
      .select('id,display_name')
      .eq('supabase_auth_id', user.id).single()
    member = data
  } else if (walletMemberId) {
    const { data } = await svc.from('members')
      .select('id,display_name')
      .eq('id', walletMemberId).single()
    member = data
  }

  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `You are the matchmaking intelligence of Society of Explorers — a private crypto-AI salon in Boston.

${seekerName} is looking for: "${query}"

SALON MEMBERS:
${memberProfiles}

Identify the 1-2 best matches and explain specifically WHY they fit — what they have in common, how they could collaborate, what makes this connection valuable. Be warm, specific, and direct. 3-4 sentences max. Address ${seekerName} directly.`
    }]
  })

  const result = response.content.find(b => b.type === 'text')?.text || ''
  return NextResponse.json({ result })
}
