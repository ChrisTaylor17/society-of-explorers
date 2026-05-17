'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SYNC_CIPHERTEXT_ENCODING,
  SYNC_ENVELOPE_KIND,
  SYNC_ENVELOPE_VERSION,
  canonicalSyncCommitmentInput,
  isRecord,
  type PodSyncEnvelope,
  type PodSyncRpcResult,
} from '../movement/podSync';
import { createClient } from '../supabase/client';

const STORAGE_SCHEMA_VERSION = 1;
const DEFAULT_STORAGE_KEY = 'soe:pod-sync:v1';
const DEFAULT_SYNC_URL = '/api/movement/pod/sync';

export type PodSyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'unauthenticated';

export interface PodSyncQueuedMutation<TMutation = unknown> {
  id: string;
  sequence: number;
  mutation: TMutation;
  created_at: string;
  client_updated_at: string;
  attempt_count: number;
  conflict_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  last_audit_id: string | null;
}

export interface PodSyncApplyContext<TMutation = unknown> {
  intent: PodSyncQueuedMutation<TMutation>;
  device_id: string;
  sync_version: number;
}

export interface PodSyncBuildContext<TMutation = unknown> {
  intent: PodSyncQueuedMutation<TMutation>;
  queue: readonly PodSyncQueuedMutation<TMutation>[];
  device_id: string;
  sync_version: number;
  base_sync_version: number;
  client_updated_at: string;
}

export type PodSyncEnvelopeDraft = Pick<PodSyncEnvelope, 'ciphertext' | 'iv'> &
  Partial<Omit<PodSyncEnvelope, 'ciphertext' | 'iv'>>;

export interface PodSyncStreamPhase {
  event: string;
  phase: string | null;
  data: unknown;
  received_at: string;
  audit_id: string | null;
}

export interface PodSyncDiagnostic {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  created_at: string;
  audit_id: string | null;
  status?: number;
  intent_id?: string;
  sync_version?: number;
  queue_depth?: number;
  error?: string;
}

export interface PodSyncRetryOptions {
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  maxConflictRetries: number;
}

export interface PodSyncConflictContext<TState, TMutation = unknown> {
  response: Response;
  body: unknown;
  audit_id: string | null;
  intent: PodSyncQueuedMutation<TMutation>;
  queue: readonly PodSyncQueuedMutation<TMutation>[];
  base_state: TState;
  local_state: TState;
  sync_version: number;
}

export interface PodSyncConflictResolution<TState, TMutation = unknown> {
  base_state: TState;
  queue?: readonly PodSyncQueuedMutation<TMutation>[];
  sync_version?: number;
  last_synced_at?: string | null;
}

export interface PodSyncResetOptions {
  sync_version?: number;
  last_synced_at?: string | null;
}

export interface UsePodSyncOptions<TState, TMutation = unknown> {
  storageKey?: string;
  initialState: TState | (() => TState);
  applyMutation: (
    state: TState,
    mutation: TMutation,
    context: PodSyncApplyContext<TMutation>,
  ) => TState;
  buildEnvelope: (
    state: TState,
    context: PodSyncBuildContext<TMutation>,
  ) => PodSyncEnvelope | PodSyncEnvelopeDraft | Promise<PodSyncEnvelope | PodSyncEnvelopeDraft>;
  extractCanonicalState?: (
    body: unknown,
    context: PodSyncConflictContext<TState, TMutation>,
  ) => TState | undefined | Promise<TState | undefined>;
  resolveConflict?: (
    context: PodSyncConflictContext<TState, TMutation>,
  ) =>
    | PodSyncConflictResolution<TState, TMutation>
    | undefined
    | Promise<PodSyncConflictResolution<TState, TMutation> | undefined>;
  syncUrl?: string;
  stream?: boolean;
  autoSync?: boolean;
  retry?: Partial<PodSyncRetryOptions>;
  logger?: (event: PodSyncDiagnostic) => void;
  maxDiagnostics?: number;
  maxStreamPhases?: number;
}

export interface UsePodSyncResult<TState, TMutation = unknown> {
  state: TState;
  base_state: TState;
  queue: readonly PodSyncQueuedMutation<TMutation>[];
  pending_count: number;
  sync_version: number;
  device_id: string;
  last_synced_at: string | null;
  sync_status: PodSyncStatus;
  is_dirty: boolean;
  next_retry_at: string | null;
  last_error: string | null;
  last_audit_id: string | null;
  diagnostics: readonly PodSyncDiagnostic[];
  stream_phases: readonly PodSyncStreamPhase[];
  enqueueMutation: (mutation: TMutation, options?: { sync?: boolean }) => string;
  mutate: (mutation: TMutation, options?: { sync?: boolean }) => string;
  flush: () => Promise<void>;
  reauthenticate: () => Promise<void>;
  cancel: () => void;
  reset: (state: TState, options?: PodSyncResetOptions) => void;
  clearDiagnostics: () => void;
}

interface PodSyncRuntimeStore<TState, TMutation = unknown> {
  schema_version: typeof STORAGE_SCHEMA_VERSION;
  device_id: string;
  sync_version: number;
  last_synced_at: string | null;
  base_state: TState;
  queue: PodSyncQueuedMutation<TMutation>[];
  next_sequence: number;
  sync_status: PodSyncStatus;
  next_retry_at: string | null;
  last_error: string | null;
  last_audit_id: string | null;
  diagnostics: PodSyncDiagnostic[];
  stream_phases: PodSyncStreamPhase[];
}

