import { createCircleHost, createVerifiedSupabaseCircleOwner, discussionContentSuffix } from './circle-host.mjs';
import { createXRSession } from './xr-session.mjs';
import { renderXRRoom } from './xr-room.mjs';

const ids = ['quest-immersive-status', 'quest-immersive-enter', 'quest-immersive-exit'];
export function immersiveControls(doc) {
  const controls = ids.map(id => doc.getElementById(id));
  if (controls.some((control, index) => !control || doc.querySelectorAll(`[id="${ids[index]}"]`).length !== 1)) {
    throw Error('Immersive Circle controls unavailable');
  }
  return controls;
}

/** The headset gets a separate, read-only lifetime. A visible headset may
 * have focus while the regular browser window's private session is paused. */
export function mountImmersiveCircle({ window: win, document: doc, config, onModeChange }) {
  const [status, enter, exit] = immersiveControls(doc);
  const { origin, circleId, transport, immersive } = config;
  const discussion = origin + '/api/circles/' + circleId + '/discussion';
  let support = null, room = null, disposed = false, mode = false;
  let state = { open: false, busy: false, message: '' };
  const prompt = (text, footer = 'Use the headset controls to leave the room.') => ({ heading: 'Your Circle', text, footer });
  let panel = prompt('Press the controller trigger to check your signed-in account.');
  const focused = () => doc.visibilityState === 'visible' && doc.hasFocus() && win.navigator.onLine !== false;
  const active = () => !disposed && headset.active() && win.navigator.onLine !== false;
  const update = () => {
    if (disposed) return;
    enter.disabled = support !== true || state.open || state.busy || !focused();
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
    for (const release of [current.off, current.auth.retire, current.host.disconnect, current.binding.stop]) {
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
      const host = createCircleHost({ origin, circleId, owner: binding.owner,
        transport(url, init) {
          if (!active() || url !== discussion || init.method !== 'GET') throw Error('Immersive Circle read unavailable');
          return transport(url, init);
        },
      });
      const current = { auth, binding, host, scope: null, off: () => {}, pending: false, cards: [], index: 0 };
      room = current;
      host.connect();
      current.off = binding.subscribe(model => {
        if (room !== current) return;
        const scope = binding.owner.scope();
        if (current.scope && current.scope !== scope) {
          void headset.leave('Your member session changed. Open the room again to check access.');
        } else if (scope) {
          current.scope = scope;
          panel = prompt('Press the trigger to check Circle access and load recent discussion.');
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
  const open = () => { if (!enter.disabled && !enter.closest('[hidden]') && focused()) void headset.enter(); };
  const close = () => void headset.leave();
  const offline = () => { void headset.leave('Connection lost. Private discussion cleared. Re-enter when online.'); update(); };
  const listeners = [[enter, 'click', open], [exit, 'click', close], [win, 'offline', offline],
    [win, 'online', update], [win, 'focus', update], [win, 'blur', update], [doc, 'visibilitychange', update]];
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
      status.textContent = 'Connect a member account to open the immersive room.';
    },
  };
}
