import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { buildSystemPrompt } from '@/lib/claude/thinkers';
import { getMemory } from '@/lib/thinkerMemory';
import { parseActions, executeThinkerAction } from '@/lib/thinkerActions';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const VALID_THINKERS = ['socrates', 'plato', 'nietzsche', 'aurelius', 'einstein', 'jobs'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { thinker_key, memberId, voice } = await req.json();
    if (!thinker_key || !VALID_THINKERS.includes(thinker_key)) {
      return NextResponse.json({ error: 'Invalid thinker_key' }, { status: 400 });
    }

    // Fetch the twiddle
    const { data: twiddle } = await supabaseAdmin.from('twiddles').select('*').eq('id', id).single();
    if (!twiddle) return NextResponse.json({ error: 'Twiddle not found' }, { status: 404 });

    // Fetch thread context (last 5 messages)
    const rootId = twiddle.root_id || id;
    const { data: threadMsgs } = await supabaseAdmin
      .from('twiddles')
      .select('content, is_thinker_response, thinker_key, created_at')
      .or(`root_id.eq.${rootId},id.eq.${rootId}`)
      .order('created_at', { ascending: false })
      .limit(5);

    const threadContext = (threadMsgs || []).reverse().map(m =>
      m.is_thinker_response ? `[${m.thinker_key}]: ${m.content}` : `Member: ${m.content}`
    ).join('\n\n');

    // Fetch thinker memory for this user (may fail if table doesn't exist)
    let memory: string | null = null;
    if (memberId) {
      try { memory = await getMemory(memberId, thinker_key); } catch {}
    }

    // Fetch member profile
    let memberContext = '';
    if (memberId) {
      const { data: member } = await supabaseAdmin.from('members')
        .select('display_name, bio, discipline, project_description, philosophy')
        .eq('id', memberId).single();
      if (member) {
        const name = member.display_name && !member.display_name.startsWith('0x') ? member.display_name : 'Explorer';
        memberContext = [
          `The member speaking is ${name}. Address them by name.`,
          member.bio ? `Bio: ${member.bio}` : null,
          member.discipline ? `Discipline: ${member.discipline}` : null,
          member.project_description ? `Building: ${member.project_description}` : null,
          member.philosophy ? `Philosophy: ${member.philosophy}` : null,
        ].filter(Boolean).join('\n');
      }
    }

    // Build system prompt
    let systemPrompt = buildSystemPrompt(thinker_key);
    systemPrompt += `\n\n${memberContext}`;
    if (memory) {
      systemPrompt += `\n\nYOUR MEMORY OF THIS MEMBER:\n${memory}\n\nUse this memory naturally.`;
    }
    systemPrompt += `\n\nYou are responding to a TwiddleTwattle post — a short-form philosophical social post. Keep your response to 2-4 sentences. Be sharp, specific to what they said, and in character.`;

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: threadContext ? `Thread context:\n${threadContext}\n\nRespond to the latest message.` : twiddle.content,
      }],
    });

    let responseText = response.content.find(b => b.type === 'text')?.text || '';

    // Parse and execute actions
    const { cleanText, actions } = parseActions(responseText);
    responseText = cleanText
      .replace(/^\[?\w[\w-]*\]?:\s*/i, '')
      .replace(/^(socrates|plato|nietzsche|aurelius|einstein|jobs):\s*/i, '')
      .trim();

    if (memberId && actions.length > 0) {
      for (const action of actions) {
        try { await executeThinkerAction(action, memberId, thinker_key); } catch {}
      }
    }

    // Insert thinker response as a new twiddle
    const { data: responseTwiddle, error } = await supabaseAdmin.from('twiddles').insert({
      author_id: null,
      content: responseText,
      twiddle_type: 'text',
      thread_type: twiddle.thread_type,
      thinker_tags: [thinker_key],
      parent_id: id,
      root_id: rootId,
      is_thinker_response: true,
      thinker_key,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Optional TTS
    let voiceUrl: string | undefined;
    if (voice && process.env.ELEVENLABS_API_KEY) {
      try {
        const { getThinkerProfile } = await import('@/lib/claude/thinkers');
        const profile = getThinkerProfile(thinker_key);
        const voiceId = profile?.voiceId || 'pNInz6obpgDQGcFmaJgB';

        const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY },
          body: JSON.stringify({ text: responseText.slice(0, 450), model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
        });

        if (ttsRes.ok) {
          const audioBuffer = await ttsRes.arrayBuffer();
          const filename = `thinker-responses/${id}/${thinker_key}-${Date.now()}.mp3`;
          await supabaseAdmin.storage.from('waddles').upload(filename, audioBuffer, { contentType: 'audio/mpeg' });
          const { data: urlData } = supabaseAdmin.storage.from('waddles').getPublicUrl(filename);
          voiceUrl = urlData.publicUrl;

          // Update the twiddle with voice URL
          await supabaseAdmin.from('twiddles').update({ voice_url: voiceUrl }).eq('id', responseTwiddle.id);
        }
      } catch (e) { console.error('TTS for twiddle response failed:', e); }
    }

    return NextResponse.json({ twiddle: { ...responseTwiddle, voice_url: voiceUrl }, actions });
  } catch (err) {
    console.error('Twiddle respond error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
