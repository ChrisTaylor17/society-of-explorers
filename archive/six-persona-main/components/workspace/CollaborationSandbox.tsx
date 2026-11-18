'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  ExternalLink,
  GitBranch,
  Link2,
  LockKeyhole,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  ShieldCheck,
  Terminal,
  WalletCards,
} from 'lucide-react';
import type {
  ActiveCollaboration,
  ExplorerGraph,
  MilestoneDefinition,
  MilestoneStatus,
  MultisigConfig,
  WorkspaceStatus,
} from '@/lib/movement/explorerGraph';
import type { PodSyncStatus } from '@/lib/hooks/usePodSync';
import {
  type ProjectEscrowSyncTarget,
  useProjectEscrow,
} from '@/lib/hooks/useProjectEscrow';

interface CollaborationSandboxSyncState {
  sync_status: PodSyncStatus;
  pending_count: number;
  is_dirty: boolean;
  last_audit_id?: string | null;
  next_retry_at?: string | null;
  last_error?: string | null;
  last_synced_at?: string | null;
}

export interface CollaborationSandboxProps {
  graph: ExplorerGraph;
  projectId: string;
  syncTarget?: ProjectEscrowSyncTarget;
  syncState?: CollaborationSandboxSyncState;
  className?: string;
  onGraphChange?: (graph: ExplorerGraph) => void;
}

type TerminalEntry = {
  id: string;
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
};

const STATUS_LABELS: Record<WorkspaceStatus, string> = {
  proposed: 'Proposed',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  terminated: 'Terminated',
};

const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  pending: 'Pending',
  funded: 'Funded',
  completed_pending_arbitration: 'Pending arbitration',
  released: 'Released',
  refunded: 'Refunded',
};

