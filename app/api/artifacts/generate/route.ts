import { NextRequest } from 'next/server';
import { createAnthropicClient, resolveClaudeModel } from '@/lib/ai/anthropic';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const THINKER_AESTHETIC: Record<string, string> = {
  socrates:
    'A Socratic figure of light and shadow, ancient Greek but timeless, surrounded by floating questions and dialectical geometry, gold and obsidian palette, God Series style by Giovanni DeCunto, sacred confrontation with truth',
  plato:
    'Platonic ideal forms emerging from dark void, perfect geometric solids dissolving into light, cave shadows and blinding sun beyond, DeCunto God Series aesthetic, gold and deep midnight blue',
  nietzsche:
    'Nietzschean will to power, figure ascending beyond mortality, eternal return spiral, lightning and abyss, Zarathustra silhouette, DeCunto-style existential drama, volcanic gold on absolute black',
  aurelius:
    'Stoic emperor at peace in cosmic storm, Marcus Aurelius in meditation, Roman column meets infinite cosmos, DeCunto God Series palette - burnished gold, imperial purple, star-field black',
  einstein:
    'Einstein-figure at the edge of spacetime, equations dissolving into pure light, curved universe visible as mandala, sacred geometry meeting quantum foam, DeCunto-inspired cosmic wonder',
  jobs:
    'Visionary creator at the intersection of art and machine, Apple-esque minimalism meets sacred architecture, single illuminated object in infinite dark space, DeCunto God Series - pure intention made form',
};

const SHARED_AESTHETIC =
  'Sacred temple aesthetic. Dark background - near-black, #0A0A0A to #111111. Gold accents - #C9A84C to #F5D673. DeCunto God Series: confrontational, philosophical, luminous figures emerging from darkness. NOT generic AI art. NOT fantasy. NOT corporate. Ultra-high quality. Oil painting meets digital transcendence. Cinematic composition. Dramatic light sourcing from within.';
const THINKER_IDS = new Set(Object.keys(THINKER_AESTHETIC));
const MAX_CONTEXT_LENGTH = 1_500;
const MAX_STORED_CONTEXT_LENGTH = 500;
const MAX_REQUEST_LENGTH = 500;
const MAX_PROJECT_LENGTH = 500;
const MAX_NAME_LENGTH = 80;
const MAX_PROMPT_LENGTH = 2_000;
const PROMPT_WITHHELD = '[withheld: context storage consent not granted]';

type ArtifactGenerateBody = {
  thinkerId?: unknown;
  conversationContext?: unknown;
  memberName?: unknown;
  memberProject?: unknown;
  specificRequest?: unknown;
  walletMemberId?: unknown;
  memberId?: unknown;
  includeImage?: unknown;
  consentToImageGeneration?: unknown;
  makePublic?: unknown;
  consentToPublishArtifact?: unknown;
  storeConversationContext?: unknown;
  consentToStoreContext?: unknown;
};

type ArtifactVision = {
  title: string;
  imagePrompt: string;
  description: string;
  philosophicalNote: string;
  themes: string[];
  dominantColors: string[];
};

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function normalizeThinkerId(value: unknown) {
  return typeof value === 'string' && THINKER_IDS.has(value) ? value : 'socrates';
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function shouldGenerateImage(body: ArtifactGenerateBody) {
  return body.includeImage === true && body.consentToImageGeneration === true;
}

function shouldPublishArtifact(body: ArtifactGenerateBody) {
  return body.makePublic === true && body.consentToPublishArtifact === true;
}

function shouldStoreConversationContext(body: ArtifactGenerateBody) {
  return body.storeConversationContext === true && body.consentToStoreContext === true;
}

function getTextBlock(content: unknown) {
  if (!Array.isArray(content)) return '';
  const textBlock = content.find(
    (block): block is { type: 'text'; text: string } =>
      isRecord(block) && block.type === 'text' && typeof block.text === 'string',
  );
  return textBlock?.text || '';
}

function parseArtifactVision(rawText: string): ArtifactVision | null {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (!isRecord(parsed)) return null;

    const title = normalizeText(parsed.title, 'Untitled Artifact', 80);
    const imagePrompt = normalizeText(parsed.imagePrompt, '', 1_500);
    const description = normalizeText(parsed.description, '', 500);
    const philosophicalNote = normalizeText(parsed.philosophicalNote, '', 300);
    if (!imagePrompt || !description || !philosophicalNote) return null;

    return {
      title,
      imagePrompt,
      description,
      philosophicalNote,
      themes: normalizeStringArray(parsed.themes, 6, 40),
      dominantColors: normalizeStringArray(parsed.dominantColors, 6, 20),
    };
  } catch {
    return null;
  }
}

