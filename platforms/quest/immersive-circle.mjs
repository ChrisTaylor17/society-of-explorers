import { createCircleHost, createVerifiedSupabaseCircleOwner, discussionContentSuffix } from './circle-host.mjs';
import { createXRSession } from './xr-session.mjs';
import { renderXRRoom } from './xr-room.mjs';
import { createSalonPresence } from './salon-presence.mjs';
import { ROOM_POST_LIMIT, roomComposerPanel, roomReviewText } from './room-composer.mjs';
import { createRoomReading } from './room-reading.mjs';
import { createRoomMessageSafety } from './room-message-safety.mjs';

const requestId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const control = (id, label) => ({ id, label });
const interruptedPost = 'An interrupted post may have been saved. Check the regular discussion before posting again.';
const interruptedAction = 'An interrupted message action may have been saved. Check the regular discussion or Blocked members before trying again.';

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
export function mountImmersiveCircle({ window: win, document: doc, config, reelStarter, onModeChange, onMeetingRequested }) {
  const [status, enter, exit, enterSalon] = immersiveControls(doc, config.sharedSalon);
  const { origin, circleId, transport, immersive, newRequestId } = config;
  const discussion = origin + '/api/circles/' + circleId + '/discussion';
  const receiptPrefix = discussion + '?requestId=';
  const messagePrefix = origin + '/api/circles/' + circleId + '/messages/';
  let support = null, room = null, disposed = false, mode = false;
  let view = 'discussion';
  let interrupted = false, safetyInterrupted = false;
  const interruptions = () => [interrupted ? interruptedPost : '', safetyInterrupted ? interruptedAction : ''].filter(Boolean);
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
    const message = support === null ? 'Checking this browser for immersive viewing…' :
      support ? state.message || 'Open the room, then use your controller to check access.' :
      'Immersive viewing is unavailable here. Continue in the regular Circle view.';
    status.textContent = [message, ...(!state.open ? interruptions() : [])].join(' ');
  };
  function retire() {
    const current = room;
    room = null;
    panel = prompt('Press the controller trigger to check your signed-in account.');
    if (!current) return;
    interrupted ||= current.sent;
    safetyInterrupted ||= current.safetySent;
    for (const release of [current.off, () => current.reading?.reader.close(), () => current.salon?.dispose(), current.auth.retire, () => current.host?.disconnect(), current.binding.stop]) {
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
    select: target => void select(target),
  });
  function showSalon(model) {
    const footer = model.phase === 'present' ? 'Point and trigger to choose. Squeeze to exit the headset room.' :
      model.phase === 'idle' ? 'Trigger to join. Squeeze to exit the headset room.' : 'Squeeze to exit the headset room.';
    panel = prompt(model.message, footer);
    if (model.phase === 'present') panel.rows = [[
      ...(onMeetingRequested ? [control('meeting', 'Meeting in browser')] : []),
      control('salon-leave', 'Leave salon'), control('reading-open', 'Read selection'), control('salon-discussion', 'Read Circle discussion'),
    ]];
  }
  function prepare() {
    const auth = immersive.createAuth(active);
    try {
      const binding = auth.binding ?? createVerifiedSupabaseCircleOwner(auth.auth);
      const host = createCircleHost({ origin, circleId, owner: binding.owner, newRequestId,
        transport(url, init) {
          const read = init.method === 'GET' && (url === discussion ||
            url.startsWith(receiptPrefix) && requestId.test(url.slice(receiptPrefix.length)));
          const write = init.method === 'POST' && (url === discussion || url === discussion + '/preview');
          const safety = view === 'safety' && room?.safety && url === messagePrefix + room.safety.id
            && (init.method === 'GET' || init.method === 'POST');
          if (!active() || !(view === 'discussion' && (read || write) || safety)) throw Error('Immersive discussion request unavailable');
          if (safety && init.method === 'POST') room.safetySent = true;
          return transport(url, init);
        },
      });
      const current = { auth, binding, host, salon: null, scope: null, off: () => {}, pending: false, cards: [], index: 0,
        keyboard: null, reading: null, safety: null, sent: false, safetySent: false };
      room = current;
      host.connect();
      if (view === 'salon') current.salon = createSalonPresence({
        window: win, origin, circleId, transport, owner: binding.owner, isActive: active,
        onState(model) {
          if (room !== current || !active()) return;
          if (view === 'salon') showSalon(model);
          else if (model.phase !== 'present') {
            void headset.leave('Your shared salon check-in ended. Open the room again to check access.');
          } else if (view === 'discussion') void followDiscussion(current);
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
  const ownsRoom = current => room === current && active() && current.binding.owner.scope() === current.scope;
  function showDiscussion(current) {
    const model = current.host.model(), card = current.cards[current.index];
    const canWrite = model.threadWrite.canStart;
    const more = current.index + 1 < current.cards.length;
    const following = current.salon && current.index === 0;
    const actions = [...(canWrite ? [control('new', 'Write a post')] : []),
      ...(card && canWrite ? [control('reply', 'Reply')] : []),
      ...(card && model.messageSafety.available ? [control('message-actions', 'Message actions')] : []),
      control('advance', more ? 'Next preview' : 'Refresh')];
    if (model.archive.phase === 'ready') {
      if (reelStarter) actions.push(control('reel-question', 'Reel question'));
      actions.push(control('reading-open', 'Read selection'));
    }
    if (current.salon) {
      // Keep Back on the same side as Read, away from Leave and Meeting.
      if (actions.length === 1) actions.push(null);
      actions.push(control('salon-back', 'Back to salon'));
    }
    const rows = [actions];
    if (card) {
      panel = { heading: card.heading, text: card.text, rows,
        footer: `${following ? 'Live' : 'Recent'} discussion ${current.index + 1} of ${current.cards.length}. Trigger for ${more ? 'next preview' : 'a fresh check'}.` };
    } else if (model.archive.phase === 'ready') {
      panel = { ...prompt('No visible contributions in the latest discussion page. Trigger to check again.'), rows };
    } else {
      panel = prompt('Current Circle discussion is unavailable. Trigger to check again or use the regular Circle view.');
      if (current.salon) panel.rows = rows;
    }
  }
  function showLoadedDiscussion(current) {
    const { page } = current.host.model().archive;
    current.cards = (page?.kind === 'archive' ? page.items : [])
      .filter(message => message.visibility === 'visible' && message.content).slice(0, 5)
      .map(message => {
        const suffix = '\n\n' + discussionContentSuffix(circleId, message.parentMessageId);
        const text = message.parentMessageId && message.content.endsWith(suffix)
          ? message.content.slice(0, -suffix.length) : message.content;
        return { id: message.id, heading: message.member_name, text };
      });
    showDiscussion(current);
  }
  async function loadDiscussion(current) {
    current.cards = [];
    current.index = 0;
    current.keyboard = null;
    panel = prompt('Checking current Circle access…');
    await current.host.openArchive();
    if (ownsRoom(current)) showLoadedDiscussion(current);
  }
  async function followDiscussion(current) {
    const allowed = () => ownsRoom(current) && view === 'discussion' && !current.pending
      && !current.keyboard && current.index === 0 && current.salon.model().phase === 'present';
    if (!allowed()) return;
    const { revision } = current.host.model().archive;
    await current.host.followLatestArchive(allowed);
    if (allowed() && current.host.model().archive.revision !== revision) showLoadedDiscussion(current);
  }
  async function openReading(current) {
    const from = view;
    const reader = createRoomReading({ origin, circleId, transport, owner: current.binding.owner,
      isActive: () => ownsRoom(current) && view === 'reading',
      onPanel(next) { panel = next; }, backLabel: from === 'salon' ? 'Back to salon' : 'Back to discussion' });
    current.host.close();
    current.cards = [];
    current.reading = { reader, from };
    view = 'reading';
    await reader.open();
  }
  async function openMessageSafety(current) {
    const card = current.cards[current.index];
    if (!card || !current.host.model().messageSafety.available) return;
    view = 'safety';
    current.cards = [];
    current.index = 0;
    const safety = createRoomMessageSafety({ host: current.host, id: card.id,
      isActive: () => ownsRoom(current) && view === 'safety', onPanel(next) { panel = next; } });
    current.safety = safety;
    await safety.open();
  }
  function showComposer(current) {
    const { archive, threadWrite } = current.host.model();
    if (!archive.page) { current.cards = []; current.index = 0; }
    panel = roomComposerPanel(threadWrite, current.keyboard);
  }
  function startComposer(current, parent, draft = '') {
    if (!current.host.threadStart(parent)) { showDiscussion(current); return; }
    if (draft) current.host.threadEdit(draft);
    current.keyboard = { caps: false, symbols: false };
    showComposer(current);
  }
  function showReelQuestion(current) {
    view = 'reel';
    const canDraft = current.host.model().threadWrite.canStart && reelStarter.roomDraft.length <= ROOM_POST_LIMIT;
    panel = { label: 'ARCHIVIST REEL', heading: 'Question from the Reel', text: reelStarter.question,
      rows: [[...(canDraft ? [control('reel-draft', 'Use question')] : []), control('reel-back', 'Back to discussion')]],
      footer: 'Open the credited video and captions in Quest Browser.' };
  }
  async function compose(current, target) {
    const { host, keyboard } = current;
    const model = host.model().threadWrite;
    if (!target) return;
    if (target === 'discussion' && (model.phase === 'confirmed' || model.phase === 'locked')) {
      await loadDiscussion(current);
      return;
    }
    if (target === 'cancel' && model.canCancel) {
      host.threadCancel();
      current.keyboard = null;
      showDiscussion(current);
      return;
    }
    let operation;
    if (model.phase === 'editing') {
      if (target === 'symbols') keyboard.symbols = !keyboard.symbols;
      else if (target === 'caps') keyboard.caps = !keyboard.caps;
      else if (target === 'delete') host.threadEdit(model.draft.slice(0, -1));
      else if (target === 'review' && model.canReview) operation = host.threadReview();
      else if (model.draft.length < ROOM_POST_LIMIT && (target === 'space' || /^key:[!-~]$/u.test(target))) {
        host.threadEdit(model.draft + (target === 'space' ? ' ' : target.slice(4)));
      }
    } else if (model.phase === 'review') {
      if (target === 'edit') host.threadEditReview();
      if (target === 'post' && roomReviewText(model) !== null) {
        host.threadConfirm(true);
        if (host.model().threadWrite.canPost) { current.sent = true; operation = host.threadPost(); }
      }
    } else if (model.phase === 'unknown') {
      if (target === 'lookup' && model.canCheck) operation = host.threadLookup();
      if (target === 'retry' && model.canRetry) operation = host.threadRetry();
    }
    showComposer(current);
    if (!operation) return;
    await operation;
    if (!ownsRoom(current)) return;
    if (host.model().threadWrite.phase === 'confirmed') current.sent = false;
    showComposer(current);
  }
  async function select(target) {
    if (!active() || room?.pending) return;
    let current = room;
    try {
      if (!current) { await prepare().binding.start(); return; }
      if (!current.scope) { await current.binding.check(); return; }
      current.pending = true;
      if (!ownsRoom(current)) return;
      if (view === 'safety') {
        const back = await current.safety.select(target);
        if (!ownsRoom(current)) return;
        if (current.host.model().messageSafety.phase === 'confirmed') current.safetySent = false;
        if (back) {
          current.safety = null;
          view = 'discussion';
          await loadDiscussion(current);
        }
        return;
      }
      if (view === 'reel') {
        if (target === 'reel-back' || target === 'reel-draft') {
          view = 'discussion';
          if (target === 'reel-draft') startComposer(current, null, reelStarter.roomDraft);
          else showDiscussion(current);
        }
        return;
      }
      if (view === 'reading') {
        const { reader, from } = current.reading;
        if (target === 'reading-back') {
          reader.close();
          current.reading = null;
          view = from;
          if (from === 'salon') showSalon(current.salon.model());
          else await loadDiscussion(current);
        } else await reader.select(target);
        return;
      }
      if (view === 'salon') {
        const { phase } = current.salon.model();
        if (phase === 'idle' && target === null) await current.salon.join();
        if (phase !== 'present') return;
        if (target === 'salon-discussion') {
          view = 'discussion';
          await loadDiscussion(current);
        } else if (target === 'reading-open') {
          await openReading(current);
        } else if (target === 'salon-leave') {
          await current.salon.leave();
        } else if (target === 'meeting' && onMeetingRequested) {
          await current.salon.leave();
          if (!ownsRoom(current)) return;
          await headset.leave('Check your member session, then open the live meeting in this browser.');
          if (!disposed && !state.open) onMeetingRequested();
        }
        return;
      }
      if (current.keyboard) { await compose(current, target); return; }
      if (target === 'reel-question' && reelStarter && current.host.model().archive.phase === 'ready') {
        showReelQuestion(current); return;
      }
      if (target === 'reading-open' && current.host.model().archive.phase === 'ready') { await openReading(current); return; }
      if (target === 'salon-back' && current.salon) {
        current.cards = [];
        current.index = 0;
        current.host.close();
        view = 'salon';
        showSalon(current.salon.model());
        return;
      }
      if (target === 'message-actions') { await openMessageSafety(current); return; }
      if (target === 'new' || target === 'reply') {
        const parent = current.cards[current.index]?.id;
        if (target === 'new' || parent) startComposer(current, target === 'new' ? null : parent);
        return;
      }
      if (target !== null && target !== 'advance') return;
      if (current.index + 1 < current.cards.length) { current.index++; showDiscussion(current); return; }
      await loadDiscussion(current);
    } catch {
      if (room === current && active()) void headset.leave('The room stopped. Open it again to check access or use the regular Circle view.');
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
      status.textContent = interruptions().join(' ') || 'Connect a member account to open the immersive room.';
    },
  };
}
