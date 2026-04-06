import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { query, memberProfiles, seekerName, seekerProfile } = await req.json()

  const auth = await getAuthenticatedMember(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const member = auth.member

  const seekerFullProfile = [
    seekerProfile?.bio && `Bio: ${seekerProfile.bio}`,
    seekerProfile?.discipline && `Field: ${seekerProfile.discipline}`,
    seekerProfile?.skills?.length && `Skills: ${seekerProfile.skills.join(', ')}`,
    seekerProfile?.project_description && `Building: ${seekerProfile.project_description}`,
    seekerProfile?.seeking && `Seeking: ${seekerProfile.seeking}`,
    seekerProfile?.philosophy && `Philosophy: ${seekerProfile.philosophy}`,
  ].filter(Boolean).join('\n') || 'Profile not yet filled in.'

  const hasProfiles = memberProfiles && memberProfiles.trim().length > 50 &&
    !memberProfiles.includes('n/a\n') && memberProfiles.split('\n').some((l: string) =>
      l.split('|').some((p: string) => p.trim().length > 5 && !['Explorer', 'n/a', ''].includes(p.trim()))
    )

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 250,
    messages: [{
      role: 'user',
      content: `You are the Oracle of the Society of Explorers — a philosophical intelligence that finds destiny-level connections between people, not surface-level skill matches.

SEEKER: ${seekerName}
SEEKER'S QUERY: "${query}"
SEEKER'S PROFILE:
${seekerFullProfile}

${hasProfiles ? `FELLOW EXPLORERS:
${memberProfiles}` : `NOTE: Fellow explorers have not yet filled in their profiles. Most show only names and wallet addresses.`}

${hasProfiles
  ? `Find the 1-2 most profound alignments. Look beyond skills — find philosophical resonance, complementary energies, destiny-level connections. Consider: what questions are both people circling without knowing it? What would they build together that neither could build alone?

Then deliver a SOCRATIC INTERVENTION — a single powerful question that both matched people should explore together. The question should feel inevitable, like it was always waiting to be asked.

Format your response as:
**THE MATCH:** [Name] — [one sentence on why this is a destiny-level connection]
**THE RESONANCE:** [2-3 sentences on the deeper alignment — philosophical, energetic, creative]
**SOCRATIC INTERVENTION:** [The question Socrates would ask them both]`
  : `Since profiles are sparse, do your best with what's available. If the seeker has a profile, reflect it back to them thoughtfully and suggest they invite specific members to fill in their profiles so the Oracle can find deeper matches.

Also: acknowledge that the Oracle grows more powerful as members reveal more of themselves. The depth of connection found equals the depth of truth shared.`}

Maximum 150 words. Be sharp and direct. No purple prose. The Oracle earns its reputation through precision, not performance.`
    }]
  })

  const result = response.content.find(b => b.type === 'text')?.text || 'The Oracle could not find a clear alignment. Add more to your profile and try again.'
  return NextResponse.json({ result })
}
