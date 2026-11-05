/** Own one immersive device session and fence every late permission/render result. */
export function createXRSession({ xr, render, onState, onRetire, select }) {
  let attempt = null, requesting = false, ending = false, disposed = false;
  let message = 'Check this headset for immersive viewing.';
  const state = () => onState({ open: attempt !== null, busy: requesting || ending, message });
  const current = value => attempt === value && !disposed;
  const active = () => Boolean(attempt?.ready && current(attempt) && attempt.session.visibilityState === 'visible');

  async function finish(value, text, endDevice = true) {
    if (attempt !== value) return;
    attempt = null;
    ending = Boolean(endDevice && value.session);
    message = text;
    value.controller.abort();
    for (const detach of value.listeners) detach();
    onRetire();
    value.surface?.dispose();
    state();
    if (ending) {
      try { await value.session.end(); }
      catch { message = 'Private discussion cleared. Use the headset controls to exit if the room is still open.'; }
      finally { ending = false; state(); }
    }
  }

  return {
    active,
    async supported() {
      try { return Boolean(!disposed && await xr?.isSessionSupported('immersive-vr')); }
      catch { return false; }
    },
    async enter() {
      if (disposed || attempt || requesting || ending || !xr) return;
      const value = { session: null, surface: null, ready: false, controller: new AbortController(), listeners: [] };
      attempt = value;
      requesting = true;
      message = 'Opening the immersive room…';
      state();
      try {
        // This call must happen within the Enter button's activation.
        const session = await xr.requestSession('immersive-vr');
        value.session = session;
        if (!current(value)) {
          try { await session.end(); } catch { /* The late session may already be closed. */ }
          return;
        }
        const listen = (event, fn) => {
          session.addEventListener(event, fn);
          value.listeners.push(() => session.removeEventListener(event, fn));
        };
        const leave = text => void finish(value, text);
        listen('end', () => void finish(value, 'Immersive room closed. Check your member session to use the regular Circle view.', false));
        listen('visibilitychange', () => {
          if (session.visibilityState !== 'visible') leave('Headset focus changed. Re-enter the room to check access again.');
        });
        listen('select', () => { if (active() && current(value)) select(); });
        listen('squeeze', () => { if (active() && current(value)) leave('Immersive room closed. Check your member session to continue.'); });
        if (session.visibilityState !== 'visible') {
          await finish(value, 'The headset view needs focus. Open the room again when ready.');
          return;
        }
        const surface = await render(session, value.controller.signal,
          () => leave('The headset display stopped. Continue in the regular Circle view.'));
        if (!current(value)) { surface.dispose(); return; }
        value.surface = surface;
        value.ready = true;
        message = 'Immersive room open. Use the controller trigger inside the room.';
      } catch {
        await finish(value, 'Immersive viewing could not open. Continue in the regular Circle view.');
      } finally {
        requesting = false;
        state();
      }
    },
    leave(text = 'Immersive room closed. Check your member session to use the regular Circle view.') {
      return attempt ? finish(attempt, text) : Promise.resolve();
    },
    dispose() {
      disposed = true;
      return attempt ? finish(attempt, 'Immersive room closed.') : Promise.resolve();
    },
  };
}
