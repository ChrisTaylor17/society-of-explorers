export type BuilderArchetype =
  | 'Systems Architect'
  | 'Visionary Philosopher'
  | 'Algorithmic Operator'
  | 'Growth Catalyst';

export type WorkspaceStatus =
  | 'proposed'
  | 'active'
  | 'paused'
  | 'completed'
  | 'terminated';

export type MilestoneStatus =
  | 'pending'
  | 'funded'
  | 'completed_pending_arbitration'
  | 'released'
  | 'refunded';

export interface EpistemicVectors {
  rationalism_vs_empiricism: number;
  risk_acceleration_tolerance: number;
  open_source_conviction: number;
}

export interface CoordinationProfiles {
  primary_builder_archetype: BuilderArchetype;
  decentralization_conviction: number;
  synergistic_skills: string[];
}

export interface ConsciousnessTelemetry {
  measured_perspective_scale: number;
  cohesion_analytics_index: number;
}

export interface MilestoneDefinition {
  milestone_id: number;
  title: string;
  description: string;
  payout_amount_wei: string;
  status: MilestoneStatus;
  completed: boolean;
  tx_hash_attachment?: string;
}

export interface MultisigConfig {
  chain_id: number;
  multisig_address: string;
  threshold: number;
  signers: string[];
}

export interface EscrowSettlementPreferences {
  preferred_chain_id: number;
  fallback_arbitration_enabled: boolean;
}

export interface ActiveCollaboration {
  project_id: string;
  title: string;
  description: string;
  workspace_status: WorkspaceStatus;
  creator_member_id: string;
  partner_member_id: string;
  multisig_config: MultisigConfig;
  milestone_definitions: MilestoneDefinition[];
  created_at: string;
  updated_at: string;
}

export interface ProjectMilestoneScaffolding {
  active_collaborations: ActiveCollaboration[];
  escrow_settlement_preferences: EscrowSettlementPreferences;
}

export interface ExplorerGraph {
  schema_version: 2;
  updated_at: string;
  epistemic_vectors: EpistemicVectors;
  coordination_profiles: CoordinationProfiles;
  consciousness_telemetry: ConsciousnessTelemetry;
  project_milestone_scaffolding: ProjectMilestoneScaffolding;
}