export function CollaborationSandbox({
  graph,
  projectId,
  syncTarget,
  syncState,
  className,
  onGraphChange,
}: CollaborationSandboxProps) {
  const [txHashes, setTxHashes] = useState<Record<number, string>>({});
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);

  const escrow = useProjectEscrow({
    graph,
    syncTarget,
    onMutation: (mutation, nextGraph) => {
      onGraphChange?.(nextGraph);
      setTerminalEntries((entries) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          at: new Date().toISOString(),
          level: 'info' as const,
          message: `${mutation.type} queued for encrypted pod sync`,
        },
        ...entries,
      ].slice(0, 8));
    },
  });

  const project = escrow.getProject(projectId);
  const sortedMilestones = useMemo(
    () =>
      [...(project?.milestone_definitions || [])].sort(
        (left, right) => left.milestone_id - right.milestone_id,
      ),
    [project?.milestone_definitions],
  );

  const syncEntries = useMemo(
    () => buildSyncEntries(syncState, terminalEntries),
    [syncState, terminalEntries],
  );

  if (!project) {
    return (
      <section
        className={cx(
          'rounded-lg border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm',
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 text-amber-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold">Workspace unavailable</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
              Project `{projectId}` is not present in the encrypted Explorer Graph.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const updateTxHash = (milestoneId: number, value: string) => {
    setTxHashes((current) => ({ ...current, [milestoneId]: value.trim() }));
  };

  const attachTransaction = (milestone: MilestoneDefinition) => {
    const txHash = txHashes[milestone.milestone_id] || '';
    escrow.attachMilestoneTransaction(project.project_id, milestone.milestone_id, txHash);
    setTerminalEntries((entries) => [
      {
        id: `${Date.now()}-${milestone.milestone_id}`,
        at: new Date().toISOString(),
        level: 'info' as const,
        message: `tx_hash_attachment stored for milestone ${milestone.milestone_id}`,
      },
      ...entries,
    ].slice(0, 8));
  };

  return (
    <section
      className={cx(
        'overflow-hidden rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-sm',
        className,
      )}
    >
      <WorkspaceHeader
        project={project}
        syncStatus={syncState?.sync_status}
        onActivate={() => escrow.updateWorkspaceStatus(project.project_id, 'active')}
        onPause={() => escrow.updateWorkspaceStatus(project.project_id, 'paused')}
      />

      <div className="grid gap-0 border-t border-zinc-200 lg:grid-cols-[1.1fr_0.9fr]">
        <MilestonePipeline
          project={project}
          milestones={sortedMilestones}
          txHashes={txHashes}
          onTxHashChange={updateTxHash}
          onAttachTransaction={attachTransaction}
          onFund={(milestone) =>
            escrow.updateMilestoneStatus(project.project_id, milestone.milestone_id, 'funded')
          }
          onComplete={(milestone) =>
            escrow.updateMilestoneStatus(
              project.project_id,
              milestone.milestone_id,
              'completed_pending_arbitration',
              { completed: true },
            )
          }
          onRelease={(milestone) =>
            escrow.updateMilestoneStatus(project.project_id, milestone.milestone_id, 'released', {
              completed: true,
            })
          }
        />

        <div className="border-t border-zinc-200 bg-zinc-50/70 lg:border-l lg:border-t-0">
          <MultisigPanel config={project.multisig_config} />
          <SyncTerminal syncEntries={syncEntries} syncState={syncState} />
        </div>
      </div>
    </section>
  );
}

function WorkspaceHeader({
  project,
  syncStatus,
  onActivate,
  onPause,
}: {
  project: ActiveCollaboration;
  syncStatus?: PodSyncStatus;
  onActivate: () => void;
  onPause: () => void;
}) {
  const canActivate = project.workspace_status === 'proposed' || project.workspace_status === 'paused';
  const canPause = project.workspace_status === 'active';

  return (
    <header className="grid gap-5 px-5 py-5 md:grid-cols-[1fr_auto] md:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-normal text-zinc-950">
            {project.title}
          </h1>
          <StatusPill status={project.workspace_status} />
          {syncStatus ? <SyncPill status={syncStatus} /> : null}
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{project.description}</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
          <span>Project {shortId(project.project_id)}</span>
          <span>Creator {shortId(project.creator_member_id)}</span>
          <span>Partner {shortId(project.partner_member_id)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onActivate}
          disabled={!canActivate}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <PlayCircle className="size-4" aria-hidden="true" />
          Activate
        </button>
        <button
          type="button"
          onClick={onPause}
          disabled={!canPause}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <PauseCircle className="size-4" aria-hidden="true" />
          Pause
        </button>
      </div>
    </header>
  );
}

function MultisigPanel({ config }: { config: MultisigConfig }) {
  const confirmedSigners = config.signers.length;
  const thresholdText = `${config.threshold}-of-${Math.max(confirmedSigners, config.threshold)} signers confirmed`;
  const configured = config.multisig_address !== '0x0000000000000000000000000000000000000000';

  return (
    <section className="border-b border-zinc-200 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-emerald-600" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-zinc-950">Multi-sig</h2>
        </div>
        <span
          className={cx(
            'rounded-md px-2 py-1 text-xs font-medium',
            configured
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700',
          )}
        >
          {configured ? 'Configured' : 'Draft'}
        </span>
      </div>

      <dl className="mt-4 grid gap-3">
        <DiagnosticRow
          icon={<GitBranch className="size-4" aria-hidden="true" />}
          label="Network"
          value={`Chain ID ${config.chain_id}`}
        />
        <DiagnosticRow
          icon={<WalletCards className="size-4" aria-hidden="true" />}
          label="Wallet"
          value={config.multisig_address}
          mono
        />
        <DiagnosticRow
          icon={<LockKeyhole className="size-4" aria-hidden="true" />}
          label="Threshold"
          value={thresholdText}
        />
      </dl>

      <div className="mt-4 space-y-2">
        {config.signers.map((signer) => (
          <div
            key={signer}
            className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2"
          >
            <span className="font-mono text-xs text-zinc-700">{truncateAddress(signer)}</span>
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
          </div>
        ))}
        {config.signers.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-500">
            No signer wallets attached.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MilestonePipeline({
  project,
  milestones,
  txHashes,
  onTxHashChange,
  onAttachTransaction,
  onFund,
  onComplete,
  onRelease,
}: {
  project: ActiveCollaboration;
  milestones: MilestoneDefinition[];
  txHashes: Record<number, string>;
  onTxHashChange: (milestoneId: number, value: string) => void;
  onAttachTransaction: (milestone: MilestoneDefinition) => void;
  onFund: (milestone: MilestoneDefinition) => void;
  onComplete: (milestone: MilestoneDefinition) => void;
  onRelease: (milestone: MilestoneDefinition) => void;
}) {
  return (
    <section className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-5 text-teal-600" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-zinc-950">Milestones</h2>
        </div>
        <span className="text-xs text-zinc-500">{milestones.length} total</span>
      </div>

      <div className="space-y-3">
        {milestones.map((milestone, index) => (
          <article
            key={milestone.milestone_id}
            className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-[0_1px_0_rgba(24,24,27,0.04)]"
          >
            <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-start">
              <div className="flex size-8 items-center justify-center rounded-md bg-zinc-950 text-sm font-semibold text-white">
                {index + 1}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-zinc-950">{milestone.title}</h3>
                  <MilestonePill status={milestone.status} />
                </div>
                <p className="mt-1 text-sm leading-6 text-zinc-600">{milestone.description}</p>
              </div>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-right">
                <div className="text-[11px] font-medium uppercase text-zinc-500">Payout</div>
                <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-950">
                  {formatWei(milestone.payout_amount_wei)}
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-md bg-zinc-50 p-3 md:grid-cols-[1fr_auto] md:items-center">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-zinc-600">Transaction hash</span>
                <input
                  value={txHashes[milestone.milestone_id] ?? milestone.tx_hash_attachment ?? ''}
                  onChange={(event) => onTxHashChange(milestone.milestone_id, event.target.value)}
                  placeholder="0x..."
                  className="h-10 min-w-0 rounded-md border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
                />
              </label>

              <div className="flex flex-wrap gap-2 md:justify-end">
                <button
                  type="button"
                  onClick={() => onAttachTransaction(milestone)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                >
                  <Link2 className="size-4" aria-hidden="true" />
                  Attach
                </button>
                <button
                  type="button"
                  onClick={() => onFund(milestone)}
                  disabled={milestone.status !== 'pending'}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <CircleDollarSign className="size-4" aria-hidden="true" />
                  Funded
                </button>
                <button
                  type="button"
                  onClick={() => onComplete(milestone)}
                  disabled={milestone.status !== 'funded'}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 text-sm font-medium text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ClipboardCheck className="size-4" aria-hidden="true" />
                  Complete
                </button>
                <button
                  type="button"
                  onClick={() => onRelease(milestone)}
                  disabled={milestone.status !== 'completed_pending_arbitration'}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 text-sm font-medium text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Release
                </button>
              </div>
            </div>
          </article>
        ))}

        {milestones.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
            {project.title} has no milestones yet.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SyncTerminal({
  syncEntries,
  syncState,
}: {
  syncEntries: TerminalEntry[];
  syncState?: CollaborationSandboxSyncState;
}) {
  return (
    <section className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Terminal className="size-5 text-zinc-700" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-zinc-950">Sync log</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <RefreshCcw className="size-3.5" aria-hidden="true" />
          {syncState?.pending_count ?? 0} pending
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="grid grid-cols-3 border-b border-zinc-800 text-xs">
          <TerminalMetric label="Status" value={syncState?.sync_status || 'local'} />
          <TerminalMetric label="Dirty" value={syncState?.is_dirty ? 'true' : 'false'} />
          <TerminalMetric label="Audit" value={syncState?.last_audit_id ? shortId(syncState.last_audit_id) : 'none'} />
        </div>
        <div className="max-h-64 space-y-1 overflow-auto p-3 font-mono text-xs leading-5">
          {syncEntries.map((entry) => (
            <div key={entry.id} className={terminalTextClass(entry.level)}>
              <span className="text-zinc-500">{formatTerminalTime(entry.at)}</span>{' '}
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TerminalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <div className="text-[10px] uppercase tracking-normal text-zinc-500">{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs text-zinc-100">{value}</div>
    </div>
  );
}

function DiagnosticRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[auto_84px_1fr] items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2">
      <div className="text-zinc-500">{icon}</div>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className={cx('truncate text-right text-sm text-zinc-950', mono && 'font-mono text-xs')}>
        {value}
      </dd>
    </div>
  );
}

function StatusPill({ status }: { status: WorkspaceStatus }) {
  return (
    <span className={cx('rounded-md px-2 py-1 text-xs font-medium', workspaceStatusClass(status))}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function SyncPill({ status }: { status: PodSyncStatus }) {
  return (
    <span className={cx('rounded-md px-2 py-1 text-xs font-medium', syncStatusClass(status))}>
      {status}
    </span>
  );
}

function MilestonePill({ status }: { status: MilestoneStatus }) {
  return (
    <span className={cx('rounded-md px-2 py-1 text-xs font-medium', milestoneStatusClass(status))}>
      {MILESTONE_LABELS[status]}
    </span>
  );
}

function buildSyncEntries(
  syncState: CollaborationSandboxSyncState | undefined,
  localEntries: TerminalEntry[],
): TerminalEntry[] {
  const now = new Date().toISOString();
  const entries: TerminalEntry[] = [];

  if (syncState) {
    entries.push({
      id: 'sync-status',
      at: now,
      level: syncState.sync_status === 'error' || syncState.sync_status === 'unauthenticated' ? 'error' : 'info',
      message: `pod sync ${syncState.sync_status}; pending mutations ${syncState.pending_count}`,
    });

    if (syncState.last_synced_at) {
      entries.push({
        id: 'last-synced',
        at: syncState.last_synced_at,
        level: 'info',
        message: `last synced at ${syncState.last_synced_at}`,
      });
    }

    if (syncState.next_retry_at) {
      entries.push({
        id: 'next-retry',
        at: now,
        level: 'warn',
        message: `retry scheduled for ${syncState.next_retry_at}`,
      });
    }

    if (syncState.last_error) {
      entries.push({
        id: 'last-error',
        at: now,
        level: 'error',
        message: syncState.last_error,
      });
    }
  } else {
    entries.push({
      id: 'local-only',
      at: now,
      level: 'warn',
      message: 'pod sync diagnostics not attached',
    });
  }

  return [...entries, ...localEntries].slice(0, 10);
}

function formatWei(value: string): string {
  if (!/^\d+$/.test(value)) return '0 ETH';
  const wei = BigInt(value);
  const divisor = 10n ** 18n;
  const whole = wei / divisor;
  const fraction = wei % divisor;

  if (fraction === 0n) return `${whole.toString()} ETH`;

  const fractionText = fraction.toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
  return `${whole.toString()}.${fractionText || '0'} ETH`;
}

function truncateAddress(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatTerminalTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], { hour12: false });
}

function workspaceStatusClass(status: WorkspaceStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700';
    case 'paused':
      return 'bg-amber-50 text-amber-700';
    case 'completed':
      return 'bg-teal-50 text-teal-700';
    case 'terminated':
      return 'bg-rose-50 text-rose-700';
    case 'proposed':
      return 'bg-zinc-100 text-zinc-700';
  }
}

function milestoneStatusClass(status: MilestoneStatus): string {
  switch (status) {
    case 'funded':
      return 'bg-emerald-50 text-emerald-700';
    case 'completed_pending_arbitration':
      return 'bg-amber-50 text-amber-700';
    case 'released':
      return 'bg-violet-50 text-violet-700';
    case 'refunded':
      return 'bg-rose-50 text-rose-700';
    case 'pending':
      return 'bg-zinc-100 text-zinc-700';
  }
}

function syncStatusClass(status: PodSyncStatus): string {
  switch (status) {
    case 'syncing':
      return 'bg-teal-50 text-teal-700';
    case 'offline':
      return 'bg-amber-50 text-amber-700';
    case 'error':
    case 'unauthenticated':
      return 'bg-rose-50 text-rose-700';
    case 'idle':
      return 'bg-zinc-100 text-zinc-700';
  }
}

function terminalTextClass(level: TerminalEntry['level']): string {
  switch (level) {
    case 'error':
      return 'text-rose-300';
    case 'warn':
      return 'text-amber-300';
    case 'info':
      return 'text-emerald-300';
  }
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export default CollaborationSandbox;