interface SyncAttemptResult {
  response: Response;
  audit_id: string | null;
  body: unknown;
  phases: PodSyncStreamPhase[];
}

const DEFAULT_RETRY: PodSyncRetryOptions = {
  baseDelayMs: 750,
  maxDelayMs: 30_000,
  jitterRatio: 0.35,
  maxConflictRetries: 3,
};

export function usePodSync<TState, TMutation = unknown>(
  options: UsePodSyncOptions<TState, TMutation>,
): UsePodSyncResult<TState, TMutation> {
  const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
  const syncUrl = options.syncUrl || DEFAULT_SYNC_URL;
  const autoSync = options.autoSync !== false;
  const maxDiagnostics = options.maxDiagnostics ?? 50;
  const maxStreamPhases = options.maxStreamPhases ?? 100;
  const retry = useMemo(
    () => ({ ...DEFAULT_RETRY, ...options.retry }),
    [
      options.retry?.baseDelayMs,
      options.retry?.jitterRatio,
      options.retry?.maxConflictRetries,
      options.retry?.maxDelayMs,
    ],
  );

  const [store, setStoreState] = useState<PodSyncRuntimeStore<TState, TMutation>>(() =>
    loadStore(storageKey, options.initialState),
  );

  const storeRef = useRef(store);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const retryTimerRef = useRef<number | null>(null);
  const isDrainingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const setStore = useCallback(
    (
      updater:
        | PodSyncRuntimeStore<TState, TMutation>
        | ((previous: PodSyncRuntimeStore<TState, TMutation>) => PodSyncRuntimeStore<TState, TMutation>),
    ) => {
      const previous = storeRef.current;
      const next = typeof updater === 'function' ? updater(previous) : updater;
      const normalized = normalizeStore(next, maxDiagnostics, maxStreamPhases);
      storeRef.current = normalized;
      persistStore(storageKey, normalized);
      setStoreState(normalized);
    },
    [maxDiagnostics, maxStreamPhases, storageKey],
  );

  const emitDiagnostic = useCallback(
    (event: Omit<PodSyncDiagnostic, 'id' | 'created_at'>) => {
      const diagnostic: PodSyncDiagnostic = {
        id: createId('diag'),
        created_at: new Date().toISOString(),
        ...event,
      };
      options.logger?.(diagnostic);
      setStore((previous) => ({
        ...previous,
        diagnostics: [diagnostic, ...previous.diagnostics],
      }));
    },
    [options.logger, setStore],
  );

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(
    (delayMs: number) => {
      if (typeof window === 'undefined') return;
      clearRetryTimer();
      const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
      setStore((previous) => ({
        ...previous,
        sync_status: isBrowserOnline() ? 'error' : 'offline',
        next_retry_at: nextRetryAt,
      }));
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        void flushRef.current();
      }, delayMs);
    },
    [clearRetryTimer, setStore],
  );

  const materializedState = useMemo(
    () => materializeState(store, options.applyMutation),
    [options.applyMutation, store],
  );

  const postEnvelope = useCallback(
    async (envelope: PodSyncEnvelope, signal: AbortSignal): Promise<SyncAttemptResult> => {
      const url = buildSyncUrl(syncUrl, Boolean(options.stream));
      const headers: Record<string, string> = {
        accept: options.stream ? 'text/event-stream, application/json' : 'application/json',
        'content-type': 'application/json',
      };

      try {
        const sessionResult = await getSupabase().auth.getSession();
        const token = sessionResult.data.session?.access_token;
        if (token) {
          headers.authorization = `Bearer ${token}`;
        }
      } catch (error) {
        emitDiagnostic({
          level: 'warn',
          message: 'Unable to read Supabase browser session before pod sync.',
          audit_id: null,
          error: errorMessage(error),
        });
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(envelope),
        credentials: 'same-origin',
        signal,
      });
      const auditId = response.headers.get('x-sync-audit-id');
      const { body, phases } = await readSyncBody(response, auditId);
      return { response, audit_id: auditId, body, phases };
    },
    [emitDiagnostic, getSupabase, options.stream, syncUrl],
  );

  const appendAttemptMetadata = useCallback(
    (result: SyncAttemptResult) => {
      setStore((previous) => ({
        ...previous,
        last_audit_id: result.audit_id || previous.last_audit_id,
        stream_phases: result.phases.length
          ? [...result.phases, ...previous.stream_phases]
          : previous.stream_phases,
      }));
    },
    [setStore],
  );

  const handleAuthFailure = useCallback(
    (
      result: SyncAttemptResult,
      intent: PodSyncQueuedMutation<TMutation>,
      syncVersion: number,
      queueDepth: number,
    ) => {
      clearRetryTimer();
      const message = 'Pod sync is unauthenticated; queue draining is halted until re-authentication.';
      setStore((previous) => ({
        ...previous,
        sync_status: 'unauthenticated',
        next_retry_at: null,
        last_error: message,
        queue: markIntent(previous.queue, intent.id, {
          last_error: message,
          last_audit_id: result.audit_id,
        }),
      }));
      emitDiagnostic({
        level: 'error',
        message,
        audit_id: result.audit_id,
        status: 401,
        intent_id: intent.id,
        sync_version: syncVersion,
        queue_depth: queueDepth,
      });
    },
    [clearRetryTimer, emitDiagnostic, setStore],
  );

  const resolveConflict = useCallback(
    async (
      result: SyncAttemptResult,
      intent: PodSyncQueuedMutation<TMutation>,
      localState: TState,
    ): Promise<boolean> => {
      const current = storeRef.current;
      if (intent.conflict_count >= retry.maxConflictRetries) {
        const message = `Pod sync conflict retry limit reached for intent ${intent.id}.`;
        setStore((previous) => ({
          ...previous,
          sync_status: 'error',
          last_error: message,
          queue: markIntent(previous.queue, intent.id, {
            last_error: message,
            last_audit_id: result.audit_id,
          }),
        }));
        emitDiagnostic({
          level: 'error',
          message,
          audit_id: result.audit_id,
          status: result.response.status,
          intent_id: intent.id,
          sync_version: current.sync_version,
          queue_depth: current.queue.length,
        });
        return false;
      }

      const context: PodSyncConflictContext<TState, TMutation> = {
        response: result.response,
        body: result.body,
        audit_id: result.audit_id,
        intent,
        queue: current.queue,
        base_state: current.base_state,
        local_state: localState,
        sync_version: current.sync_version,
      };

      const customResolution = await options.resolveConflict?.(context);
      const canonicalFromOption = customResolution
        ? customResolution.base_state
        : await options.extractCanonicalState?.(result.body, context);
      const defaultCanonical =
        canonicalFromOption !== undefined
          ? { found: true, state: canonicalFromOption as TState }
          : extractCanonicalState<TState>(result.body);

      if (!customResolution && !defaultCanonical.found) {
        const message = 'Pod sync conflict response did not include canonical state.';
        setStore((previous) => ({
          ...previous,
          sync_status: 'error',
          last_error: message,
          queue: markIntent(previous.queue, intent.id, {
            last_error: message,
            last_audit_id: result.audit_id,
          }),
        }));
        emitDiagnostic({
          level: 'error',
          message,
          audit_id: result.audit_id,
          status: result.response.status,
          intent_id: intent.id,
          sync_version: current.sync_version,
          queue_depth: current.queue.length,
        });
        return false;
      }

      const rpcResult = extractRpcResult(result.body);
      const canonicalSyncVersion = extractCanonicalSyncVersion(result.body);
      const nextSyncVersion =
        customResolution?.sync_version ??
        canonicalSyncVersion ??
        rpcResult?.sync_version ??
        extractSyncVersion(result.body) ??
        current.sync_version;
      const nextBaseState = customResolution ? customResolution.base_state : defaultCanonical.state;
      const nextQueue = customResolution?.queue
        ? [...customResolution.queue]
        : markIntent(current.queue, intent.id, {
            conflict_count: intent.conflict_count + 1,
            last_error: '409 conflict resolved against canonical server state.',
            last_audit_id: result.audit_id,
          });

      setStore((previous) => ({
        ...previous,
        base_state: nextBaseState,
        queue: nextQueue,
        sync_version: nextSyncVersion,
        last_synced_at:
          customResolution?.last_synced_at ??
          rpcResult?.server_updated_at ??
          previous.last_synced_at,
        sync_status: 'syncing',
        next_retry_at: null,
        last_error: null,
        last_audit_id: result.audit_id || previous.last_audit_id,
      }));
      emitDiagnostic({
        level: 'warn',
        message: 'Pod sync conflict resolved; pending intents will replay on canonical state.',
        audit_id: result.audit_id,
        status: result.response.status,
        intent_id: intent.id,
        sync_version: nextSyncVersion,
        queue_depth: nextQueue.length,
      });
      return true;
    },
    [emitDiagnostic, options, retry.maxConflictRetries, setStore],
  );

  const flush = useCallback(async () => {
    if (isDrainingRef.current) return;
    if (storeRef.current.sync_status === 'unauthenticated') return;
    if (!isBrowserOnline()) {
      setStore((previous) => ({
        ...previous,
        sync_status: previous.queue.length ? 'offline' : 'idle',
      }));
      return;
    }

    clearRetryTimer();
    isDrainingRef.current = true;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setStore((previous) => ({
        ...previous,
        sync_status: previous.queue.length ? 'syncing' : 'idle',
        next_retry_at: null,
      }));

      while (mountedRef.current && storeRef.current.queue.length > 0) {
        if (!isBrowserOnline()) {
          setStore((previous) => ({ ...previous, sync_status: 'offline' }));
          return;
        }

        const current = storeRef.current;
        const intent = current.queue[0];
        const stateForIntent = options.applyMutation(current.base_state, intent.mutation, {
          intent,
          device_id: current.device_id,
          sync_version: current.sync_version,
        });
        const clientUpdatedAt = new Date().toISOString();

        setStore((previous) => ({
          ...previous,
          queue: markIntent(previous.queue, intent.id, {
            attempt_count: intent.attempt_count + 1,
            last_attempt_at: clientUpdatedAt,
            last_error: null,
          }),
        }));

        const envelope = await normalizeEnvelope(
          await options.buildEnvelope(stateForIntent, {
            intent,
            queue: current.queue,
            device_id: current.device_id,
            sync_version: current.sync_version,
            base_sync_version: current.sync_version,
            client_updated_at: clientUpdatedAt,
          }),
          {
            device_id: current.device_id,
            base_sync_version: current.sync_version,
            client_updated_at: clientUpdatedAt,
          },
        );

        let attemptResult: SyncAttemptResult;
        try {
          attemptResult = await postEnvelope(envelope, abortController.signal);
        } catch (error) {
          if (isAbortError(error)) return;
          const latestIntent = storeRef.current.queue.find((queued) => queued.id === intent.id) || intent;
          const delayMs = backoffDelay(Math.max(latestIntent.attempt_count, 1), retry);
          const message = `Pod sync network attempt failed; retrying in ${delayMs}ms.`;
          setStore((previous) => ({
            ...previous,
            sync_status: isBrowserOnline() ? 'error' : 'offline',
            last_error: errorMessage(error),
            queue: markIntent(previous.queue, intent.id, {
              last_error: errorMessage(error),
            }),
          }));
          emitDiagnostic({
            level: 'warn',
            message,
            audit_id: null,
            intent_id: intent.id,
            sync_version: current.sync_version,
            queue_depth: current.queue.length,
            error: errorMessage(error),
          });
          scheduleRetry(delayMs);
          return;
        }

        appendAttemptMetadata(attemptResult);

        const httpStatus = extractHttpStatus(attemptResult.body) ?? attemptResult.response.status;
        if (httpStatus === 401) {
          handleAuthFailure(attemptResult, intent, current.sync_version, current.queue.length);
          return;
        }

        if (httpStatus === 409 || isConflictBody(attemptResult.body)) {
          const resolved = await resolveConflict(attemptResult, intent, stateForIntent);
          if (!resolved) return;
          continue;
        }

        if (isTransientStatus(httpStatus)) {
          const latestIntent = storeRef.current.queue.find((queued) => queued.id === intent.id) || intent;
          const delayMs = backoffDelay(Math.max(latestIntent.attempt_count, 1), retry);
          const message = `Pod sync returned HTTP ${httpStatus}; retrying in ${delayMs}ms.`;
          setStore((previous) => ({
            ...previous,
            sync_status: 'error',
            last_error: message,
            queue: markIntent(previous.queue, intent.id, {
              last_error: message,
              last_audit_id: attemptResult.audit_id,
            }),
          }));
          emitDiagnostic({
            level: 'warn',
            message,
            audit_id: attemptResult.audit_id,
            status: httpStatus,
            intent_id: intent.id,
            sync_version: current.sync_version,
            queue_depth: current.queue.length,
          });
          scheduleRetry(delayMs);
          return;
        }

        if (!attemptResult.response.ok || extractBodyOk(attemptResult.body) === false) {
          const message = `Pod sync rejected intent ${intent.id} with HTTP ${httpStatus}.`;
          setStore((previous) => ({
            ...previous,
            sync_status: 'error',
            last_error: message,
            queue: markIntent(previous.queue, intent.id, {
              last_error: message,
              last_audit_id: attemptResult.audit_id,
            }),
          }));
          emitDiagnostic({
            level: 'error',
            message,
            audit_id: attemptResult.audit_id,
            status: httpStatus,
            intent_id: intent.id,
            sync_version: current.sync_version,
            queue_depth: current.queue.length,
          });
          return;
        }

        const rpcResult = extractRpcResult(attemptResult.body);
        if (!rpcResult) {
          const message = 'Pod sync response did not include a valid RPC result.';
          setStore((previous) => ({
            ...previous,
            sync_status: 'error',
            last_error: message,
            queue: markIntent(previous.queue, intent.id, {
              last_error: message,
              last_audit_id: attemptResult.audit_id,
            }),
          }));
          emitDiagnostic({
            level: 'error',
            message,
            audit_id: attemptResult.audit_id,
            status: httpStatus,
            intent_id: intent.id,
            sync_version: current.sync_version,
            queue_depth: current.queue.length,
          });
          return;
        }

        setStore((previous) => {
          if (previous.queue[0]?.id !== intent.id) return previous;
          const remainingQueue = previous.queue.slice(1);
          return {
            ...previous,
            base_state: stateForIntent,
            queue: remainingQueue,
            sync_version: rpcResult.sync_version,
            last_synced_at: rpcResult.server_updated_at || new Date().toISOString(),
            sync_status: remainingQueue.length ? 'syncing' : 'idle',
            next_retry_at: null,
            last_error: null,
            last_audit_id: attemptResult.audit_id || previous.last_audit_id,
          };
        });
      }
    } finally {
      isDrainingRef.current = false;
      abortControllerRef.current = null;
      if (mountedRef.current) {
        setStore((previous) => ({
          ...previous,
          sync_status: previous.queue.length
            ? isBrowserOnline()
              ? previous.sync_status === 'syncing'
                ? 'idle'
                : previous.sync_status
              : 'offline'
            : 'idle',
        }));
      }
    }
  }, [
    appendAttemptMetadata,
    clearRetryTimer,
    emitDiagnostic,
    handleAuthFailure,
    options,
    postEnvelope,
    resolveConflict,
    retry,
    scheduleRetry,
    setStore,
  ]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    mountedRef.current = true;
    if (
      autoSync &&
      storeRef.current.queue.length > 0 &&
      storeRef.current.sync_status !== 'unauthenticated'
    ) {
      void flushRef.current();
    }

    const handleOnline = () => {
      if (storeRef.current.sync_status === 'unauthenticated') return;
      setStore((previous) => ({
        ...previous,
        sync_status: previous.queue.length ? 'idle' : 'idle',
      }));
      if (autoSync) void flushRef.current();
    };
    const handleOffline = () => {
      setStore((previous) => ({
        ...previous,
        sync_status: previous.queue.length ? 'offline' : 'idle',
      }));
    };
    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        autoSync &&
        storeRef.current.sync_status !== 'unauthenticated'
      ) {
        void flushRef.current();
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || event.newValue === null) return;
      const externalStore = parseStore<TState, TMutation>(event.newValue, options.initialState);
      if (!externalStore) return;
      setStore((previous) => mergeExternalStore(previous, externalStore));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('storage', handleStorage);
    const authListener = getSupabase().auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token || storeRef.current.sync_status !== 'unauthenticated') return;
      setStore((previous) => ({
        ...previous,
        sync_status: previous.queue.length ? 'idle' : 'idle',
        next_retry_at: null,
        last_error: null,
      }));
      if (autoSync) void flushRef.current();
    });

    return () => {
      mountedRef.current = false;
      clearRetryTimer();
      abortControllerRef.current?.abort();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('storage', handleStorage);
      authListener.data.subscription.unsubscribe();
    };
  }, [autoSync, clearRetryTimer, getSupabase, options.initialState, setStore, storageKey]);

  const enqueueMutation = useCallback(
    (mutation: TMutation, enqueueOptions?: { sync?: boolean }) => {
      const now = new Date().toISOString();
      const id = createId('intent');
      setStore((previous) => {
        const sequence = previous.next_sequence;
        const intent: PodSyncQueuedMutation<TMutation> = {
          id,
          sequence,
          mutation,
          created_at: now,
          client_updated_at: now,
          attempt_count: 0,
          conflict_count: 0,
          last_attempt_at: null,
          last_error: null,
          last_audit_id: null,
        };
        return {
          ...previous,
          queue: [...previous.queue, intent],
          next_sequence: sequence + 1,
          sync_status:
            previous.sync_status === 'unauthenticated'
              ? 'unauthenticated'
              : isBrowserOnline()
                ? previous.sync_status
                : 'offline',
        };
      });

      if (
        autoSync &&
        enqueueOptions?.sync !== false &&
        storeRef.current.sync_status !== 'unauthenticated'
      ) {
        queueMicrotask(() => {
          void flushRef.current();
        });
      }
      return id;
    },
    [autoSync, setStore],
  );

  const reauthenticate = useCallback(async () => {
    clearRetryTimer();
    setStore((previous) => ({
      ...previous,
      sync_status: previous.queue.length && !isBrowserOnline() ? 'offline' : 'idle',
      next_retry_at: null,
      last_error: null,
    }));
    await flushRef.current();
  }, [clearRetryTimer, setStore]);

  const cancel = useCallback(() => {
    clearRetryTimer();
    abortControllerRef.current?.abort();
    isDrainingRef.current = false;
    setStore((previous) => ({
      ...previous,
      sync_status: previous.queue.length && !isBrowserOnline() ? 'offline' : 'idle',
      next_retry_at: null,
    }));
  }, [clearRetryTimer, setStore]);

  const reset = useCallback(
    (state: TState, resetOptions?: PodSyncResetOptions) => {
      clearRetryTimer();
      abortControllerRef.current?.abort();
      const now = new Date().toISOString();
      setStore((previous) => ({
        ...previous,
        base_state: state,
        queue: [],
        next_sequence: 1,
        sync_version: resetOptions?.sync_version ?? previous.sync_version,
        last_synced_at: resetOptions?.last_synced_at ?? previous.last_synced_at ?? now,
        sync_status: 'idle',
        next_retry_at: null,
        last_error: null,
      }));
    },
    [clearRetryTimer, setStore],
  );

  const clearDiagnostics = useCallback(() => {
    setStore((previous) => ({
      ...previous,
      diagnostics: [],
      stream_phases: [],
    }));
  }, [setStore]);

  return {
    state: materializedState,
    base_state: store.base_state,
    queue: store.queue,
    pending_count: store.queue.length,
    sync_version: store.sync_version,
    device_id: store.device_id,
    last_synced_at: store.last_synced_at,
    sync_status: store.sync_status,
    is_dirty: store.queue.length > 0,
    next_retry_at: store.next_retry_at,
    last_error: store.last_error,
    last_audit_id: store.last_audit_id,
    diagnostics: store.diagnostics,
    stream_phases: store.stream_phases,
    enqueueMutation,
    mutate: enqueueMutation,
    flush,
    reauthenticate,
    cancel,
    reset,
    clearDiagnostics,
  };
}

