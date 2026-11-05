import { createCircleHost, createVerifiedSupabaseCircleOwner, discussionContentSuffix } from './circle-host.mjs';
import { createXRSession } from './xr-session.mjs';
import { renderXRRoom } from './xr-room.mjs';
import { createSalonPresence } from './salon-presence.mjs';

export function immersiveControls(doc, sharedSalon) {
  const ids = ['quest-immersive-status', 'quest-immersive-enter', 'quest-immersive-exit'];
  if (sharedSalon) ids.push('quest-salon-headset');
  const controls = ids.map(id => doc.getElementById(id));
  if (controls.some((control, index) => !control || doc.querySelectorAll(`[id="${ids[index]}"]`).length !== 1)) {
    throw Error('Immersive Circle controls unavailable');
  }
  return controls;
}

/** The headset gets a separate member lifetime. A visible headset may
 * have focus while the regular browser window's private session is paused. */
export function mountImmersiveCircle({ window: win, document: doc, config, onModeChange }) {
  const [status, enter, exit, enterSalon] = immersiveControls(doc, config.sharedSalon);
  const { origin, circleId, transport, immersive } = config;
  const discussion = origin + '/api/circles/' + circleId + '/discussion';
  let support = null, room = null, disposed = false, mode = false;
  let view = 'discussion';
  let state = { open: false, busy: false, message: '' };
  const prompt = (text, footer = 'Use the headset controls to leave the room.') => view === 'salon'
    ? { label: 'SHARED SALON', heading: 'Your shared salon', text, footer }
    : { heading: 'Your Circle', text, footer };
  let panel = prompt('Press the controller trigger to check your signed-in account.');
  const focused = () => doc.visibilityState === 'visible' && doc.hasFocus() && win.navigator.onLine !== false;
  const active = () => !disposed && headset.active() && win.navigator.onLine !== false;
  const update = () => {
    if (disposed) return;
    enter.disabled = support !== true || state.open || state.busy || !focused();
    if (enterSalon) enterSalon.disabled = enter.disabled;
    exit.disabled = !state.open;
    status.textContent = support === null ? 'Checking this browser for immersive viewing…' :
      support ? state.message || 'Open the room, then use your controller to check access.' :
      'Immersive viewing is unavailable here. Continue in the regular Circle view.';
  };
  function retire() {
    const current = room;
    room = null;
    panel = prompt('Press the controller trigger to check your signed-in account.');
    if (!current) return;
    for (const release of [current.off, () => current.salon?.dispose(), current.auth.retire, () => current.host?.disconnect(), current.binding.stop]) {
      try { release(); } catch { /* Complete each independent retirement. */ }
    }
  }
  const headset = createXRSession({
    xr: win.isSecureContext ? win.navigator.xr : null,
    onState(next) {
      state = next;
      if (mode !== next.open) { mode = next.open; onModeChange(mode); }
      update();
    },
    render: (session, signal, fail) => renderXRRoom(session, doc, () => active() ? panel : null, signal, fail),
    onRetire: retire,
    select: () => void select(),
  });
  function prepare() {
    const auth = immersive.createAuth(active);
    try {
      const binding = createVerifiedSupabaseCircleOwner(auth.auth);
      const host = view === 'discussion' ? createCircleHost({ origin, circleId, owner: binding.owner,
        transport(url, init) {
          if (!active() || url !== discussion || init.method !== 'GET') throw Error('Immersive Circle read unavailable');
          return transport(url, init);
        },
      }) : null;
      const current = { auth, binding, host, salon: null, scope: null, off: () => {}, pending: false, cards: [], index: 0 };
      room = current;
      host?.connect();
      if (view === 'salon') current.salon = createSalonPresence({
        window: win, origin, circleId, transport, owner: binding.owner, isActive: active,
        onState(model) {
          if (room !== current || !active()) return;
          const footer = model.phase === 'present' ? 'Trigger to leave the salon. Squeeze to exit the headset room.' :
            model.phase === 'idle' ? 'Trigger to join. Squeeze to exit the headset room.' : 'Squeeze to exit the headset room.';
          panel = prompt(model.message, footer);
        },
      });
      current.off = binding.subscribe(model => {
        if (room !== current) return;
        const scope = binding.owner.scope();
        if (current.scope && current.scope !== scope) {
          void headset.leave('Your member session changed. Open the room again to check access.');
        } else if (scope) {
          current.scope = scope;
          panel = prompt(current.salon ? 'Press the trigger to join the shared salon count.' :
            'Press the trigger to check Circle access and load recent discussion.');
        } else {
          panel = prompt(model.busy ? 'Checking your signed-in account…' :
            'Press the trigger to check your signed-in account. Sign in through the regular browser if needed.');
        }
      });
      return current;
    } catch (error) {
      if (room?.auth === auth) retire();
      else auth.retire();
      throw error;
    }
  }
  function showCard(current) {
    panel = { ...current.cards[current.index],
      footer: `Recent discussion ${current.index + 1} of ${current.cards.length}. Trigger for ${current.index + 1 < current.cards.length ? 'next preview' : 'a fresh check'}.` };
  }
  async function select() {
    if (!active() || room?.pending) return;
    let current = room;
    try {
      if (!current) { await prepare().binding.start(); return; }
      if (!current.scope) { await current.binding.check(); return; }
      if (current.salon) {
        if (current.salon.model().phase === 'present') await current.salon.leave();
        else await current.salon.join();
        return;
      }
      if (current.index + 1 < current.cards.length) { current.index++; showCard(current); return; }
      current.pending = true;
      current.cards = [];
      current.index = 0;
      panel = prompt('Checking current Circle access…');
      await current.host.openArchive();
      if (room !== current || !active() || current.binding.owner.scope() !== current.scope) return;
      const { page, phase } = current.host.model().archive;
      current.host.close();
      current.cards = (page?.kind === 'archive' ? page.items : [])
        .filter(message => message.visibility === 'visible' && message.content).slice(0, 5)
        .map(message => {
          const suffix = '\n\n' + discussionContentSuffix(circleId, message.parentMessageId);
          const text = message.parentMessageId && message.content.endsWith(suffix)
            ? message.content.slice(0, -suffix.length) : message.content;
          return { heading: message.member_name, text };
        });
      if (current.cards.length) showCard(current);
      else panel = prompt(phase === 'ready' ? 'No visible contributions in the latest discussion page. Trigger to check again.' :
        'Current Circle discussion is unavailable. Trigger to check again or use the regular Circle view.');
    } catch {
      if (room === current && active()) panel = prompt('Circle access could not be checked. Trigger to try again or use the regular Circle view.');
    } finally { if (current && room === current) current.pending = false; }
  }
  const open = (control, next) => {
    if (control.disabled || control.closest('[hidden]') || !focused()) return;
    view = next;
    panel = prompt('Press the controller trigger to check your signed-in account.');
    void headset.enter();
  };
  const close = () => void headset.leave();
  const offline = () => { void headset.leave('Connection lost. Private discussion cleared. Re-enter when online.'); update(); };
  const listeners = [[enter, 'click', () => open(enter, 'discussion')], [exit, 'click', close], [win, 'offline', offline],
    [win, 'online', update], [win, 'focus', update], [win, 'blur', update], [doc, 'visibilitychange', update]];
  if (enterSalon) listeners.push([enterSalon, 'click', () => open(enterSalon, 'salon')]);
  for (const [target, event, handler] of listeners) target.addEventListener(event, handler);
  update();
  void headset.supported().then(value => { support = value; update(); });
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [target, event, handler] of listeners) target.removeEventListener(event, handler);
      void headset.dispose();
      enter.disabled = exit.disabled = true;
      if (enterSalon) enterSalon.disabled = true;
      status.textContent = 'Connect a member account to open the immersive room.';
    },
  };
}
