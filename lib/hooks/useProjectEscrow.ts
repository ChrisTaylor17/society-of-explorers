'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  getDefaultLiveBaseChainId,
} from '../blockchain/liveBaseProfile';
import type {
  ActiveCollaboration,
  EscrowSettlementPreferences,
  ExplorerGraph,
  MilestoneDefinition,
  MilestoneStatus,
  MultisigConfig,
  ProjectMilestoneScaffolding,
  WorkspaceStatus,
} from '../movement/explorerGraph';

const ETH_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const SUPPORTED_CHAIN_IDS = new Set([1, 10, BASE_MAINNET_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID, 42161]);

export type ProjectEscrowMutation =
  | {
      type: 'project.created';
      collaboration: ActiveCollaboration;
      escrow_settlement_preferences?: EscrowSettlementPreferences;
    }
  | {
      type: 'workspace.status_updated';
      project_id: string;
      workspace_status: WorkspaceStatus;
      updated_at: string;
    }
  | {
      type: 'multisig.configured';
      project_id: string;
      multisig_config: MultisigConfig;
      updated_at: string;
    }
  | {
      type: 'milestone.added';
      project_id: string;
      milestone: MilestoneDefinition;
      updated_at: string;
    }
  | {
      type: 'milestone.status_updated';
      project_id: string;
      milestone_id: number;
      status: MilestoneStatus;
      completed?: boolean;
      updated_at: string;
    }
  | {
      type: 'milestone.tx_attached';
      project_id: string;
      milestone_id: number;
      tx_hash_attachment: string;
      updated_at: string;
    }
  | {
      type: 'settlement.preferences_updated';
      escrow_settlement_preferences: EscrowSettlementPreferences;
      updated_at: string;
    };

export interface ProjectEscrowSyncTarget {
  mutate: (mutation: ProjectEscrowMutation, options?: { sync?: boolean }) => string;
}

export interface CreateLocalMilestoneInput {
  title: string;
  description?: string;
  payout_amount_wei: string;
}

export interface UseProjectEscrowOptions {
  graph: ExplorerGraph;
  syncTarget?: ProjectEscrowSyncTarget;
  onMutation?: (mutation: ProjectEscrowMutation, nextGraph: ExplorerGraph) => void;
}

export interface UseProjectEscrowResult {
  graph: ExplorerGraph;
  scaffolding: ProjectMilestoneScaffolding;
  active_collaborations: readonly ActiveCollaboration[];
  escrow_settlement_preferences: EscrowSettlementPreferences;
  getProject: (projectId: string) => ActiveCollaboration | null;
  dispatch: (mutation: ProjectEscrowMutation, options?: { sync?: boolean }) => void;
  createProject: (
    collaboration: ActiveCollaboration,
    preferences?: EscrowSettlementPreferences,
    options?: { sync?: boolean },
  ) => void;
  configureMultisig: (
    projectId: string,
    multisigConfig: MultisigConfig,
    options?: { sync?: boolean },
  ) => void;
  addMilestone: (
    projectId: string,
    milestone: CreateLocalMilestoneInput,
    options?: { sync?: boolean },
  ) => MilestoneDefinition;
  attachMilestoneTransaction: (
    projectId: string,
    milestoneId: number,
    txHash: string,
    options?: { sync?: boolean },
  ) => void;
  updateMilestoneStatus: (
    projectId: string,
    milestoneId: number,
    status: MilestoneStatus,
    options?: { completed?: boolean; sync?: boolean },
  ) => void;
  fundMilestone: (projectId: string, milestoneId: number, options?: { sync?: boolean }) => void;
  markMilestoneComplete: (projectId: string, milestoneId: number, options?: { sync?: boolean }) => void;
  releaseMilestone: (projectId: string, milestoneId: number, options?: { sync?: boolean }) => void;
  refundMilestone: (projectId: string, milestoneId: number, options?: { sync?: boolean }) => void;
  updateWorkspaceStatus: (
    projectId: string,
    status: WorkspaceStatus,
    options?: { sync?: boolean },
  ) => void;
  updateSettlementPreferences: (
    preferences: EscrowSettlementPreferences,
    options?: { sync?: boolean },
  ) => void;
}