function loadStore<TState, TMutation>(
  storageKey: string,
  initialState: TState | (() => TState),
): PodSyncRuntimeStore<TState, TMutation> {
  const parsed = readStoredValue<TState, TMutation>(storageKey, initialState);
  if (parsed) return parsed;

  return {
    schema_version: STORAGE_SCHEMA_VERSION,
    device_id: getOrCreateDeviceId(storageKey),
    sync_version: 0,
    last_synced_at: null,
    base_state: resolveInitialState(initialState),
    queue: [],
    next_sequence: 1,
    sync_status: isBrowserOnline() ? 'idle' : 'offline',
    next_retry_at: null,
    last_error: null,
    last_audit_id: null,
    diagnostics: [],
    stream_phases: [],
  };
}

function readStoredValue<TState, TMutation>(
  storageKey: string,
  initialState: TState | (() => TState),
): PodSyncRuntimeStore<TState, TMutation> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? parseStore<TState, TMutation>(raw, initialState) : null;
  } catch {
    return null;
  }
}

function parseStore<TState, TMutation>(
  raw: string,
  initialState: TState | (() => TState),
): PodSyncRuntimeStore<TState, TMutation> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.schema_version !== STORAGE_SCHEMA_VERSION) return null;
    return {
      schema_version: STORAGE_SCHEMA_VERSION,
      device_id: typeof parsed.device_id === 'string' ? parsed.device_id : createId('device'),
      sync_version: typeof parsed.sync_version === 'number' ? parsed.sync_version : 0,
      last_synced_at: typeof parsed.last_synced_at === 'string' ? parsed.last_synced_at : null,
      base_state:
        'base_state' in parsed ? (parsed.base_state as TState) : resolveInitialState(initialState),
        queue: normalizeQueue<TMutation>(parsed.queue),
        next_sequence: typeof parsed.next_sequence === 'number' ? parsed.next_sequence : 1,
      sync_status: normalizePodSyncStatus(parsed.sync_status),
      next_retry_at: null,
      last_error: typeof parsed.last_error === 'string' ? parsed.last_error : null,
      last_audit_id: typeof parsed.last_audit_id === 'string' ? parsed.last_audit_id : null,
      diagnostics: normalizeDiagnostics(parsed.diagnostics),
      stream_phases: normalizePhases(parsed.stream_phases),
    };
  } catch {
    return null;
  }
}

