import React from 'react';
import { createRoot } from 'react-dom/client';
import ReaderTools from '../../../../app/great-books/ReaderTools';
import LibraryBrowser from '../../../../app/great-books/LibraryBrowser';
import type { BookEditionResponse } from '../../../../lib/books/bookmarks';

declare global { interface Window { savedQa: typeof qa } }
const auth = new Set<(event: string) => void>(), deadlines = new Map<number, () => void>();
let sequence = 0, timerSequence = 0, token = '', active = true, online = true, view: 'tools' | 'library' = 'tools', metadata: BookEditionResponse, index = 41, frameReady = true;
let root = createRoot(document.getElementById('root')!), generation = 0;
const retained = new Map<number, (value?: unknown) => void>();
const originalSetTimeout = window.setTimeout.bind(window), originalClearTimeout = window.clearTimeout.bind(window);
window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
  if (delay === 15_000 && typeof callback === 'function') { const id = --timerSequence; deadlines.set(id, () => callback(...args)); return id; }
  return originalSetTimeout(callback, delay, ...args);
}) as typeof window.setTimeout;
window.clearTimeout = (id?: number) => { if (id !== undefined && deadlines.delete(id)) return; originalClearTimeout(id); };
Object.defineProperty(navigator, 'onLine', { get: () => online, configurable: true });
Object.defineProperty(document, 'hasFocus', { value: () => active, configurable: true });
const jumped: number[] = [];
function render() {
  root.render(<React.StrictMode><main className="page main">{view === 'library' ? <LibraryBrowser key={generation} editions={[{ bookId: metadata.bookId, ...metadata.edition }]} />
    : <ReaderTools key={generation} edition={metadata} currentIndex={index} frameReady={frameReady} jump={value => jumped.push(value)} select={() => 'Local selected passage.'} />}</main></React.StrictMode>);
}
const qa = {
  credentials: async () => token ? { Authorization: 'Bearer ' + token } : {},
  subscribe(listener: (event: string) => void) { auth.add(listener); return () => auth.delete(listener); },
  show(value: { metadata: BookEditionResponse; token: string; view?: 'tools' | 'library'; index?: number }) { metadata = value.metadata; token = value.token; view = value.view || 'tools'; index = value.index ?? 41; frameReady = true; active = true; online = true; generation++; render(); },
  source(value: { index?: number; ready?: boolean }) { index = value.index ?? index; frameReady = value.ready ?? frameReady; render(); },
  identity(value: string) { token = value; for (const listener of [...auth]) listener('SIGNED_IN'); },
  token(value: string) { token = value; },
  activity(value: boolean) { active = value; window.dispatchEvent(new Event(value ? 'focus' : 'blur')); },
  network(value: boolean) { online = value; window.dispatchEvent(new Event(value ? 'online' : 'offline')); },
  expire() { const callbacks = [...deadlines.values()]; deadlines.clear(); for (const callback of callbacks) callback(); },
  retain(label: string, property = 'onClick') {
    const element = [...document.querySelectorAll('button,input')].find(el => el.textContent === label || el.parentElement?.textContent === label) as HTMLElement | undefined;
    if (!element) throw Error('Missing callback element ' + label);
    const key = Object.keys(element).find(name => name.startsWith('__reactProps$'));
    const callback = key && (element as unknown as Record<string, Record<string, (value?: unknown) => void>>)[key][property];
    if (typeof callback !== 'function') throw Error('Missing React callback');
    const id = ++sequence; retained.set(id, callback); return id;
  },
  invoke(id: number, value?: unknown) { const fn = retained.get(id); if (!fn) throw Error('Unknown retained callback'); fn(value); },
  stats: () => ({ subscriptions: auth.size, deadlines: deadlines.size, callbacks: retained.size, jumped: [...jumped] }),
  unmount() { root.unmount(); retained.clear(); jumped.length = 0; root = createRoot(document.getElementById('root')!); },
};
window.savedQa = qa;
