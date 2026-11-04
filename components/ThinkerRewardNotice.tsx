'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { circleHeaders } from '@/lib/circles/client';
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';
import { parseThinkerRewardReceipt } from '@/lib/rewards/thinker';

type Result = { requestId: string; label: string; status: 'pending' | 'unknown' | 'confirmed'; amount?: number; checking?: boolean };

// IDs live only in this mounted page. No automatic POST retry or award lookup.
export function useThinkerRewards() {
  const [results, setResults] = useState<Result[]>([]);
  const [limited, setLimited] = useState(false);
  const epoch = useRef(0);
  const requests = useRef(new Map<string, { epoch: number; amount: 4 | 8 }>());
  const checks = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const invalidate = () => {
      epoch.current++;
      requests.current.clear();
      for (const controller of checks.current.values()) controller.abort();
      checks.current.clear();
    };
    const retire = () => {
      invalidate();
      setResults([]);
      setLimited(false);
    };
    const stop = subscribeAuthProviderChanges(retire);
    return () => { stop(); invalidate(); };
  }, []);
  const begin = useCallback((label: string, amount: 4 | 8 = 8) => {
    if (requests.current.size >= 32) { setLimited(true); return null; }
    const requestId = crypto.randomUUID();
    requests.current.set(requestId, { epoch: epoch.current, amount });
    setResults(rows => [...rows.filter(row => row.status !== 'confirmed'), { requestId, label, status: 'pending' }]);
    return requestId;
  }, []);
  const observe = useCallback((requestId: string, value: unknown) => {
    const expected = requests.current.get(requestId);
    if (expected?.epoch !== epoch.current || !value || typeof value !== 'object') return;
    const row = value as Record<string, unknown>;
    if (row.status !== 'confirmed' || Object.keys(row).sort().join(',') !== 'amount,eventId,replayed,requestId,status') return;
    const receipt = parseThinkerRewardReceipt({ requestId: row.requestId, amount: row.amount, eventId: row.eventId, replayed: row.replayed });
    if (!receipt || receipt.requestId !== requestId || receipt.amount !== expected.amount) return;
    requests.current.delete(requestId);
    setResults(rows => rows.map(result => result.requestId === requestId ? { ...result, status: 'confirmed', amount: receipt.amount } : result));
  }, []);
  const finish = useCallback((requestId: string) => {
    if (requests.current.get(requestId)?.epoch !== epoch.current) return;
    setResults(rows => rows.map(row => row.requestId === requestId && row.status === 'pending' ? { ...row, status: 'unknown' } : row));
  }, []);
  const confirm = useCallback(async (requestId: string) => {
    const generation = epoch.current;
    if (requests.current.get(requestId)?.epoch !== generation || checks.current.has(requestId)) return;
    const controller = new AbortController(); checks.current.set(requestId, controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    setResults(rows => rows.map(row => row.requestId === requestId ? { ...row, checking: true } : row));
    try {
      await Promise.race([(async () => {
        const headers = await circleHeaders();
        if (controller.signal.aborted || epoch.current !== generation) return;
        const response = await fetch(`/api/thinker?requestId=${encodeURIComponent(requestId)}`, {
          credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers, signal: controller.signal,
        });
        const value: unknown = await response.json();
        if (!response.ok || controller.signal.aborted || epoch.current !== generation) return;
        observe(requestId, value);
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Reward check deadline')); }, 8_000); })]);
    } catch { /* An unknown result stays unknown; checking never creates credit. */ }
    finally {
      if (timer) clearTimeout(timer); checks.current.delete(requestId);
      if (epoch.current === generation) setResults(rows => rows.map(row => row.requestId === requestId ? { ...row, checking: false } : row));
    }
  }, [observe]);
  const dismiss = useCallback((requestId: string) => {
    requests.current.delete(requestId); checks.current.get(requestId)?.abort();
    setLimited(false);
    setResults(rows => rows.filter(row => row.requestId !== requestId));
  }, []);
  return { begin, observe, finish, results, limited, confirm, dismiss };
}

export function ThinkerRewardNotice({ reward }: { reward: ReturnType<typeof useThinkerRewards> }) {
  if (!reward.results.length && !reward.limited) return null;
  return <aside aria-label="Thinker reward results" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100001, maxWidth: 'min(420px, calc(100vw - 32px))', maxHeight: '30vh', overflowY: 'auto', background: '#111', border: '1px solid #c9a84c', fontSize: 13, lineHeight: 1.5, color: '#e8dcc8', padding: 12 }}>
    {reward.limited && <p role="alert">Check or dismiss an earlier reward result before starting another request.</p>}
    {reward.results.map(result => <div key={result.requestId} style={{ marginBottom: 8 }}>
      <span role="status">{result.label}: {result.status === 'confirmed' ? `${result.amount} EXP award confirmed.` : result.status === 'pending' ? 'Reward pending.' : 'Reward unconfirmed. It may already have been credited.'}</span>
      {result.status === 'unknown' && <button type="button" disabled={result.checking} onClick={() => void reward.confirm(result.requestId)} style={{ marginLeft: 8, minHeight: 44, minWidth: 44, padding: '8px 12px' }}>{result.checking ? 'Checking…' : 'Check reward only'}</button>}
      {result.status !== 'pending' && <button type="button" onClick={() => reward.dismiss(result.requestId)} style={{ marginLeft: 8, minHeight: 44, minWidth: 44, padding: '8px 12px' }}>Dismiss result</button>}
      {result.status === 'unknown' && <small style={{ display: 'block' }}>Checking makes no AI request. Do not resend to resolve a reward. Request: {result.requestId}</small>}
    </div>)}
  </aside>;
}