function persistStore<TState, TMutation>(
  storageKey: string,
  store: PodSyncRuntimeStore<TState, TMutation>,
) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        schema_version: STORAGE_SCHEMA_VERSION,
        device_id: store.device_id,
        sync_version: store.sync_version,
        last_synced_at: store.last_synced_at,
        base_state: store.base_state,
        queue: store.queue,
        next_sequence: store.next_sequence,
        sync_status: store.sync_status,
        last_error: store.last_error,
        last_audit_id: store.last_audit_id,
        diagnostics: store.diagnostics,
        stream_phases: store.stream_phases,
      }),
    );
  } catch {
    // Storage can be unavailable or quota-limited; in-memory state still protects this render.
  }
}

function normalizeStore<TState, TMutation>(
  store: PodSyncRuntimeStore<TState, TMutation>,
  maxDiagnostics: number,
  maxStreamPhases: number,
): PodSyncRuntimeStore<TState, TMutation> {
  const queue = [...store.queue].sort((left, right) => left.sequence - right.sequence);
  const maxSequence = queue.reduce((max, intent) => Math.max(max, intent.sequence), 0);
  return {
    ...store,
    queue,
    next_sequence: Math.max(store.next_sequence, maxSequence + 1),
    diagnostics: store.diagnostics.slice(0, maxDiagnostics),
    stream_phases: store.stream_phases.slice(0, maxStreamPhases),
  };
}

