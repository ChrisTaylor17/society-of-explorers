import { createMemberBlocks } from './circle-host.mjs';

const ids = ['member-blocks', 'member-blocks-heading', 'member-blocks-status', 'member-blocks-load',
  'member-blocks-items', 'member-blocks-next', 'member-blocks-review', 'member-blocks-review-heading',
  'member-blocks-person', 'member-blocks-unblock', 'member-blocks-cancel', 'member-blocks-retry', 'member-blocks-clear'];

export function mountMemberBlocks({ document, config }) {
  const el = id => document.getElementById('member-blocks' + (id ? '-' + id : ''));
  const present = ids.filter(id => document.getElementById(id)).length;
  if (!present) return null;
  if (present !== ids.length || ids.some(id => document.querySelectorAll('[id="' + id + '"]').length !== 1)) {
    throw Error('Blocked members controls unavailable');
  }
  const view = createMemberBlocks({ ...config, initialOnline: false });
  let epoch = 0, previousReview = false;
  const bindings = [];
  const text = (tag, value) => {
    const element = document.createElement(tag);
    element.textContent = value;
    return element;
  };
  const clearHandlers = () => {
    for (const remove of bindings.splice(0)) remove();
  };

  function render(model) {
    const current = ++epoch;
    clearHandlers();
    const bind = (element, enabled, action) => {
      element.disabled = !enabled;
      const listener = () => { if (epoch === current && enabled) action(); };
      element.addEventListener('click', listener);
      bindings.push(() => element.removeEventListener('click', listener));
    };
    const review = model.review;
    el('').setAttribute('aria-busy', String(model.busy));
    el('status').textContent = model.message;
    el('items').replaceChildren(...(review ? [] : model.page?.items ?? []).map(item => {
      const row = document.createElement('article');
      row.append(text('p', item.label + ' · ' + new Date(item.changedAt).toLocaleString()));
      const button = text('button', 'Review unblock');
      button.type = 'button';
      button.setAttribute('aria-label', 'Review unblock for ' + item.label);
      bind(button, model.canReview, () => view.review(item.blockId, item.revision));
      row.append(button);
      return row;
    }));
    el('review').hidden = !review;
    el('person').textContent = review ? review.label + ' · ' + new Date(review.changedAt).toLocaleString() : '';
    el('next').hidden = !model.page?.nextCursor || Boolean(review);
    el('retry').hidden = !model.canRetry;
    bind(el('load'), model.canLoad, () => void view.load());
    bind(el('next'), model.canNext, () => void view.next());
    bind(el('unblock'), model.canUnblock, () => void view.unblock());
    bind(el('cancel'), Boolean(review), view.cancelReview);
    bind(el('retry'), model.canRetry, () => void view.retry());
    bind(el('clear'), model.active && Boolean(model.busy || model.page || model.canRetry), view.close);
    if (review && !previousReview) el('review-heading').focus({ preventScroll: true });
    previousReview = Boolean(review);
  }

  const off = view.subscribe(render);
  view.connect();
  return {
    activity(active, online) { view.activity(active); view.connectivity(online); },
    dispose() { view.disconnect(); off(); epoch++; clearHandlers(); },
  };
}
