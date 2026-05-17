import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

type BuilderArchetype =
  | 'Systems Architect'
  | 'Visionary Philosopher'
  | 'Algorithmic Operator'
  | 'Growth Catalyst';

interface EpistemicVectors {
  rationalism_vs_empiricism: number;
  risk_acceleration_tolerance: number;
  open_source_conviction: number;
}

interface MatchProjection {
  member_id: string;
  epistemic_vectors: EpistemicVectors;
  primary_builder_archetype: BuilderArchetype;
  decentralization_conviction: number;
  synergistic_skills: string[];
}

interface MatchReport {
  candidate_id: string;
  compatibility_score: number;
  ideological_resonance: number;
  builder_complementarity: number;
  skill_overlap_score: number;
  asymmetric_synergy: boolean;
  shared_skill_overlap: string[];
  analysis: {
    complementary_roles: string;
    shared_vectors: string[];
    tension_vectors: string[];
    shared_vectors_count: number;
    trust_summary: string;
  };
}

interface MatchResponse {
  ok: boolean;
  audit_id: string;
  source_member_id: string;
  candidates_processed: number;
  matches: MatchReport[];
}

const baseUrl = (process.env.MATCH_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const sourceMemberId = randomUUID();

const sourceProjection: MatchProjection = {
  member_id: sourceMemberId,
  epistemic_vectors: {
    rationalism_vs_empiricism: 0.72,
    risk_acceleration_tolerance: -0.25,
    open_source_conviction: 0.84,
  },
  primary_builder_archetype: 'Algorithmic Operator',
  decentralization_conviction: 0.68,
  synergistic_skills: ['zero knowledge proofs', 'agent orchestration', 'product systems', 'protocol design'],
};

const candidates: Array<{
  id: string;
  name: string;
  projection: MatchProjection;
}> = [
  {
    id: randomUUID(),
    name: 'The Contrarian Architect',
    projection: {
      member_id: '',
      epistemic_vectors: {
        rationalism_vs_empiricism: 0.92,
        risk_acceleration_tolerance: -0.82,
        open_source_conviction: 0.74,
      },
      primary_builder_archetype: 'Systems Architect',
      decentralization_conviction: 0.76,
      synergistic_skills: ['protocol design', 'formal methods', 'zero knowledge proofs', 'systems modeling'],
    },
  },
  {
    id: randomUUID(),
    name: 'The Chaotic Catalyst',
    projection: {
      member_id: '',
      epistemic_vectors: {
        rationalism_vs_empiricism: -0.88,
        risk_acceleration_tolerance: 0.91,
        open_source_conviction: 0.52,
      },
      primary_builder_archetype: 'Growth Catalyst',
      decentralization_conviction: 0.41,
      synergistic_skills: ['community design', 'go-to-market', 'agent orchestration', 'narrative strategy'],
    },
  },
  {
    id: randomUUID(),
    name: 'Parallel Operator',
    projection: {
      member_id: '',
      epistemic_vectors: {
        rationalism_vs_empiricism: 0.7,
        risk_acceleration_tolerance: -0.2,
        open_source_conviction: 0.82,
      },
      primary_builder_archetype: 'Algorithmic Operator',
      decentralization_conviction: 0.66,
      synergistic_skills: ['zero knowledge proofs', 'agent orchestration', 'product systems', 'protocol design'],
    },
  },
];

async function main() {
  const candidateIds = candidates.map((candidate) => candidate.id);
  const memberIds = [sourceMemberId, ...candidateIds];

  try {
    await seedMembers();
    await seedCandidateProjections();

    const res = await fetch(`${baseUrl}/api/match`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie: `soe_wallet_id=${sourceMemberId}`,
      },
      body: JSON.stringify({ projection: sourceProjection }),
    });

    const body = (await res.json()) as MatchResponse | { audit_id?: string; error?: string };
    const headerAuditId = res.headers.get('x-match-audit-id');
    const bodyAuditId = body.audit_id || null;

    if (headerAuditId !== bodyAuditId) {
      throw new Error(`Audit ID mismatch. header=${headerAuditId} body=${bodyAuditId}`);
    }

    if (!res.ok || !('ok' in body) || body.ok !== true) {
      throw new Error(`Match request failed: ${JSON.stringify(body)}`);
    }

    if (body.candidates_processed !== 3 || body.matches.length !== 3) {
      throw new Error(
        `Expected exactly 3 candidates and matches. candidates=${body.candidates_processed} matches=${body.matches.length}`,
      );
    }

    const candidateNameById = new Map(candidates.map((candidate) => [candidate.id, candidate.name]));

    console.log(`audit_id=${body.audit_id}`);
    console.log(`audit_header_match=${headerAuditId === body.audit_id}`);
    console.log('compatibility_matrix');

    for (const [rankIndex, match] of body.matches.entries()) {
      const rank = rankIndex + 1;
      const name = candidateNameById.get(match.candidate_id) || match.candidate_id;
      console.log(
        [
          `${rank}. ${name}`,
          `score=${match.compatibility_score.toFixed(4)}`,
          `resonance=${match.ideological_resonance.toFixed(4)}`,
          `builder=${match.builder_complementarity.toFixed(4)}`,
          `skills=${match.skill_overlap_score.toFixed(4)}`,
          `asymmetric=${String(match.asymmetric_synergy)}`,
        ].join(' | '),
      );
      console.log(`   roles: ${match.analysis.complementary_roles}`);
      console.log(`   trust: ${match.analysis.trust_summary}`);
      console.log(`   shared_skills: ${match.shared_skill_overlap.join(', ') || 'none'}`);
      console.log(`   shared_vectors: ${match.analysis.shared_vectors.join(', ') || 'none'}`);
      console.log(`   tension_vectors: ${match.analysis.tension_vectors.join(', ') || 'none'}`);
    }
  } finally {
    await cleanup(memberIds);
  }
}

async function seedMembers() {
  const rows = [
    {
      id: sourceMemberId,
      display_name: 'Current Explorer',
      tier: 'free',
      wallet_address: `matching-source-${Date.now()}`,
    },
    ...candidates.map((candidate) => ({
      id: candidate.id,
      display_name: candidate.name,
      tier: 'free',
      wallet_address: `matching-candidate-${candidate.id}`,
    })),
  ];

  const { error } = await supabase.from('members').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`Failed to seed members: ${error.message}`);
}

async function seedCandidateProjections() {
  const rows = candidates.map((candidate) => {
    candidate.projection.member_id = candidate.id;
    return {
      member_id: candidate.id,
      epistemic_vectors: candidate.projection.epistemic_vectors,
      primary_builder_archetype: candidate.projection.primary_builder_archetype,
      decentralization_conviction: candidate.projection.decentralization_conviction,
      synergistic_skills: candidate.projection.synergistic_skills,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from('consented_match_projections')
    .upsert(rows, { onConflict: 'member_id' });

  if (error) throw new Error(`Failed to seed match projections: ${error.message}`);
}

async function cleanup(memberIds: string[]) {
  await supabase.from('consented_match_projections').delete().in('member_id', memberIds);
  await supabase.from('members').delete().in('id', memberIds);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