function mergeExternalStore<TState, TMutation>(
  current: PodSyncRuntimeStore<TState, TMutation>,
  external: PodSyncRuntimeStore<TState, TMutation>,
): PodSyncRuntimeStore<TState, TMutation> {
  const byId = new Map<string, PodSyncQueuedMutation<TMutation>>();
  for (const intent of current.queue) byId.set(intent.id, intent);
  for (const intent of external.queue) byId.set(intent.id, intent);
  const queue = Array.from(byId.values()).sort((left, right) => left.sequence - right.sequence);
  const externalIsNewer =
    external.sync_version > current.sync_version ||
    (external.sync_version === current.sync_version &&
      Date.parse(external.last_synced_at || '') > Date.parse(current.last_synced_at || ''));

  return {
    ...current,
    base_state: externalIsNewer ? external.base_state : current.base_state,
    queue,
    sync_version: Math.max(current.sync_version, external.sync_version),
    last_synced_at: externalIsNewer ? external.last_synced_at : current.last_synced_at,
    next_sequence: Math.max(current.next_sequence, external.next_sequence),
    last_audit_id: external.last_audit_id || current.last_audit_id,
  };
}

function materializeState<TState, TMutation>(
  store: PodSyncRuntimeStore<TState, TMutation>,
  applyMutation: (
    state: TState,
    mutation: TMutation,
    context: PodSyncApplyContext<TMutation>,
  ) => TState,
): TState {
  return store.queue.reduce(
    (state, intent) =>
      applyMutation(state, intent.mutation, {
        intent,
        device_id: store.device_id,
        sync_version: store.sync_version,
      }),
    store.base_state,
  );
}

