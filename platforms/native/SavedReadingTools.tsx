import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getBook } from '../../lib/books/catalog';
import type { ReadingProgressState } from '../../lib/books/reading-progress';
import type { SavedReading, SavedReadingPosition, SavedReadingReview } from '../shared/saved-reading';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';

/** Exactly one mounted owner manages a session's lifecycle. Nested reader
 * controls subscribe without disconnecting their parent saved-list session. */
export function useSavedReadingView(session: SavedReading, connectivity?: NativeConnectivityPort, manageLifecycle = true, viewKey?: unknown) {
  const connection = useMemo(() => ({ session, connectivity, manageLifecycle }), [session, connectivity, manageLifecycle]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: session.model() }));
  const [epoch, setEpoch] = useState(0), life = useRef({ mounted: false, enabled: false, epoch: 0, retirement: 0, intent: 0 });
  useLayoutEffect(() => {
    const view = life.current; view.mounted = true; view.enabled = false; ++view.retirement; setEpoch(++view.epoch);
    let phase = session.model().phase;
    const off = session.subscribe(model => {
      const enabled = model.connected && model.active && model.online;
      if (!enabled || (!model.entries.length && !model.review && !model.busy)) ++view.retirement;
      if (view.enabled !== enabled || phase !== model.phase || !enabled) setEpoch(++view.epoch);
      view.enabled = enabled; phase = model.phase; setSnapshot({ connection, model });
    });
    if (!manageLifecycle) return () => { view.mounted = false; view.enabled = false; ++view.epoch; ++view.retirement; off(); };
    let mounted = true, active = false, blurred = false;
    const sync = () => { if (mounted) session.activity(active && !blurred); };
    session.activity(false); session.connectivity(false);
    const change = AppState.addEventListener('change', state => { active = state === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; active = AppState.currentState === 'active'; sync(); }) : null;
    active = AppState.currentState === 'active'; sync();
    const stopNetwork = observeNativeConnectivity(connectivity, value => { if (mounted) session.connectivity(value === 'online'); });
    active = AppState.currentState === 'active'; sync(); session.connect();
    return () => {
      mounted = false; view.mounted = false; view.enabled = false; ++view.epoch; ++view.retirement; off(); session.disconnect();
      stopNetwork(); change.remove(); blur?.remove(); focus?.remove();
    };
  }, [connection, session, connectivity, manageLifecycle]);
  useLayoutEffect(() => { ++life.current.retirement; setEpoch(++life.current.epoch); }, [viewKey]);
  const current = (allowInactive = false) => {
    const view = life.current; return view.mounted && view.epoch === epoch && (allowInactive || view.enabled);
  };
  return { model: snapshot.connection === connection ? snapshot.model : session.model(),
    capture() {
      const { retirement, intent } = life.current;
      return () => life.current.mounted && life.current.enabled && life.current.retirement === retirement && life.current.intent === intent
        && !session.model().busy && !session.model().review;
    },
    current, act(work: () => void, allowInactive = false) { if (current(allowInactive)) { ++life.current.intent; work(); } } };
}

export function savedReadingSummary(state: ReadingProgressState) {
  if (state.status !== 'saved') return 'No saved place for this book.';
  if (state.bookmark?.status === 'current') return `Saved position ${(state.bookmark.blockIndex ?? 0) + 1}. ${state.completed ? 'Marked finished.' : 'Not marked finished.'}`;
  if (state.bookmark?.status === 'legacy') return 'An earlier numeric place is retained. It cannot be mapped safely to this edition.';
  if (state.bookmark?.status === 'edition_changed') return 'Your saved place belongs to another edition. It will not be moved automatically.';
  return 'This earlier place cannot be opened safely. You may remove it or explicitly save a new place.';
}

