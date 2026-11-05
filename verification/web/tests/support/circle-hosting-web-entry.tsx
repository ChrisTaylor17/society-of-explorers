import React from 'react';
import { createRoot } from 'react-dom/client';
import StartCircleForm from '../../../../app/circles/start/StartCircleForm';
import type { ReadingContext } from '../../../../lib/circles/reading-program';

declare global { interface Window { hostingQa: typeof qa } }
const auth = new Set<(event: string) => void>(), deadlines = new Map<number, () => void>(), retained = new Map<number, (value?: unknown) => void>();
let sequence = 0, timerSequence = 0, token = '', active = true, online = true, generation = 0;
let root = createRoot(document.getElementById('root')!);
const originalSetTimeout = window.setTimeout.bind(window), originalClearTimeout = window.clearTimeout.bind(window);
window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
  if (delay === 15_000 && typeof callback === 'function') { const id = --timerSequence; deadlines.set(id, () => callback(...args)); return id; }
  return originalSetTimeout(callback, delay, ...args);
}) as typeof window.setTimeout;
window.clearTimeout = (id?: number) => { if (id !== undefined && deadlines.delete(id)) return; originalClearTimeout(id); };
Object.defineProperty(navigator, 'onLine', { get: () => online, configurable: true });
Object.defineProperty(document, 'hasFocus', { value: () => active, configurable: true });
const qa = {
  credentials: async () => token ? { Authorization: 'Bearer ' + token } : {},
  subscribe(listener: (event: string) => void) { auth.add(listener); return () => auth.delete(listener); },
  show(value: { token: string; context?: ReadingContext; invalidContext?: boolean }) { token = value.token; active = true; online = true; generation++;
    root.render(<React.StrictMode><main style={{ padding: 16, maxWidth: 800, margin: 'auto' }}><StartCircleForm key={generation} initialContext={value.context} invalidContext={value.invalidContext} /></main></React.StrictMode>); },
  identity(value: string) { token = value; for (const listener of [...auth]) listener('SIGNED_IN'); },
  token(value: string) { token = value; },
  activity(value: boolean) { active = value; window.dispatchEvent(new Event(value ? 'focus' : 'blur')); },
  network(value: boolean) { online = value; window.dispatchEvent(new Event(value ? 'online' : 'offline')); },
  expire() { const callbacks = [...deadlines.values()]; deadlines.clear(); for (const callback of callbacks) callback(); },
  retain(label: string, property = 'onClick') {
    let element = [...document.querySelectorAll('button,input,select,textarea')].find(el => el.id === label || el.getAttribute('aria-label') === label || el.textContent === label || el.parentElement?.textContent === label) as HTMLElement | undefined;
    if (property === 'onSubmit') element = element?.closest('form') ?? undefined;
    if (!element) throw Error('Missing callback element ' + label);
    const key = Object.keys(element).find(name => name.startsWith('__reactProps$'));
    const callback = key && (element as unknown as Record<string, Record<string, (value?: unknown) => void>>)[key][property];
    if (typeof callback !== 'function') throw Error('Missing React callback');
    const id = ++sequence; retained.set(id, property === 'onSubmit' ? () => callback({ preventDefault() {} }) : callback); return id;
  },
  invoke(id: number, value?: unknown) { const fn = retained.get(id); if (!fn) throw Error('Unknown retained callback'); fn(value); },
  stats: () => ({ subscriptions: auth.size, deadlines: deadlines.size, callbacks: retained.size }),
  unmount() { root.unmount(); retained.clear(); root = createRoot(document.getElementById('root')!); },
};
window.hostingQa = qa;
