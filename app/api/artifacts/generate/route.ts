import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const THINKER_AESTHETIC: Record<string, string> = {
  socrates: 'A Socratic figure of light and shadow, ancient Greek but timeless, surrounded by floating questions and dialectical geometry, gold and obsidian palette, God Series style by Giovanni DeCunto, sacred confrontation with truth',
  plato: 'Platonic ideal forms emerging from dark void, perfect geometric solids dissolving into light, cave shadows and blinding sun beyond, DeCunto God Series aesthetic, gold and deep midnight blue',
  nietzsche: 'Nietzschean will to power, figure ascending beyond mortality, eternal return spiral, lightning and abyss, Zarathustra silhouette, DeCunto-style existential drama, volcanic gold on absolute black',
  aurelius: 'Stoic emperor at peace in cosmic storm, Marcus Aurelius in meditation, Roman column meets infinite cosmos, DeCunto God Series palette — burnished gold, imperial purple, star-field black',
  einstein: 'Einstein-figure at the edge of spacetime, equations dissolving into pure light, curved universe visible as mandala, sacred geometry meeting quantum foam, DeCunto-inspired cosmic wonder',
  jobs: 'Visionary creator at the intersection of art and machine, Apple-esque minimalism meets sacred architecture, single illuminated object in infinite dark space, DeCunto God Series — pure intention made form',
};

const SHARED_AESTHETIC = `Sacred temple aesthetic. Dark background — near-black, #0A0A0A to #111111. Gold accents — #C9A84C to #F5D673. DeCunto God Series: confrontational, philosophical, luminous figures emerging from darkness. NOT generic AI art. NOT fantasy. NOT corporate. Ultra-high quality. Oil painting meets digital transcendence. Cinematic composition. Dramatic light sourcing from within.`;

export async function POST(req: NextRequest) {
  try {
    const { thinkerId, conversationContext, memberName, memberProject, specificRequest, walletMemberId } = await req.json();

    let memberId: string | null = walletMemberId || null;

    const visionPrompt = `You are ${thinkerId}, creating a sacred artifact for ${memberName || 'an Explorer'}.

Context from our conversation:
${conversationContext || 'No context provided'}

Their specific request: ${specificRequest || 'Create an artifact capturing the essence of this conversation'}
Their project: ${memberProject || 'unknown'}

Generate a profound sacred artwork concept. Return ONLY valid JSON:
{
  "title": "A powerful 3-6 word title in the style of DeCunto's God Series",
  "imagePrompt": "A detailed Flux prompt, 150-200 words, capturing the DeCunto God Series aesthetic, the member's specific vision, the thinker's philosophical lens. Include lighting, composition, color, mood.",
  "description": "2-3 sentences describing what this artifact represents",
  "philosophicalNote": "1 deep sentence — the insight this image embodies",
  "themes": ["theme1", "theme2", "theme3"],
  "dominantColors": ["#color1", "#color2", "#color3"]
}`;

    const visionResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: visionPrompt }],
    });

    const visionText = visionResponse.content[0].type === 'text' ? visionResponse.content[0].text : '';
    const jsonMatch = visionText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in vision response');
    const vision = JSON.parse(jsonMatch[0]);

    const thinkerAesthetic = THINKER_AESTHETIC[thinkerId] || THINKER_AESTHETIC.socrates;
    const fullImagePrompt = `${vision.imagePrompt}\n\nMUST EMBODY: ${thinkerAesthetic}\n\nGLOBAL AESTHETIC: ${SHARED_AESTHETIC}`;

    let imageUrl = '';
    try {
      const falResponse = await fetch('https://fal.run/fal-ai/flux-pro', {
        method: 'POST',
        headers: { 'Authorization': `Key ${process.env.FAL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullImagePrompt.slice(0, 2000),
          image_size: 'square_hd',
          num_inference_steps: 28,
          guidance_scale: 3.5,
          num_images: 1,
        }),
      });
      if (falResponse.ok) {
        const falData = await falResponse.json();
        imageUrl = falData.images?.[0]?.url || '';
      }
    } catch (falError) {
      console.error('fal.ai generation failed:', falError);
    }

    const artifactData = {
      member_id: memberId,
      thinker_id: thinkerId,
      title: vision.title,
      description: vision.description,
      philosophical_note: vision.philosophicalNote,
      prompt_used: fullImagePrompt,
      image_url: imageUrl,
      thumbnail_url: imageUrl,
      theme: { tags: vision.themes, colors: vision.dominantColors },
      conversation_context: conversationContext?.slice(0, 500),
      is_public: true,
    };

    const { data: artifact, error } = await supabaseAdmin.from('artifacts').insert(artifactData).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, artifact: { ...artifact, vision } });
  } catch (error) {
    console.error('Artifact generation error:', error);
    return NextResponse.json({ error: 'Artifact generation failed', details: String(error) }, { status: 500 });
  }
}