export function SavedReadingReviewCard({ review, busy, onConfirm, onCancel }: {
  review: SavedReadingReview; busy: boolean; onConfirm(): void; onCancel(): void;
}) {
  const mutation = review.mutation;
  return <View style={savedStyles.card}>
    <Text accessibilityRole="header" style={savedStyles.heading}>{review.retry ? 'Review the same earlier change' : mutation.action === 'remove' ? 'Review saved-place removal' : 'Review this saved place'}</Text>
    <Text style={savedStyles.copy}>{getBook(mutation.bookId)?.title}</Text>
    <Text style={savedStyles.note}>{savedReadingSummary(review.previous)}</Text>
    {mutation.action === 'save' ? <>
      <Text style={savedStyles.copy}>Save position {mutation.blockIndex + 1} in the current verified edition.</Text>
      <Text style={savedStyles.copy}>{mutation.completed ? 'Mark this edition finished.' : 'Leave this edition not marked finished.'}</Text>
      <Text style={savedStyles.note}>This replaces your one private saved place for this book. Reading elsewhere does not change it automatically.</Text>
    </> : <Text style={savedStyles.copy}>Remove your saved place and finished mark for this book. The book and your Circle contributions stay available.</Text>}
    {review.retry ? <Text style={savedStyles.note}>The earlier request may still complete. This confirmation retries its exact action and values.</Text> : null}
    <SavedReadingAction label={review.retry ? 'Confirm retry of saved-place change' : mutation.action === 'remove' ? 'Confirm remove saved place' : 'Confirm save reading place'} disabled={busy} onPress={onConfirm}/>
    <SavedReadingAction label="Cancel saved-place review" disabled={busy} onPress={onCancel}/>
  </View>;
}

export function SavedReadingTools({ session, position, connectivity, manageLifecycle = true }: {
  session: SavedReading; position: SavedReadingPosition | null; connectivity?: NativeConnectivityPort; manageLifecycle?: boolean;
}) {
  const { model: m, act } = useSavedReadingView(session, connectivity, manageLifecycle,
    position ? `${position.bookId}:${position.editionId}:${position.blockIndex}` : 'no-position');
  const [completion, setCompletion] = useState<{ bookId: string; completed: boolean } | null>(null);
  const bookId = position?.bookId;
  const completed = completion?.bookId === bookId ? completion?.completed === true : false;
  useLayoutEffect(() => session.subscribe(model => { if (!model.connected || !model.active || !model.online) setCompletion(null); }), [session]);
  const saved = m.entries.find(entry => entry.bookId === bookId);
  return <View style={savedStyles.card}>
    <Text accessibilityRole="header" style={savedStyles.heading}>Your private saved place</Text>
    <Text accessibilityLiveRegion="polite" style={savedStyles.copy}>{m.message}</Text>
    {saved ? <Text style={savedStyles.note}>{savedReadingSummary(saved)}</Text> : null}
    {m.review ? <SavedReadingReviewCard review={m.review} busy={!m.canConfirm}
      onConfirm={() => act(() => void session.confirm())} onCancel={() => act(() => session.cancel())}/> : <>
      <SavedReadingAction label="Load saved place for this book" disabled={!m.canLoad || !bookId} onPress={() => act(() => { if (bookId) void session.load(bookId); })}/>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Mark this edition finished when saving" accessibilityState={{ checked: completed, disabled: !m.canPrepare || !position }}
        disabled={!m.canPrepare || !position} style={[savedStyles.button, (!m.canPrepare || !position) && savedStyles.disabled]}
        onPress={() => act(() => { if (bookId) setCompletion({ bookId, completed: !completed }); })}><Text style={savedStyles.copy}>{completed ? '☑ ' : '☐ '}Mark this edition finished when saving.</Text></Pressable>
      <SavedReadingAction label="Review saving this reading position" disabled={!m.canPrepare || !position}
        onPress={() => act(() => { if (position) void session.prepareSave(position, completed); })}/>
      {saved?.status === 'saved' ? <SavedReadingAction label="Review removing this saved place" disabled={!m.canPrepare}
        onPress={() => act(() => void session.prepareRemove(saved.bookId))}/> : null}
      {m.retryBooks.map(book => <SavedReadingAction key={book} label={`Review retry for ${getBook(book)?.title}`} disabled={!m.canPrepare}
        onPress={() => act(() => session.reviewRetry(book))}/>)}
    </>}
    <Text style={savedStyles.note}>Nothing is saved automatically. Closing the member view clears local recovery for an uncertain change; an already sent request may still finish.</Text>
  </View>;
}

export function SavedReadingAction({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[savedStyles.button, disabled && savedStyles.disabled]}><Text style={savedStyles.copy}>{label}</Text></Pressable>;
}
export const savedStyles = StyleSheet.create({ card: { gap: 16, padding: 16, borderWidth: 1, borderColor: '#536d61', borderRadius: 8 },
  heading: { color: '#f4f2e5', fontSize: 23, lineHeight: 30 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  note: { color: '#c0cbbf', fontSize: 15, lineHeight: 23 }, button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 },
  disabled: { opacity: 0.5 } });
