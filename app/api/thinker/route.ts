import Anthropic from '@anthropic-ai/sdk'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { buildSystemPrompt, THINKER_PROFILES } from '@/lib/claude/thinkers'
import { NextRequest } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { message, history, isReaction, walletMemberId } = body
  const thinkerId = body.thinkerId ?? body.thinker

  const supabase = await createClient()
  const svc = createServiceClient()

  // Auth: try Supabase session first, then wallet member ID
  let member = null
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data } = await supabase.from('members')
      .select('id,display_name,discipline,project_description,exp_tokens')
      .eq('supabase_auth_id', user.id).single()
    member = data
  } else if (walletMemberId) {
    // Wallet auth — trust the member ID passed from client
    const { data } = await svc.from('members')
      .select('id,display_name,discipline,project_description,exp_tokens')
      .eq('id', walletMemberId).single()
    member = data
  }

  if (!member) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const profile = THINKER_PROFILES[thinkerId]
  if (!profile) return new Response(JSON.stringify({ error: 'Unknown thinker' }), { status: 400 })

  const transcript = (history||[]).slice(-14)
    .map((m:any) => m.sender_type==='member' ? `[CHRIS]: ${m.content}` : `[${m.sender_name.toUpperCase()}]: ${m.content}`)
    .join('\n\n')

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      let fullText = ''

      try {
        const anthropicStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: buildSystemPrompt(thinkerId, member),
          messages: [{
            role: 'user',
            content: isReaction
              ? `[CONVERSATION]\n${transcript||'Salon opening.'}\n\nYou are ${profile.name}. ONE concrete thing to add that advances the project. 1-2 sentences. If nothing: SILENT`
              : `[CONVERSATION]\n${transcript||'(Opening)'}\n\n[CHRIS JUST SAID]: "${message}"\n\nYou are ${profile.name}. Respond to his exact words. Apply your specific team role. Reference real project details. 1-3 sentences unless delivering a full artifact.`
          }]
        })

        for await (const event of anthropicStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const delta = event.delta.text
            fullText += delta
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta })}\n\n`))
          }
        }

        fullText = fullText.trim()

        if (!fullText || fullText.toUpperCase().startsWith('SILENT')) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, response: null })}\n\n`))
          controller.close()
          return
        }

        await svc.from('salon_messages').insert({
          sender_type: 'thinker', sender_name: profile.name, thinker_id: thinkerId, content: fullText
        })

        if (member?.id) {
          const exp = isReaction ? 4 : 8
          await svc.from('exp_events').insert({ member_id: member.id, amount: exp, reason: `${profile.name} responded` })
          await svc.from('members').update({ exp_tokens: (member.exp_tokens||0) + exp }).eq('id', member.id)
        }

        controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, response: fullText })}\n\n`))
      } catch (err) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`))
      }

      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
