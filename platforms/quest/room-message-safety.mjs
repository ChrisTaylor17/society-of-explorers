import { MESSAGE_BLOCK_PRIVACY, MESSAGE_REPORT_OPTIONS } from './circle-host.mjs';
import { roomReadingPages } from './room-reading.mjs';

const label = 'MESSAGE ACTIONS';
const exit = 'Squeeze to leave the headset room.';
const control = (id, label) => ({ id, label });
const back = control('safety-back', 'Read current discussion');
const check = control('safety-check', 'Check current message');
const actions = [
  { kind: 'report', label: 'Report post', heading: 'Review private report', send: 'Send private report', retry: 'Retry exact report',
    text: 'A human moderator will review the report privately.' },
  { kind: 'block', label: 'Block member', heading: 'Review member block', send: 'Confirm block', retry: 'Retry exact block',
    text: MESSAGE_BLOCK_PRIVACY },
  { kind: 'withdraw', label: 'Withdraw my post', heading: 'Review withdrawal', send: 'Confirm withdrawal', retry: 'Retry exact withdrawal',
    text: 'This removes your post from member views. Restricted evidence may remain for safety review.' },
];

function checkedPost(model) {
  const message = model.state?.message;
  return model.phase === 'ready' && model.canConfirm && message?.visibility === 'visible' ? message : null;
}
function options(state) {
  return actions.filter(({ kind }) => kind === 'report' ? state.canReport : kind === 'block' ? state.blockReview : state.canWithdraw);
}

/** The shared message controller owns permissions, the checked revision and
 * exact retry. This view only paginates the checked post and takes input. */
export function createRoomMessageSafety({ host, id, isActive, onPanel }) {
  let stage = 'post', page = 0, reason = 0, chosen = null;
  const model = () => host.model().messageSafety;
  const actionMenu = control('safety-choose', 'Choose action');
  const checked = control('safety-post', 'Back to checked post');
  const cancel = control('safety-menu', 'Back to actions');

  function show(heading, text, controls = [], extra = {}) {
    onPanel({ label, heading, text, footer: exit, rows: controls.length ? [controls] : [], ...extra });
  }
  function render() {
    if (!isActive()) return;
    const current = model();
    if (current.busy) { show('Message actions', current.message); return; }
    if (current.phase === 'confirmed') { show('Message action confirmed', current.message, [back]); return; }
    if (current.phase === 'unknown') {
      const pending = actions.find(action => action.kind === current.pendingAction);
      show('Message action unconfirmed', current.message, [
        ...(current.canCheck ? [check] : []),
        ...(current.canRetry && pending ? [control('safety-retry', pending.retry)] : []),
      ]);
      return;
    }
    const message = checkedPost(current);
    if (!message) {
      show('Message actions unavailable', current.phase === 'ready'
        ? 'Use the regular Circle view to check this post.' : current.message, [...(current.canCheck ? [check] : []), back]);
      return;
    }
    if (stage === 'choose') {
      show('Choose an action', 'Choose an action for this checked post. You will review it before sending.',
        [...options(current.state).map(action => control('safety-action:' + action.kind, action.label)), checked]);
    } else if (stage === 'reason') {
      const option = MESSAGE_REPORT_OPTIONS[reason];
      show('Choose a report reason', `${option.label}. Reason ${reason + 1} of ${MESSAGE_REPORT_OPTIONS.length}.`, [
        cancel, ...(reason > 0 ? [control('safety-reason-previous', 'Previous reason')] : []),
        ...(reason + 1 < MESSAGE_REPORT_OPTIONS.length ? [control('safety-reason-next', 'Next reason')] : []),
        control('safety-reason-use', 'Use this reason'),
      ]);
    } else if (stage === 'confirm' && chosen) {
      const text = chosen.kind === 'report' ? `Reason selected. ${MESSAGE_REPORT_OPTIONS[reason].label}. ${chosen.text}` : chosen.text;
      show(chosen.heading, text, [cancel, control('safety-send', chosen.send)], { review: true });
    } else {
      const pages = roomReadingPages(message.content);
      show(message.is_mine ? 'Your checked post' : message.member_name, '', [
        back, ...(page > 0 ? [control('safety-post-previous', 'Previous part')] : []),
        page + 1 < pages.length ? control('safety-post-next', 'Next part') : actionMenu,
      ], { readingLines: pages[page], footer: `Checked post. Part ${page + 1} of ${pages.length}. ${exit}` });
    }
  }
  async function perform(operation) {
    const pending = operation();
    render();
    await pending;
    render();
  }
  return {
    id,
    open: () => perform(() => host.messageOpen(id)),
    async select(target) {
      if (!isActive()) return false;
      const current = model();
      if (target === 'safety-back' && (!current.open || current.canClose)) { host.messageClose(); return true; }
      if (target === 'safety-check' && current.canCheck) {
        stage = 'post'; page = 0; chosen = null;
        await perform(host.messageRefresh);
        return false;
      }
      if (target === 'safety-retry' && current.canRetry) { await perform(host.messageRetry); return false; }
      const message = checkedPost(current);
      if (!message) return false;
      if (stage === 'post') {
        const last = roomReadingPages(message.content).length - 1;
        if (target === 'safety-post-previous' && page > 0) page--;
        if (target === 'safety-post-next' && page < last) page++;
        if (target === 'safety-choose' && page === last) stage = 'choose';
      } else if (stage === 'choose') {
        if (target === 'safety-post') stage = 'post';
        else {
          chosen = options(current.state).find(action => target === 'safety-action:' + action.kind);
          if (chosen) { stage = chosen.kind === 'report' ? 'reason' : 'confirm'; reason = 0; }
        }
      } else if (target === 'safety-menu') {
        stage = 'choose'; chosen = null;
      } else if (stage === 'reason') {
        if (target === 'safety-reason-previous' && reason > 0) reason--;
        if (target === 'safety-reason-next' && reason + 1 < MESSAGE_REPORT_OPTIONS.length) reason++;
        if (target === 'safety-reason-use' && host.messageReason(MESSAGE_REPORT_OPTIONS[reason].value)) stage = 'confirm';
      } else if (stage === 'confirm' && target === 'safety-send' && chosen && options(current.state).includes(chosen)) {
        host.messageConfirm(true);
        await perform(() => host.messageSubmit(chosen.kind));
        return false;
      }
      render();
      return false;
    },
  };
}
