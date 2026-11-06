import { circleAuthorizationHeaders } from './circle-host.mjs';

const POLL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 9_000;
const invitation = 'Join when you are ready to appear in the shared salon count.';

/** One explicitly joined seat, owned by the current account and view. */
export function createSalonPresence({ window: win, origin, circleId, owner, transport, isActive, onState, onAccessLost }) {
  const endpoint = origin + '/api/circles/' + circleId + '/salon-presence';
  let joined = null, leaving = null, timer, disposed = false;
  let state = { phase: 'idle', message: invitation };
  const current = seat => !disposed && isActive() && owner.scope() === seat.scope && !seat.controller.signal.aborted;
  const canJoin = () => !disposed && isActive() && Boolean(owner.scope()) && !joined && !leaving
    && typeof win.crypto?.randomUUID === 'function';
  const publish = (phase, message) => {
    state = { phase, message };
    if (!disposed) onState(state);
  };

  async function request(seat, action) {
    const signal = AbortSignal.any([seat.controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
    const headers = await circleAuthorizationHeaders(owner, seat.scope);
    if (!headers || !current(seat) || signal.aborted) throw Error('Salon request retired');
    const response = await transport(endpoint, {
      method: 'POST', cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, leaseId: seat.id }),
    });
    if (!response.ok) return { status: response.status };
    const data = await response.json();
    if (!current(seat) || signal.aborted) throw Error('Salon reply retired');
    return { data };
  }

  function stop() {
    win.clearTimeout(timer);
    joined?.controller.abort();
    leaving?.controller.abort();
    joined = leaving = null;
  }

  function retire() {
    if (!joined && !leaving) return;
    stop();
    publish('idle', 'Salon check-in cleared. Check your session and join again when ready.');
  }

  function fail(seat, status) {
    if (joined !== seat) return;
    stop();
    const message = status === 409 ? 'This account has a seat in another view. Leave it or wait for it to expire.' :
      status === 404 ? 'This salon is available to current members of open online and hybrid Circles.' :
      'Your salon check-in ended. Check your session and join again when ready.';
    publish('idle', message);
    if ([401, 403, 404].includes(status)) onAccessLost?.();
  }

  async function sync(seat) {
    try {
      if (joined !== seat || !current(seat)) return;
      const { data, status } = await request(seat, 'sync');
      if (joined !== seat || !current(seat)) return;
      if (data?.state !== 'present' || !Number.isSafeInteger(data.count) || data.count < 1) {
        fail(seat, status); return;
      }
      publish('present', data.count === 1 ? 'You are the only member checked in.' : `${data.count} members checked in, including you.`);
      if (joined === seat && current(seat)) timer = win.setTimeout(() => void sync(seat), POLL_MS);
    } catch { fail(seat); }
  }

  async function join() {
    if (!canJoin()) return;
    const seat = { id: win.crypto.randomUUID(), scope: owner.scope(), controller: new AbortController() };
    joined = seat;
    publish('joining', 'Checking current Circle membership…');
    try {
      const { data, status } = await request(seat, 'reserve');
      if (joined !== seat || !current(seat)) return;
      if (data?.state !== 'reserved') { fail(seat, status); return; }
      await sync(seat);
    } catch { fail(seat); }
  }

  async function leave() {
    if (!joined) return;
    const seat = joined;
    stop();
    const release = { ...seat, controller: new AbortController() };
    leaving = release;
    publish('leaving', 'Leaving the shared salon…');
    let released = false;
    try { released = (await request(release, 'leave')).data?.state === 'left'; }
    catch { /* Expiry handles an interrupted release. */ }
    if (leaving !== release) return;
    leaving = null;
    publish('idle', released ? 'You left the shared salon.' : 'Salon check-in closed here. Your seat will expire shortly.');
  }

  const off = owner.subscribe(() => {
    const seat = joined ?? leaving;
    if (seat && !current(seat)) retire();
  });
  return { canJoin, model: () => state, join, leave, retire, dispose() {
    disposed = true;
    stop();
    off();
  } };
}

export function salonControls(doc) {
  const ids = ['quest-salon-status', 'quest-salon-join', 'quest-salon-leave'];
  const controls = ids.map(id => doc.getElementById(id));
  if (controls.some((node, i) => !node || doc.querySelectorAll(`[id="${ids[i]}"]`).length !== 1)) {
    throw Error('Shared salon controls unavailable');
  }
  return controls;
}

export function mountBrowserSalon(doc, options) {
  const [status, join, leave] = salonControls(doc);
  const salon = createSalonPresence({ ...options, onState(model) {
    render();
    if (model.phase === 'present') options.onPresent?.();
  } });
  function render() {
    const model = salon.model();
    const message = options.isActive() && options.owner.scope() ? model.message : 'Check your member session to join the shared salon.';
    if (status.textContent !== message) status.textContent = message;
    join.disabled = !salon.canJoin();
    leave.disabled = model.phase !== 'joining' && model.phase !== 'present';
  }
  const enter = () => { if (!join.disabled) void salon.join(); };
  const exit = () => { if (!leave.disabled) void salon.leave(); };
  join.addEventListener('click', enter);
  leave.addEventListener('click', exit);
  render();
  return { render, present: () => salon.model().phase === 'present', retire: salon.retire, dispose() {
    salon.dispose();
    join.removeEventListener('click', enter);
    leave.removeEventListener('click', exit);
    join.disabled = leave.disabled = true;
    status.textContent = 'Connect a member account to join the shared salon.';
  } };
}
