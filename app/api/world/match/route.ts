import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  computeFrequencyProfile,
  cosineSimilarity,
  deriveTags,
  type CoherenceInput,
  type MatchResult,
} from '@/lib/world/frequency';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const memberId = searchParams.get('memberId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    if (!memberId) {
      return NextResponse.json({ error: 'Missing memberId' }, { status: 400 });
    }

    // Fetch all members who have opted in (coherence_data is non-null)
    const { data: members, error } = await supabaseAdmin
      .from('members')
      .select('id, display_name, coherence_data, exp_tokens')
      .not('coherence_data', 'is', null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!members || members.length === 0) {
      return NextResponse.json({ matches: [], callerVector: null });
    }

    // Find the calling member's coherence data
    const caller = members.find(m => m.id === memberId);
    if (!caller || !caller.coherence_data) {
      return NextResponse.json(
        { error: 'No coherence data found for this member. Opt in to frequency matching first.' },
        { status: 404 },
      );
    }

    const callerInput = caller.coherence_data as CoherenceInput;
    const callerVector = computeFrequencyProfile(callerInput);

    // Compute similarity for every other opted-in member
    const matches: MatchResult[] = [];

    for (const m of members) {
      if (m.id === memberId) continue;
      const input = m.coherence_data as CoherenceInput;
      const vector = computeFrequencyProfile(input);
      const similarity = cosineSimilarity(callerVector, vector);
      matches.push({
        memberId: m.id,
        displayName: m.display_name || 'Explorer',
        similarity: Math.round(similarity * 1000) / 1000,
        vector,
        tags: deriveTags(vector),
      });
    }

    // Rank by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity);

    return NextResponse.json({
      matches: matches.slice(0, limit),
      callerVector,
      callerTags: deriveTags(callerVector),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
