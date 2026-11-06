import { safePrivateMeetingUrl } from './circle-host.mjs';

const checkSession = 'Check your member session to open the live meeting.';
const readyMessage = 'Ready to check current Circle access and open the host’s meeting in this tab.';
const unavailable = 'The live meeting is unavailable for your current Circle access.';

export function mountBrowserMeeting(doc, { window: win, origin, circleId, owner, transport, isActive }) {
  const ids = ['quest-meeting-status', 'quest-meeting-open'];
  const [status, button] = ids.map(id => doc.getElementById(id));
  if (!status || !button || ids.some(id => doc.querySelectorAll(`[id="${id}"]`).length !== 1)) {
    throw Error('Live meeting controls unavailable');
  }
  const endpoint = origin + '/api/circles/' + circleId;
  let pending = null, message = readyMessage, disposed = false;
  const active = () => !disposed && isActive() && doc.visibilityState === 'visible'
    && doc.hasFocus() && win.navigator.onLine !== false;

  function cancel() {
    const previous = pending;
    pending = null;
    if (previous) {
      win.clearTimeout(previous.timer);
      previous.controller.abort();
    }
  }

  function render() {
    const scope = active() ? owner.scope() : null;
    if (pending && pending.scope !== scope) {
      cancel();
      message = readyMessage;
    }
    button.disabled = !scope || Boolean(pending);
    const text = scope ? message : checkSession;
    if (status.textContent !== text) status.textContent = text;
  }

  function retire() {
    cancel();
    message = readyMessage;
    render();
  }

  async function open() {
    const scope = active() ? owner.scope() : null;
    if (!scope || pending || button.disabled) return;
    const controller = new AbortController();
    const attempt = { scope, controller, timer: win.setTimeout(() => finish(unavailable), 9_000) };
    const current = () => pending === attempt && active() && owner.scope() === scope && !controller.signal.aborted;
    function finish(notice) {
      if (pending !== attempt) return;
      cancel();
      message = notice;
      render();
    }
    pending = attempt;
    message = 'Checking current Circle access…';
    render();
    try {
      const bearer = await owner.bearer(scope);
      if (!current()) return;
      if (!bearer) throw Error('Meeting credential unavailable');
      const response = await transport(endpoint, { method: 'GET', cache: 'no-store', credentials: 'same-origin',
        redirect: 'error', signal: controller.signal, headers: { Authorization: 'Bearer ' + bearer } });
      if (!current()) return;
      if (response.status !== 200 || response.redirected || response.url !== endpoint) throw Error('Meeting response unavailable');
      const detail = await response.json();
      if (!current()) return;
      if (detail?.ready !== true || detail.ended !== false || detail.circle?.id !== circleId
        || detail.circle.hidden !== false || !['forming', 'active'].includes(detail.circle.status)
        || !['online', 'hybrid'].includes(detail.circle.format)
        || detail.viewer?.signed_in !== true || detail.viewer.is_member !== true) throw Error('Meeting access unavailable');
      const href = safePrivateMeetingUrl(detail.online_url);
      if (!href) throw Error('Meeting link unavailable');

      const link = doc.createElement('a');
      link.href = href;
      link.target = '_self';
      link.rel = 'noopener noreferrer';
      link.referrerPolicy = 'no-referrer';
      link.hidden = true;
      doc.body.append(link);
      try { if (current()) link.click(); }
      finally { link.remove(); }
      finish('Opening the live meeting in this tab. Use Back to return.');
    } catch { finish(unavailable); }
    finally { if (pending === attempt) retire(); }
  }

  button.addEventListener('click', open);
  render();
  return { render, retire, focus() { if (active()) status.focus(); }, dispose() {
    disposed = true;
    button.removeEventListener('click', open);
    retire();
  } };
}