function markIntent<TMutation>(
  queue: readonly PodSyncQueuedMutation<TMutation>[],
  intentId: string,
  patch: Partial<PodSyncQueuedMutation<TMutation>>,
): PodSyncQueuedMutation<TMutation>[] {
  return queue.map((intent) => (intent.id === intentId ? { ...intent, ...patch } : intent));
}

async function normalizeEnvelope(
  draft: PodSyncEnvelope | PodSyncEnvelopeDraft,
  defaults: Pick<PodSyncEnvelope, 'device_id' | 'base_sync_version' | 'client_updated_at'>,
): Promise<PodSyncEnvelope> {
  const withoutCommitment: Omit<PodSyncEnvelope, 'commitment_hash'> = {
    kind: draft.kind || SYNC_ENVELOPE_KIND,
    version: draft.version || SYNC_ENVELOPE_VERSION,
    ciphertext_encoding: draft.ciphertext_encoding || SYNC_CIPHERTEXT_ENCODING,
    ciphertext: draft.ciphertext,
    iv: draft.iv,
    client_updated_at: draft.client_updated_at || defaults.client_updated_at,
    device_id: draft.device_id || defaults.device_id,
    base_sync_version:
      typeof draft.base_sync_version === 'number'
        ? draft.base_sync_version
        : defaults.base_sync_version,
    metadata: draft.metadata || {},
  };

  return {
    ...withoutCommitment,
    commitment_hash:
      draft.commitment_hash || (await sha256Hex(canonicalSyncCommitmentInput(withoutCommitment))),
  };
}

