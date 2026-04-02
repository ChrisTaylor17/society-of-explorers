import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const THINKER_VOICE_PROMPTS: Record<string, string> = {
  socrates: 'You are Socrates. This is your morning voice note to an explorer — intimate, questioning, like a mentor nudging them awake. 2-3 sentences. End with one question they must sit with today.',
  plato: 'You are Plato. A philosophical morning note — speak of ideals and what this day could be. 2-3 sentences. Poetic but not florid.',
  nietzsche: 'You are Nietzsche. Raw, challenging morning energy. No comfort — only provocation. 2-3 sentences.',
  aurelius: 'You are Marcus Aurelius. Stoic morning discipline. What must they do, what must they release? 2-3 sentences. Direct.',
  einstein: 'You are Einstein. A playful, curious morning note. Reframe their day as an experiment. 2-3 sentences.',
  jobs: 'You are Steve Jobs. Demanding, visionary. What is the one thing they should eliminate today? 2-3 sentences.',
};

const VOICE_IDS: Record<string, string> = {
  socrates: 'pNInz6obpgDQGcFmaJgB', plato: 'ErXwobaYiN019PkySvjV',
  nietzsche: 'VR6AewLTigWG4xSOukaG', aurelius: 'pqHfZKP75CvOlQylNhV4',
  einstein: 'SOYHLrjzK2X1ezoPC6cr', jobs: 'g5CIjZEefAph4nQFvHAz',
};

export async function POST(req: NextRequest) {
  try {
    const { memberId, thinkerId, triggerType = 'daily' } = await req.json();

    const { data: member } = await supabaseAdmin.from('members')
      .select('display_name, bio, project_description, philosophy, discipline').eq('id', memberId).single();
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    const { data: memory } = await supabaseAdmin.from('thinker_memory')
      .select('summary').eq('member_id', memberId).eq('thinker_id', thinkerId).single();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: THINKER_VOICE_PROMPTS[thinkerId] || THINKER_VOICE_PROMPTS.socrates,
      messages: [{ role: 'user', content: `Member: ${member.display_name}\nProject: ${member.project_description || 'unknown'}\nWhat you know: ${memory?.summary || 'new explorer'}\nPhilosophy: ${member.philosophy || 'seeking'}\n\nGenerate their personalized morning voice note. Use their name once.` }],
    });

    const noteText = response.content[0].type === 'text' ? response.content[0].text : '';
    let audioUrl = '';

    if (process.env.ELEVENLABS_API_KEY) {
      const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_IDS[thinkerId] || VOICE_IDS.socrates}`, {
        method: 'POST',
        headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        body: JSON.stringify({ text: noteText, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      });

      if (ttsResponse.ok) {
        const audioBuffer = await ttsResponse.arrayBuffer();
        const filename = `${memberId}/${thinkerId}/${Date.now()}.mp3`;
        const { data: uploadData } = await supabaseAdmin.storage.from('voice-notes').upload(filename, audioBuffer, { contentType: 'audio/mpeg' });
        if (uploadData) {
          const { data: urlData } = supabaseAdmin.storage.from('voice-notes').getPublicUrl(filename);
          audioUrl = urlData.publicUrl;
        }
      }
    }

    const { data: voiceNote } = await supabaseAdmin.from('voice_notes').insert({
      member_id: memberId, thinker_id: thinkerId, text_content: noteText, audio_url: audioUrl, trigger_type: triggerType,
    }).select().single();

    return NextResponse.json({ success: true, voiceNote });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