export function useProjectEscrow(options: UseProjectEscrowOptions): UseProjectEscrowResult {
  const [graph, setGraph] = useState(() => normalizeExplorerGraph(options.graph));
  const graphRef = useRef(graph);

  useEffect(() => {
    const normalized = normalizeExplorerGraph(options.graph);
    graphRef.current = normalized;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset local escrow graph when pod state is replaced.
    setGraph(normalized);
  }, [options.graph]);

  const commit = useCallback(
    (mutation: ProjectEscrowMutation, commitOptions?: { sync?: boolean }) => {
      const nextGraph = applyProjectEscrowMutation(graphRef.current, mutation);
      graphRef.current = nextGraph;
      setGraph(nextGraph);
      options.onMutation?.(mutation, nextGraph);
      if (commitOptions?.sync !== false) {
        options.syncTarget?.mutate(mutation, commitOptions);
      }
    },
    [options],
  );

  const getProject = useCallback((projectId: string) => {
    return (
      graphRef.current.project_milestone_scaffolding.active_collaborations.find(
        (project) => project.project_id === projectId,
      ) || null
    );
  }, []);

  const createProject = useCallback(
    (
      collaboration: ActiveCollaboration,
      preferences?: EscrowSettlementPreferences,
      createOptions?: { sync?: boolean },
    ) => {
      commit(
        {
          type: 'project.created',
          collaboration: normalizeCollaboration(collaboration),
          escrow_settlement_preferences: preferences
            ? normalizeSettlementPreferences(preferences)
            : undefined,
        },
        createOptions,
      );
    },
    [commit],
  );

  const configureMultisig = useCallback(
    (projectId: string, multisigConfig: MultisigConfig, configureOptions?: { sync?: boolean }) => {
      commit(
        {
          type: 'multisig.configured',
          project_id: projectId,
          multisig_config: normalizeMultisigConfig(multisigConfig),
          updated_at: new Date().toISOString(),
        },
        configureOptions,
      );
    },
    [commit],
  );

  const addMilestone = useCallback(
    (projectId: string, milestone: CreateLocalMilestoneInput, addOptions?: { sync?: boolean }) => {
      const project = requireProject(graphRef.current, projectId);
      const nextMilestone: MilestoneDefinition = {
        milestone_id: nextMilestoneId(project),
        title: boundedString(milestone.title, 'Untitled milestone', 120),
        description: boundedString(milestone.description, '', 1200),
        payout_amount_wei: normalizeWeiAmount(milestone.payout_amount_wei),
        status: 'pending',
        completed: false,
      };

      commit(
        {
          type: 'milestone.added',
          project_id: projectId,
          milestone: nextMilestone,
          updated_at: new Date().toISOString(),
        },
        addOptions,
      );

      return nextMilestone;
    },
    [commit],
  );

  const attachMilestoneTransaction = useCallback(
    (
      projectId: string,
      milestoneId: number,
      txHash: string,
      attachOptions?: { sync?: boolean },
    ) => {
      if (!TX_HASH_PATTERN.test(txHash)) {
        throw new Error('tx_hash_attachment must be a 32-byte hex transaction hash.');
      }

      commit(
        {
          type: 'milestone.tx_attached',
          project_id: projectId,
          milestone_id: milestoneId,
          tx_hash_attachment: txHash,
          updated_at: new Date().toISOString(),
        },
        attachOptions,
      );
    },
    [commit],
  );

  const updateMilestoneStatus = useCallback(
    (
      projectId: string,
      milestoneId: number,
      status: MilestoneStatus,
      statusOptions?: { completed?: boolean; sync?: boolean },
    ) => {
      commit(
        {
          type: 'milestone.status_updated',
          project_id: projectId,
          milestone_id: milestoneId,
          status,
          completed: statusOptions?.completed,
          updated_at: new Date().toISOString(),
        },
        statusOptions,
      );
    },
    [commit],
  );

  const updateWorkspaceStatus = useCallback(
    (projectId: string, status: WorkspaceStatus, statusOptions?: { sync?: boolean }) => {
      commit(
        {
          type: 'workspace.status_updated',
          project_id: projectId,
          workspace_status: status,
          updated_at: new Date().toISOString(),
        },
        statusOptions,
      );
    },
    [commit],
  );

  const updateSettlementPreferences = useCallback(
    (preferences: EscrowSettlementPreferences, preferenceOptions?: { sync?: boolean }) => {
      commit(
        {
          type: 'settlement.preferences_updated',
          escrow_settlement_preferences: normalizeSettlementPreferences(preferences),
          updated_at: new Date().toISOString(),
        },
        preferenceOptions,
      );
    },
    [commit],
  );

  const result = useMemo<UseProjectEscrowResult>(
    () => ({
      graph,
      scaffolding: graph.project_milestone_scaffolding,
      active_collaborations: graph.project_milestone_scaffolding.active_collaborations,
      escrow_settlement_preferences:
        graph.project_milestone_scaffolding.escrow_settlement_preferences,
      getProject,
      dispatch: commit,
      createProject,
      configureMultisig,
      addMilestone,
      attachMilestoneTransaction,
      updateMilestoneStatus,
      fundMilestone: (projectId, milestoneId, fundOptions) =>
        updateMilestoneStatus(projectId, milestoneId, 'funded', fundOptions),
      markMilestoneComplete: (projectId, milestoneId, completeOptions) =>
        updateMilestoneStatus(projectId, milestoneId, 'completed_pending_arbitration', {
          ...completeOptions,
          completed: true,
        }),
      releaseMilestone: (projectId, milestoneId, releaseOptions) =>
        updateMilestoneStatus(projectId, milestoneId, 'released', {
          ...releaseOptions,
          completed: true,
        }),
      refundMilestone: (projectId, milestoneId, refundOptions) =>
        updateMilestoneStatus(projectId, milestoneId, 'refunded', refundOptions),
      updateWorkspaceStatus,
      updateSettlementPreferences,
    }),
    [
      addMilestone,
      attachMilestoneTransaction,
      commit,
      configureMultisig,
      createProject,
      getProject,
      graph,
      updateMilestoneStatus,
      updateSettlementPreferences,
      updateWorkspaceStatus,
    ],
  );

  return result;
}