function buildVisionPrompt({
  thinkerId,
  memberName,
  conversationContext,
  specificRequest,
  memberProject,
}: {
  thinkerId: string;
  memberName: string;
  conversationContext: string;
  specificRequest: string;
  memberProject: string;
}) {
  return `You are ${thinkerId}, creating a sacred artifact for ${memberName}.

Context from the conversation:
${conversationContext || 'No context provided'}

Their specific request: ${specificRequest || 'Create an artifact capturing the essence of this conversation'}
Their project: ${memberProject || 'unknown'}

Generate a profound sacred artwork concept. Return ONLY valid JSON:
{
  "title": "A powerful 3-6 word title in the style of DeCunto's God Series",
  "imagePrompt": "A detailed Flux prompt, 150-200 words, capturing the DeCunto God Series aesthetic, the member's specific vision, and the thinker's philosophical lens. Include lighting, composition, color, mood.",
  "description": "2-3 sentences describing what this artifact represents",
  "philosophicalNote": "1 deep sentence - the insight this image embodies",
  "themes": ["theme1", "theme2", "theme3"],
  "dominantColors": ["#color1", "#color2", "#color3"]
}`;
}

function buildImagePrompt(vision: ArtifactVision, thinkerId: string) {
  const thinkerAesthetic = THINKER_AESTHETIC[thinkerId] || THINKER_AESTHETIC.socrates;
  return `${vision.imagePrompt}\n\nMUST EMBODY: ${thinkerAesthetic}\n\nGLOBAL AESTHETIC: ${SHARED_AESTHETIC}`.slice(
    0,
    MAX_PROMPT_LENGTH,
  );
}

async function generateImageUrl(fullImagePrompt: string) {
  const falKey = process.env.FAL_API_KEY;
  if (!falKey || !fullImagePrompt) return '';

  try {
    const falResponse = await fetch('https://fal.run/fal-ai/flux-pro', {
      method: 'POST',
      headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: fullImagePrompt,
        image_size: 'square_hd',
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
      }),
    });
    if (!falResponse.ok) return '';

    const falData: unknown = await falResponse.json();
    if (!isRecord(falData) || !Array.isArray(falData.images)) return '';

    const firstImage = falData.images[0];
    return isRecord(firstImage) && typeof firstImage.url === 'string' ? firstImage.url : '';
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const body = parsed as ArtifactGenerateBody;
  const thinkerId = normalizeThinkerId(body.thinkerId);
  const conversationContext = normalizeOptionalText(body.conversationContext, MAX_CONTEXT_LENGTH);
  const specificRequest = normalizeOptionalText(body.specificRequest, MAX_REQUEST_LENGTH);

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const requestedMemberId =
    typeof body.memberId === 'string'
      ? body.memberId
      : typeof body.walletMemberId === 'string'
        ? body.walletMemberId
        : '';
  if (requestedMemberId && requestedMemberId !== auth.memberId) {
    return privateJson({ error: 'Cannot generate an artifact for another member' }, { status: 403 });
  }

  const memberName = normalizeText(body.memberName, auth.member.display_name || 'Explorer', MAX_NAME_LENGTH);
  const memberProject = normalizeText(
    body.memberProject,
    auth.member.project_description || 'unknown',
    MAX_PROJECT_LENGTH,
  );

  try {
    const anthropic = createAnthropicClient();
    const visionResponse = await anthropic.messages.create({
      model: resolveClaudeModel('content', 'claude-sonnet-4-20250514'),
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: buildVisionPrompt({
            thinkerId,
            memberName,
            conversationContext,
            specificRequest,
            memberProject,
          }),
        },
      ],
    });

    const vision = parseArtifactVision(getTextBlock(visionResponse.content));
    if (!vision) return privateJson({ error: 'Failed to generate artifact vision' }, { status: 502 });

    const fullImagePrompt = buildImagePrompt(vision, thinkerId);
    const imageUrl = shouldGenerateImage(body) ? await generateImageUrl(fullImagePrompt) : '';
    const supabaseAdmin = getSupabaseAdmin();
    const { data: artifact, error } = await supabaseAdmin
      .from('artifacts')
      .insert({
        member_id: auth.memberId,
        thinker_id: thinkerId,
        title: vision.title,
        description: vision.description,
        philosophical_note: vision.philosophicalNote,
        prompt_used: shouldStoreConversationContext(body) ? fullImagePrompt : PROMPT_WITHHELD,
        image_url: imageUrl,
        thumbnail_url: imageUrl,
        theme: { tags: vision.themes, colors: vision.dominantColors },
        conversation_context: shouldStoreConversationContext(body)
          ? conversationContext.slice(0, MAX_STORED_CONTEXT_LENGTH)
          : null,
        is_public: shouldPublishArtifact(body),
      })
      .select()
      .single();

    if (error || !artifact) return privateJson({ error: 'Failed to save artifact' }, { status: 500 });
    return privateJson({ success: true, artifact: { ...artifact, vision }, imageGenerated: Boolean(imageUrl) });
  } catch {
    return privateJson({ error: 'Artifact generation failed' }, { status: 500 });
  }
}