async function readSyncBody(
  response: Response,
  auditId: string | null,
): Promise<{ body: unknown; phases: PodSyncStreamPhase[] }> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    return readEventStream(response, auditId);
  }

  const text = await response.text();
  if (!text.trim()) return { body: null, phases: [] };
  try {
    const body: unknown = JSON.parse(text);
    return {
      body,
      phases: extractPhasesFromBody(body, auditId),
    };
  } catch {
    return { body: text, phases: [] };
  }
}

async function readEventStream(
  response: Response,
  auditId: string | null,
): Promise<{ body: unknown; phases: PodSyncStreamPhase[] }> {
  if (!response.body) return { body: null, phases: [] };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const phases: PodSyncStreamPhase[] = [];
  let buffer = '';
  let event = 'message';
  let dataLines: string[] = [];
  let finalBody: unknown = null;

  const flushEvent = () => {
    if (!dataLines.length) {
      event = 'message';
      return;
    }

    const rawData = dataLines.join('\n');
    const data = parseMaybeJson(rawData);
    const phase = normalizePhase(event, data, auditId);
    phases.push(phase);

    if (
      isPodSyncRpcResult(data) ||
      event === 'result' ||
      event === 'complete' ||
      event === 'error'
    ) {
      finalBody = unwrapResultBody(data);
    } else if (isRecord(data) && isPodSyncRpcResult(data.result)) {
      finalBody = data.result;
    }

    event = 'message';
    dataLines = [];
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

      if (!line) {
        flushEvent();
      } else if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim() || 'message';
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }

      newlineIndex = buffer.indexOf('\n');
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    dataLines.push(buffer.trim());
  }
  flushEvent();

  return { body: finalBody, phases };
}

function normalizePhase(event: string, data: unknown, auditId: string | null): PodSyncStreamPhase {
  const phase =
    isRecord(data) && typeof data.phase === 'string'
      ? data.phase
      : isRecord(data) && typeof data.status === 'string'
        ? data.status
        : null;
  return {
    event,
    phase,
    data,
    received_at: new Date().toISOString(),
    audit_id: auditId,
  };
}

function extractPhasesFromBody(body: unknown, auditId: string | null): PodSyncStreamPhase[] {
  if (!isRecord(body) || !Array.isArray(body.phases)) return [];
  return body.phases.map((phase) =>
    normalizePhase('phase', phase, isRecord(phase) && typeof phase.audit_id === 'string' ? phase.audit_id : auditId),
  );
}

function extractRpcResult(body: unknown): PodSyncRpcResult | null {
  if (isPodSyncRpcResult(body)) return body;
  if (isRecord(body)) {
    if (isPodSyncRpcResult(body.sync)) return body.sync;
    if (isPodSyncRpcResult(body.result)) return body.result;
    if (isPodSyncRpcResult(body.data)) return body.data;
    if (isRecord(body.payload) && isPodSyncRpcResult(body.payload.result)) return body.payload.result;
    if (isRecord(body.payload) && isPodSyncRpcResult(body.payload.sync)) return body.payload.sync;
  }
  return null;
}

function isPodSyncRpcResult(value: unknown): value is PodSyncRpcResult {
  return (
    isRecord(value) &&
    typeof value.accepted === 'boolean' &&
    typeof value.status === 'string' &&
    typeof value.sync_version === 'number' &&
    typeof value.previous_sync_version === 'number' &&
    typeof value.client_updated_at === 'string' &&
    typeof value.server_updated_at === 'string' &&
    typeof value.conflict === 'boolean'
  );
}

function unwrapResultBody(data: unknown): unknown {
  if (isRecord(data) && isPodSyncRpcResult(data.result)) return data.result;
  if (isRecord(data) && isPodSyncRpcResult(data.data)) return data.data;
  return data;
}

function extractHttpStatus(body: unknown): number | null {
  if (isRecord(body) && typeof body.http_status === 'number') return body.http_status;
  if (isRecord(body)) {
    for (const key of ['result', 'data', 'payload']) {
      const nested = body[key];
      if (isRecord(nested) && typeof nested.http_status === 'number') return nested.http_status;
    }
  }
  return null;
}

function extractBodyOk(body: unknown): boolean | null {
  if (isRecord(body) && typeof body.ok === 'boolean') return body.ok;
  if (isRecord(body)) {
    for (const key of ['result', 'data', 'payload']) {
      const nested = body[key];
      if (isRecord(nested) && typeof nested.ok === 'boolean') return nested.ok;
    }
  }
  return null;
}

function isConflictBody(body: unknown): boolean {
  const rpcResult = extractRpcResult(body);
  return Boolean(rpcResult && rpcResult.conflict && !rpcResult.accepted);
}