export function applyProjectEscrowMutation(
  graph: ExplorerGraph,
  mutation: ProjectEscrowMutation,
): ExplorerGraph {
  const normalized = normalizeExplorerGraph(graph);
  const now = 'updated_at' in mutation ? mutation.updated_at : new Date().toISOString();

  switch (mutation.type) {
    case 'project.created':
      return updateScaffolding(normalized, now, (scaffolding) => {
        const collaboration = normalizeCollaboration(mutation.collaboration);
        const withoutDuplicate = scaffolding.active_collaborations.filter(
          (project) => project.project_id !== collaboration.project_id,
        );
        return {
          ...scaffolding,
          active_collaborations: [...withoutDuplicate, collaboration],
          escrow_settlement_preferences: mutation.escrow_settlement_preferences
            ? normalizeSettlementPreferences(mutation.escrow_settlement_preferences)
            : scaffolding.escrow_settlement_preferences,
        };
      });

    case 'workspace.status_updated':
      return updateProject(normalized, mutation.project_id, now, (project) => {
        assertWorkspaceTransition(project.workspace_status, mutation.workspace_status);
        return {
          ...project,
          workspace_status: mutation.workspace_status,
        };
      });

    case 'multisig.configured':
      return updateProject(normalized, mutation.project_id, now, (project) => ({
        ...project,
        multisig_config: normalizeMultisigConfig(mutation.multisig_config),
      }));

    case 'milestone.added':
      return updateProject(normalized, mutation.project_id, now, (project) => {
        const milestone = normalizeMilestone(mutation.milestone);
        if (project.milestone_definitions.some((entry) => entry.milestone_id === milestone.milestone_id)) {
          throw new Error(`Milestone ${milestone.milestone_id} already exists.`);
        }
        return {
          ...project,
          milestone_definitions: [...project.milestone_definitions, milestone],
        };
      });

    case 'milestone.status_updated':
      return updateMilestone(normalized, mutation.project_id, mutation.milestone_id, now, (milestone) => {
        assertMilestoneTransition(milestone.status, mutation.status);
        return {
          ...milestone,
          status: mutation.status,
          completed:
            typeof mutation.completed === 'boolean'
              ? mutation.completed
              : mutation.status === 'completed_pending_arbitration' || mutation.status === 'released'
                ? true
                : milestone.completed,
        };
      });

    case 'milestone.tx_attached':
      if (!TX_HASH_PATTERN.test(mutation.tx_hash_attachment)) {
        throw new Error('tx_hash_attachment must be a 32-byte hex transaction hash.');
      }
      return updateMilestone(normalized, mutation.project_id, mutation.milestone_id, now, (milestone) => ({
        ...milestone,
        tx_hash_attachment: mutation.tx_hash_attachment,
      }));

    case 'settlement.preferences_updated':
      return updateScaffolding(normalized, mutation.updated_at, (scaffolding) => ({
        ...scaffolding,
        escrow_settlement_preferences: normalizeSettlementPreferences(
          mutation.escrow_settlement_preferences,
        ),
      }));
  }
}

