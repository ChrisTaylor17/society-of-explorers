// Local browser fixture: actual source screen/controller/wrapper, explicit OS/Fabric doubles.
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SourceReadingScreen } from '../native/SourceReadingScreen';
import { getSourceReaderEdition } from '../../lib/books/source-reader';

type Action = () => void;
const presses = new Map<string, Action>(), ownerListeners = new Set<Action>();
const stateListeners = new Map<string, Set<(value: string) => void>>();
let held: Action | undefined;
const appState = { currentState: 'active', addEventListener(name: string, fn: (value: string) => void) {
  const callbacks = stateListeners.get(name) ?? new Set(); callbacks.add(fn); stateListeners.set(name, callbacks);
  return { remove() { callbacks.delete(fn); } };
} };
Object.assign(window, { nativeQa: { appState, capture(kind: string, label: string, action: Action) { if (kind === 'press') presses.set(label, action); } } });
const owner = { scope: () => 'synthetic-reader-owner', async bearer() { throw Error('Reader must not request credentials'); },
  subscribe(listener: Action) { ownerListeners.add(listener); return () => { ownerListeners.delete(listener); }; } };
const connectivity = { snapshot: () => 'online' as const, subscribe() { return () => {}; } };
function activity(value: string) { appState.currentState = value; for (const fn of stateListeners.get('change') ?? []) fn(value); }
function Fixture() {
  const [book, setBook] = useState('hamlet'), [instance, setInstance] = useState(0), [open, setOpen] = useState(true);
  const [notice, setNotice] = useState('Synthetic reader only. No member, provider, save or network account.');
  const config = useMemo(() => ({ origin: 'https://source-reader.test', owner,
    context: { bookId: book, editionId: getSourceReaderEdition(book)!.editionId, from: book === 'hamlet' ? 41 : 19, to: book === 'hamlet' ? 43 : 21 } }), [book]);
  return <>
    <aside aria-label="Test fixture controls" style={{ padding: 8, fontFamily: 'system-ui', background: '#f1e5c9', color: '#18291f' }}>
      <strong>Native reader sizing · browser fixture</strong><p>{notice}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button onClick={() => setBook('hamlet')}>Open Hamlet</button>
        <button onClick={() => setBook('relativity')}>Open Relativity</button>
        <button onClick={() => { held = presses.get('Increase book text size') ?? presses.get('Increase book page size'); setNotice('Retained the current size callback for a stale-action test.'); }}>Capture size callback</button>
        <button onClick={() => { held?.(); setNotice('Invoked the retained callback; inspect the current size.'); }}>Invoke retained callback</button>
        <button onClick={() => activity('background')}>Simulate background</button>
        <button onClick={() => activity('active')}>Simulate foreground</button>
        <button onClick={() => { for (const fn of [...ownerListeners]) fn(); }}>Retire synthetic owner</button>
        <button onClick={() => { activity('active'); setInstance(value => value + 1); setOpen(true); }}>Reopen reader</button>
      </div>
    </aside>
    <div style={{ height: 844, display: 'flex', flexDirection: 'column' }}>
      {open ? <SourceReadingScreen key={instance} config={config} connectivity={connectivity}
        onBack={() => setOpen(false)} onClose={() => setOpen(false)}/> : <p>Reader closed.</p>}
    </div>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