function extractCanonicalState<TState>(body: unknown): { found: boolean; state: TState } {
  const keys = ['canonical_state', 'server_state', 'state', 'pod', 'canonical_pod'];
  if (isRecord(body)) {
    for (const key of keys) {
      if (key in body) return { found: true, state: body[key] as TState };
    }
    for (const containerKey of ['result', 'data', 'payload']) {
      const container = body[containerKey];
      if (!isRecord(container)) continue;
      for (const key of keys) {
        if (key in container) return { found: true, state: container[key] as TState };
      }
    }
  }
  return { found: false, state: undefined as TState };
}

function extractSyncVersion(body: unknown): number | null {
  if (isRecord(body) && typeof body.sync_version === 'number') return body.sync_version;
  if (isRecord(body)) {
    for (const key of ['sync', 'result', 'data', 'payload']) {
      const nested = body[key];
      if (isRecord(nested) && typeof nested.sync_version === 'number') return nested.sync_version;
    }
  }
  return null;
}

function extractCanonicalSyncVersion(body: unknown): number | null {
  if (isRecord(body) && isRecord(body.canonical_state)) {
    return typeof body.canonical_state.sync_version === 'number'
      ? body.canonical_state.sync_version
      : null;
  }

  if (isRecord(body)) {
    for (const key of ['result', 'data', 'payload']) {
      const nested = body[key];
      if (isRecord(nested) && isRecord(nested.canonical_state)) {
        return typeof nested.canonical_state.sync_version === 'number'
          ? nested.canonical_state.sync_version
          : null;
      }
    }
  }

  return null;
}

function buildSyncUrl(syncUrl: string, stream: boolean): string {
  if (!stream) return syncUrl;
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const url = new URL(syncUrl, base);
  url.searchParams.set('stream', '1');
  return url.toString();
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function backoffDelay(attempt: number, retry: PodSyncRetryOptions): number {
  const exponent = Math.min(Math.max(attempt - 1, 0), 10);
  const base = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** exponent);
  const jitter = base * retry.jitterRatio * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

function parseMaybeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function sha256Hex(value: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto SHA-256 is unavailable in this browser context.');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getOrCreateDeviceId(storageKey: string): string {
  if (typeof window === 'undefined') return createId('device');
  const key = `${storageKey}:device-id`;
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const id = createId('device');
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return createId('device');
  }
}

function createId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function resolveInitialState<TState>(initialState: TState | (() => TState)): TState {
  return typeof initialState === 'function' ? (initialState as () => TState)() : initialState;
}

function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

function normalizePodSyncStatus(value: unknown): PodSyncStatus {
  if (value === 'unauthenticated') return 'unauthenticated';
  if (!isBrowserOnline()) return 'offline';
  if (value === 'idle' || value === 'syncing' || value === 'offline' || value === 'error') {
    return value;
  }
  return 'idle';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function normalizeQueue<TMutation>(value: unknown): PodSyncQueuedMutation<TMutation>[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((intent) => ({
      id: typeof intent.id === 'string' ? intent.id : createId('intent'),
      sequence: typeof intent.sequence === 'number' ? intent.sequence : 0,
      mutation: intent.mutation as TMutation,
      created_at: typeof intent.created_at === 'string' ? intent.created_at : new Date().toISOString(),
      client_updated_at:
        typeof intent.client_updated_at === 'string' ? intent.client_updated_at : new Date().toISOString(),
      attempt_count: typeof intent.attempt_count === 'number' ? intent.attempt_count : 0,
      conflict_count: typeof intent.conflict_count === 'number' ? intent.conflict_count : 0,
      last_attempt_at: typeof intent.last_attempt_at === 'string' ? intent.last_attempt_at : null,
      last_error: typeof intent.last_error === 'string' ? intent.last_error : null,
      last_audit_id: typeof intent.last_audit_id === 'string' ? intent.last_audit_id : null,
    }))
    .sort((left, right) => left.sequence - right.sequence);
}

function normalizeDiagnostics(value: unknown): PodSyncDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((event) => ({
    id: typeof event.id === 'string' ? event.id : createId('diag'),
    level: event.level === 'info' || event.level === 'warn' || event.level === 'error' ? event.level : 'info',
    message: typeof event.message === 'string' ? event.message : 'Pod sync diagnostic event.',
    created_at: typeof event.created_at === 'string' ? event.created_at : new Date().toISOString(),
    audit_id: typeof event.audit_id === 'string' ? event.audit_id : null,
    status: typeof event.status === 'number' ? event.status : undefined,
    intent_id: typeof event.intent_id === 'string' ? event.intent_id : undefined,
    sync_version: typeof event.sync_version === 'number' ? event.sync_version : undefined,
    queue_depth: typeof event.queue_depth === 'number' ? event.queue_depth : undefined,
    error: typeof event.error === 'string' ? event.error : undefined,
  }));
}

function normalizePhases(value: unknown): PodSyncStreamPhase[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((phase) => ({
    event: typeof phase.event === 'string' ? phase.event : 'message',
    phase: typeof phase.phase === 'string' ? phase.phase : null,
    data: phase.data,
    received_at: typeof phase.received_at === 'string' ? phase.received_at : new Date().toISOString(),
    audit_id: typeof phase.audit_id === 'string' ? phase.audit_id : null,
  }));
}