function updateScaffolding(
  graph: ExplorerGraph,
  updatedAt: string,
  update: (scaffolding: ProjectMilestoneScaffolding) => ProjectMilestoneScaffolding,
): ExplorerGraph {
  return {
    ...graph,
    updated_at: updatedAt,
    project_milestone_scaffolding: update(graph.project_milestone_scaffolding),
  };
}

function updateProject(
  graph: ExplorerGraph,
  projectId: string,
  updatedAt: string,
  update: (project: ActiveCollaboration) => ActiveCollaboration,
): ExplorerGraph {
  return updateScaffolding(graph, updatedAt, (scaffolding) => ({
    ...scaffolding,
    active_collaborations: scaffolding.active_collaborations.map((project) =>
      project.project_id === projectId
        ? {
            ...update(project),
            updated_at: updatedAt,
          }
        : project,
    ),
  }));
}

function updateMilestone(
  graph: ExplorerGraph,
  projectId: string,
  milestoneId: number,
  updatedAt: string,
  update: (milestone: MilestoneDefinition) => MilestoneDefinition,
): ExplorerGraph {
  return updateProject(graph, projectId, updatedAt, (project) => {
    if (!project.milestone_definitions.some((milestone) => milestone.milestone_id === milestoneId)) {
      throw new Error(`Milestone ${milestoneId} does not exist.`);
    }

    return {
      ...project,
      milestone_definitions: project.milestone_definitions.map((milestone) =>
        milestone.milestone_id === milestoneId ? update(milestone) : milestone,
      ),
    };
  });
}

function normalizeExplorerGraph(graph: ExplorerGraph): ExplorerGraph {
  return {
    ...graph,
    schema_version: 2,
    project_milestone_scaffolding: {
      active_collaborations: graph.project_milestone_scaffolding.active_collaborations.map(
        normalizeCollaboration,
      ),
      escrow_settlement_preferences: normalizeSettlementPreferences(
        graph.project_milestone_scaffolding.escrow_settlement_preferences,
      ),
    },
  };
}

