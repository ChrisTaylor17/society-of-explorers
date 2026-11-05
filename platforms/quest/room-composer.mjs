export const ROOM_POST_LIMIT = 180;
export const ROOM_TEXT_COLUMNS = 48;

const letters = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const symbols = ['1234567890', '.,!?;:\'"-_', '()@#%&/+*='];
const button = (id, label, disabled = false) => ({ id, label, disabled });

export function roomReviewText(model) {
  const text = model.preview?.content;
  // The controller keyboard emits ASCII. The extra lines are the canonical
  // reply locator. Bound the complete preview to the available panel rows.
  return typeof text === 'string' && /^[ -~\n]{1,360}$/u.test(text) &&
    text.split('\n').reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / ROOM_TEXT_COLUMNS)), 0) <= 9 ? text : null;
}

export function roomComposerPanel(model, keyboard) {
  const label = 'CIRCLE DISCUSSION';
  const pointing = 'Point at a button and press the trigger. Squeeze to leave.';
  if (model.phase === 'editing') {
    const rows = (keyboard.symbols ? symbols : letters).map(row => [...row].map(char => {
      const key = keyboard.caps ? char.toUpperCase() : char;
      return button('key:' + key, key, model.draft.length >= ROOM_POST_LIMIT);
    }));
    rows.push([button('symbols', keyboard.symbols ? 'ABC' : 'Symbols'), button('caps', keyboard.caps ? 'Caps on' : 'Caps'),
      button('space', 'Space', model.draft.length >= ROOM_POST_LIMIT), button('delete', 'Delete', !model.draft)]);
    rows.push([button('cancel', 'Cancel'), button('review', 'Review', !model.canReview)]);
    return { label, heading: model.target ? `Reply to ${model.target.member_name}` : 'Write a Circle post',
      text: model.draft.length > 132 ? '…' + model.draft.slice(-132) : model.draft || 'Choose letters to write a short message.',
      exact: true, keyboard: true, rows, footer: `${model.draft.length} of ${ROOM_POST_LIMIT}. ${pointing}` };
  }
  if (model.phase === 'review') {
    const text = roomReviewText(model);
    return { label, heading: model.target ? `Review reply to ${model.target.member_name}` : 'Review your post',
      text: text ?? 'This preview is too long for the room. Edit it or use the regular discussion.', exact: text !== null, review: true,
      rows: [[button('cancel', 'Cancel'), button('edit', 'Edit'), button('post', 'Post', text === null)]],
      footer: 'Check the complete text. Choose Post to send it to your Circle.' };
  }
  if (model.phase === 'unknown') {
    return { label, heading: 'Delivery unconfirmed', text: model.message,
      rows: [[button('lookup', 'Check delivery', !model.canCheck), button('retry', 'Retry same post', !model.canRetry)]], footer: pointing };
  }
  if (model.phase === 'previewing' || model.phase === 'sending') {
    return { label, heading: model.phase === 'previewing' ? 'Preparing your review' : 'Sending to your Circle', text: model.message, footer: 'Squeeze to leave.' };
  }
  return { label, heading: model.phase === 'confirmed' ? 'Post confirmed' : 'Check the discussion',
    text: model.phase === 'confirmed' ? 'Your message was saved to the Circle discussion.' : model.message,
    rows: [[button('discussion', 'Read recent discussion')]], footer: pointing };
}
