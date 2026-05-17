import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type {
  ActiveCollaboration,
  ExplorerGraph,
  MilestoneDefinition,
  MultisigConfig,
} from '../lib/movement/explorerGraph';
import { applyProjectEscrowMutation } from '../lib/hooks/useProjectEscrow';

interface ProjectCreateResponse {
  ok: true;
  audit_id: string;
  workspace_reference: {
    project_id: string;
    participant_member_ids: string[];
    storage_path: string;
    workspace_status: string;
    created_at: string;
  };
  project_milestone_scaffolding_patch: {
    active_collaboration: ActiveCollaboration;
  };
  mutation: {
    type: 'project.created';
    collaboration: ActiveCollaboration;
  };
}

const baseUrl = (process.env.PROJECT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
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

const explorerAId = randomUUID();
const explorerBId = randomUUID();

const explorerAWallet = '0x1111111111111111111111111111111111111111';
const explorerBWallet = '0x2222222222222222222222222222222222222222';
const multisigAddress = '0x3333333333333333333333333333333333333333';
const fundedTxHash = `0x${'5c7a'.padEnd(64, '0')}`;

async function main() {
  try {
    await seedPartners();

    const createResponse = await createProject();
    const collaboration =
      createResponse.project_milestone_scaffolding_patch.active_collaboration;

    assert(collaboration.workspace_status === 'proposed', 'workspace_status must initialize as proposed');
    assert(collaboration.creator_member_id === explorerAId, 'creator_member_id mismatch');
    assert(collaboration.partner_member_id === explorerBId, 'partner_member_id mismatch');
    assert(
      createResponse.workspace_reference.project_id === collaboration.project_id,
      'workspace reference project_id mismatch',
    );

    let graph = buildInitialGraph(collaboration);
    const multisigConfig: MultisigConfig = {
      chain_id: 8453,
      multisig_address: multisigAddress,
      threshold: 2,
      signers: [explorerAWallet, explorerBWallet],
    };

    graph = applyProjectEscrowMutation(graph, {
      type: 'multisig.configured',
      project_id: collaboration.project_id,
      multisig_config: multisigConfig,
      updated_at: new Date().toISOString(),
    });

    const milestone: MilestoneDefinition = {
      milestone_id: 1,
      title: 'First escrowed delivery',
      description: 'Ship the initial Consilience Engine planning artifact into the shared sandbox.',
      payout_amount_wei: '1000000000000000000',
      status: 'pending',
      completed: false,
    };

    graph = applyProjectEscrowMutation(graph, {
      type: 'milestone.added',
      project_id: collaboration.project_id,
      milestone,
      updated_at: new Date().toISOString(),
    });

    graph = applyProjectEscrowMutation(graph, {
      type: 'milestone.tx_attached',
      project_id: collaboration.project_id,
      milestone_id: milestone.milestone_id,
      tx_hash_attachment: fundedTxHash,
      updated_at: new Date().toISOString(),
    });

    graph = applyProjectEscrowMutation(graph, {
      type: 'milestone.status_updated',
      project_id: collaboration.project_id,
      milestone_id: milestone.milestone_id,
      status: 'funded',
      completed: false,
      updated_at: new Date().toISOString(),
    });

    const finalProject = graph.project_milestone_scaffolding.active_collaborations.find(
      (project) => project.project_id === collaboration.project_id,
    );
    assert(finalProject, 'final project missing from ExplorerGraph');

    const finalMilestone = finalProject.milestone_definitions[0];
    assert(finalProject.workspace_status === 'proposed', 'workspace_status changed unexpectedly');
    assert(finalProject.multisig_config.chain_id === 8453, 'chain_id must be Base Mainnet');
    assert(finalProject.multisig_config.multisig_address === multisigAddress, 'multisig address mismatch');
    assert(finalProject.multisig_config.threshold === 2, 'threshold must be 2');
    assert(finalProject.multisig_config.signers.length === 2, 'must preserve exactly 2 signers');
    assert(finalMilestone.milestone_id === 1, 'milestone_id mismatch');
    assert(finalMilestone.payout_amount_wei === '1000000000000000000', 'payout_amount_wei mismatch');
    assert(finalMilestone.status === 'funded', 'milestone status must be funded');
    assert(finalMilestone.completed === false, 'funded milestone should not be completed');
    assert(finalMilestone.tx_hash_attachment === fundedTxHash, 'transaction hash mismatch');

    console.log(
      JSON.stringify(
        {
          phase: 'collaboration_lifecycle_complete',
          project_audit_id: createResponse.audit_id,
          explorer_a_id: explorerAId,
          explorer_b_id: explorerBId,
          project: {
            project_id: finalProject.project_id,
            title: finalProject.title,
            workspace_status: finalProject.workspace_status,
            creator_member_id: finalProject.creator_member_id,
            partner_member_id: finalProject.partner_member_id,
            multisig_config: finalProject.multisig_config,
            milestone_definitions: finalProject.milestone_definitions,
          },
          explorer_graph_scaffold: graph.project_milestone_scaffolding,
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupPartners();
  }
}

async function seedPartners() {
  const { error } = await supabase.from('members').insert([
    {
      id: explorerAId,
      display_name: 'Lifecycle Explorer A',
      tier: 'free',
      wallet_address: explorerAWallet,
    },
    {
      id: explorerBId,
      display_name: 'Lifecycle Explorer B',
      tier: 'free',
      wallet_address: explorerBWallet,
    },
  ]);

  if (error) throw new Error(`Failed to seed lifecycle partners: ${error.message}`);
}

async function createProject(): Promise<ProjectCreateResponse> {
  const res = await fetch(`${baseUrl}/api/projects/create`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: `soe_wallet_id=${explorerAId}`,
    },
    body: JSON.stringify({
      creator_member_id: explorerAId,
      partner_member_id: explorerBId,
      title: 'Consilience Engine Sandbox',
      description:
        'A privacy-preserving collaboration sandbox for aligning philosophical vectors with executable project milestones.',
      escrow_settlement_preferences: {
        preferred_chain_id: 8453,
        fallback_arbitration_enabled: true,
      },
    }),
  });

  const body = (await res.json()) as ProjectCreateResponse | { audit_id?: string; error?: string };
  const headerAuditId = res.headers.get('x-project-audit-id');

  if (headerAuditId !== body.audit_id) {
    throw new Error(`Project audit ID mismatch. header=${headerAuditId} body=${body.audit_id}`);
  }

  if (!res.ok || !('ok' in body) || body.ok !== true) {
    throw new Error(`Project creation failed: ${JSON.stringify(body)}`);
  }

  return body;
}

function buildInitialGraph(collaboration: ActiveCollaboration): ExplorerGraph {
  return {
    schema_version: 2,
    updated_at: new Date().toISOString(),
    epistemic_vectors: {
      rationalism_vs_empiricism: 0.65,
      risk_acceleration_tolerance: 0.2,
      open_source_conviction: 0.85,
    },
    coordination_profiles: {
      primary_builder_archetype: 'Systems Architect',
      decentralization_conviction: 0.74,
      synergistic_skills: ['protocol design', 'zero knowledge proofs'],
    },
    consciousness_telemetry: {
      measured_perspective_scale: 640,
      cohesion_analytics_index: 0.82,
    },
    project_milestone_scaffolding: {
      active_collaborations: [collaboration],
      escrow_settlement_preferences: {
        preferred_chain_id: 8453,
        fallback_arbitration_enabled: true,
      },
    },
  };
}

async function cleanupPartners() {
  await supabase.from('members').delete().in('id', [explorerAId, explorerBId]);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