function normalizeCollaboration(collaboration: ActiveCollaboration): ActiveCollaboration {
  const now = new Date().toISOString();
  return {
    ...collaboration,
    title: boundedString(collaboration.title, 'Untitled project', 120),
    description: boundedString(collaboration.description, '', 2000),
    multisig_config: normalizeMultisigConfig(collaboration.multisig_config),
    milestone_definitions: collaboration.milestone_definitions.map(normalizeMilestone),
    created_at: collaboration.created_at || now,
    updated_at: collaboration.updated_at || now,
  };
}

function normalizeMilestone(milestone: MilestoneDefinition): MilestoneDefinition {
  return {
    milestone_id: milestone.milestone_id,
    title: boundedString(milestone.title, `Milestone ${milestone.milestone_id}`, 120),
    description: boundedString(milestone.description, '', 1200),
    payout_amount_wei: normalizeWeiAmount(milestone.payout_amount_wei),
    status: milestone.status,
    completed:
      milestone.completed ||
      milestone.status === 'completed_pending_arbitration' ||
      milestone.status === 'released',
    ...(milestone.tx_hash_attachment && TX_HASH_PATTERN.test(milestone.tx_hash_attachment)
      ? { tx_hash_attachment: milestone.tx_hash_attachment }
      : {}),
  };
}

function normalizeMultisigConfig(config: MultisigConfig): MultisigConfig {
  const signers = uniqueStrings(config.signers.filter((address) => ETH_ADDRESS_PATTERN.test(address)));
  const threshold = Math.max(1, Math.min(Math.floor(config.threshold), Math.max(signers.length, 1)));

  return {
    chain_id: SUPPORTED_CHAIN_IDS.has(config.chain_id) ? config.chain_id : getDefaultLiveBaseChainId(),
    multisig_address: ETH_ADDRESS_PATTERN.test(config.multisig_address)
      ? config.multisig_address
      : '0x0000000000000000000000000000000000000000',
    threshold,
    signers,
  };
}

function normalizeSettlementPreferences(
  preferences: EscrowSettlementPreferences,
): EscrowSettlementPreferences {
  return {
    preferred_chain_id: SUPPORTED_CHAIN_IDS.has(preferences.preferred_chain_id)
      ? preferences.preferred_chain_id
      : getDefaultLiveBaseChainId(),
    fallback_arbitration_enabled: Boolean(preferences.fallback_arbitration_enabled),
  };
}

function assertWorkspaceTransition(current: WorkspaceStatus, next: WorkspaceStatus) {
  const allowed: Record<WorkspaceStatus, WorkspaceStatus[]> = {
    proposed: ['active', 'terminated'],
    active: ['paused', 'completed', 'terminated'],
    paused: ['active', 'terminated'],
    completed: [],
    terminated: [],
  };

  if (current === next) return;
  if (!allowed[current].includes(next)) {
    throw new Error(`Invalid workspace transition from ${current} to ${next}.`);
  }
}

function assertMilestoneTransition(current: MilestoneStatus, next: MilestoneStatus) {
  const allowed: Record<MilestoneStatus, MilestoneStatus[]> = {
    pending: ['funded', 'refunded'],
    funded: ['completed_pending_arbitration', 'refunded'],
    completed_pending_arbitration: ['released', 'refunded'],
    released: [],
    refunded: [],
  };

  if (current === next) return;
  if (!allowed[current].includes(next)) {
    throw new Error(`Invalid milestone transition from ${current} to ${next}.`);
  }
}

function requireProject(graph: ExplorerGraph, projectId: string): ActiveCollaboration {
  const project = graph.project_milestone_scaffolding.active_collaborations.find(
    (entry) => entry.project_id === projectId,
  );
  if (!project) throw new Error(`Project ${projectId} does not exist.`);
  return project;
}

function nextMilestoneId(project: ActiveCollaboration): number {
  return project.milestone_definitions.reduce(
    (max, milestone) => Math.max(max, milestone.milestone_id),
    0,
  ) + 1;
}

function normalizeWeiAmount(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error('payout_amount_wei must be a uint256 string.');
  return value.replace(/^0+(?=\d)/, '');
}

function boundedString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
