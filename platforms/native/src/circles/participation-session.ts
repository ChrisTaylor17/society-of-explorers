import { createCircleDiscussionGateway, createCircleDiscussionReader, type CircleReadModel, type ReadReply } from './discussion-reader';
import { createCircleDiscussionComposer, createCircleMessageGateway, type CircleComposerModel } from './discussion-composer';

export type CircleSessionRequest = (path: string, options: {
  method: 'GET' | 'POST'; cache: 'no-store'; redirect: 'error'; body?: string;
}, mayTransmit: () => boolean) => Promise<ReadReply>;
export type CircleParticipationModel = { circleId: string; read: CircleReadModel; write: CircleComposerModel };

/** One host-owned lifetime for both views. Hosts signal account/activity changes
 * synchronously; this does not own credentials or grant server authorization. */
export function createCircleParticipationSession(request: CircleSessionRequest, circleId: string) {
  let generation = 0, active = true, disposed = false, syncDepth = 0;
  const listeners = new Set<(value: CircleParticipationModel) => void>();
  const guardedRequest: CircleSessionRequest = (path, options, mayTransmit = () => true) => {
    const operation = generation;
    return request(path, options, () => !disposed && active && operation === generation && mayTransmit());
  };
  const reader = createCircleDiscussionReader(createCircleDiscussionGateway((path, options) => guardedRequest(path, options, () => true)), circleId);
  const composer = createCircleDiscussionComposer(createCircleMessageGateway(guardedRequest), circleId);
  const model = (): CircleParticipationModel => ({ circleId, read: reader.model(), write: composer.model() });
  const emit = () => { if (!disposed && syncDepth === 0) for (const listener of listeners) listener(model()); };
  const batch = (work: () => void) => { syncDepth++; try { work(); } finally { syncDepth--; emit(); } };
  const offWrite = composer.subscribe(emit);
  const offRead = reader.subscribe(value => {
    batch(() => composer.access(value.phase === 'ready', value.revision));
  });
  function retire() { generation++; batch(() => { composer.retire(); reader.retire(); }); }
  function close() { generation++; batch(() => { composer.retire(); reader.close(); }); }
  return {
    model,
    subscribe(listener: (value: CircleParticipationModel) => void) { if (disposed) return () => {}; listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    async open() { if (!disposed && active && !composer.model().busy) await reader.open(); },
    async refresh() { if (!disposed && active && !composer.model().busy) await reader.refresh(); },
    edit(value: string) { return !disposed && composer.edit(value); },
    clearDraft() { if (!disposed) composer.clear(); },
    async post(): Promise<'confirmed' | 'denied' | 'unknown' | 'ignored'> {
      if (disposed || !active) return 'ignored';
      const operation = generation;
      const outcome = await composer.send();
      if (disposed || operation !== generation || !active) return 'ignored';
      if (outcome === 'confirmed') await reader.refresh();
      if (disposed || operation !== generation || !active) return 'ignored';
      return outcome;
    },
    startNewAfterReview() { return !disposed && composer.startNewAfterReview(); },
    retire() { if (!disposed) retire(); },
    close() { if (!disposed) close(); },
    activity(isActive: boolean) {
      if (disposed) return;
      if (!isActive) generation++;
      active = isActive;
      batch(() => { composer.activity(isActive); reader.activity(isActive ? 'active' : 'inactive'); });
    },
    dispose() {
      if (disposed) return;
      generation++; disposed = true; listeners.clear(); offRead(); offWrite(); reader.dispose(); composer.dispose();
    },
  };
}
export type CircleParticipationSession = ReturnType<typeof createCircleParticipationSession>;
