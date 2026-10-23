import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  computeFrequencyProfile,
  cosineSimilarity,
  deriveTags,
  type CoherenceInput,
  type MatchResult,
  type FrequencyVector,
} from '@/lib/world/frequency';

const DEFAULT_MATCH_LIMIT = 20;
const MAX_MATCH_LIMIT = 50;
const FREQUENCY_MEMBER_SELECT = 'id, display_name, coherence_data';
const MAX_DISPLAY_NAME_LENGTH = 80;
const LIMIT_PATTERN = /^[0-9]+$/;

type FrequencyMemberRow = {
  id: string;
  display_name: string | null;
  coherence_data: unknown;
};

type InternalMatchCandidate = {
  displayName: string;
  similarity: number;
  vector: FrequencyVector;
  tags: string[];
};

function normalizeLimit(value: string | null): number | null {
  if (!value) return DEFAULT_MATCH_LIMIT;
  const limitText = value.trim();
  if (!LIMIT_PATTERN.test(limitText)) return null;
  const parsed = Number.parseInt(limitText, 10);
  return Math.max(1, Math.min(parsed, MAX_MATCH_LIMIT));
}

function normalizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') return 'Explorer';
  const displayName = value.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  return displayName || 'Explorer';
}

function normalizeCoherenceInput(value: unknown): CoherenceInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const alphaTheta = input.alphaTheta;
  const hrvPower = input.hrvPower;
  const sessionCount = input.sessionCount;
  const scanCount = input.scanCount;

  if (
    typeof alphaTheta !== 'number' ||
    typeof hrvPower !== 'number' ||
    typeof sessionCount !== 'number' ||
    typeof scanCount !== 'number' ||
    !Number.isFinite(alphaTheta) ||
    !Number.isFinite(hrvPower) ||
    !Number.isFinite(sessionCount) ||
    !Number.isFinite(scanCount)
  ) {
    return null;
  }

  return { alphaTheta, hrvPower, sessionCount, scanCount };
}

function publicMatchResult(candidate: InternalMatchCandidate, index: number): MatchResult {
  return {
    matchKey: `match-${index + 1}`,
    displayName: candidate.displayName,
    similarity: candidate.similarity,
    vector: candidate.vector,
    tags: candidate.tags,
  };
}

function worldMatchFailure() {
  return privateJson({ error: 'Failed to load frequency matches' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const limit = normalizeLimit(searchParams.get('limit'));

    if (!limit) return privateJson({ error: 'Invalid limit' }, { status: 400 });

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();
    const memberId = auth.memberId;

    const { data: members, error } = await supabaseAdmin
      .from('members')
      .select(FREQUENCY_MEMBER_SELECT)
      .not('coherence_data', 'is', null);

    if (error) return worldMatchFailure();
    if (!members || members.length === 0) {
      return privateJson({ matches: [], callerVector: null });
    }

    const memberRows = members as FrequencyMemberRow[];
    const caller = memberRows.find(member => member.id === memberId);
    const callerInput = normalizeCoherenceInput(caller?.coherence_data);

    if (!caller || !callerInput) {
      return privateJson(
        { error: 'No coherence data found for this member. Opt in to frequency matching first.' },
        { status: 404 },
      );
    }

    const callerVector = computeFrequencyProfile(callerInput);
    const matchCandidates: InternalMatchCandidate[] = [];

    for (const member of memberRows) {
      if (member.id === memberId) continue;
      const input = normalizeCoherenceInput(member.coherence_data);
      if (!input) continue;
      const vector = computeFrequencyProfile(input);
      const similarity = cosineSimilarity(callerVector, vector);
      matchCandidates.push({
        displayName: normalizeDisplayName(member.display_name),
        similarity: Math.round(similarity * 1000) / 1000,
        vector,
        tags: deriveTags(vector),
      });
    }

    matchCandidates.sort((a, b) => b.similarity - a.similarity);

    return privateJson({
      matches: matchCandidates.slice(0, limit).map(publicMatchResult),
      callerVector,
      callerTags: deriveTags(callerVector),
    });
  } catch {
    return worldMatchFailure();
  }
}
