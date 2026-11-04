import type { BookEditionResponse } from './bookmarks';
import type { PassageReference } from './passages';

export const PASSAGE_EXTRACTION_VERSION = 'edition-block-text-v1';
export const PASSAGE_QUOTE_LIMIT = 600;

/** Fold HTML source wrapping while retaining explicit verse and preformatted
 * line breaks. Unicode, punctuation and text order are never rewritten. */
export function canonicalPassageText(root: Node, preformatted = false): string {
  const pre = preformatted || (root.nodeType === 1 && Boolean((root as Element).closest('pre')));
  function visit(node: Node): string {
    if (node.nodeType === 3) {
      const value = (node.nodeValue || '').replace(/\r\n?/gu, '\n');
      return pre ? value : value.replace(/\s+/gu, ' ');
    }
    if (node.nodeType === 1) {
      const tag = (node as Element).tagName.toLowerCase();
      if (tag === 'br') return '\n';
      if (tag === 'script' || tag === 'style') return '';
    }
    return Array.from(node.childNodes).map(visit).join('');
  }
  const value = visit(root);
  return pre ? value.trim() : value.replace(/[^\S\n]+/gu, ' ').replace(/ *\n */gu, '\n').trim();
}

export function passageBlockReason(element: Element): 'non_text' | 'table' | null {
  if (element.closest('table')) return 'table';
  if (element.querySelector('img,svg,math,canvas,object,audio,video,iframe')) return 'non_text';
  return null;
}

export type PassageSelection =
  | { ok: true; reference: PassageReference; selectedText: string }
  | { ok: false; reason: string; reference?: PassageReference };

export function passageBlockReference(metadata: BookEditionResponse, blockIndex: number): PassageReference | null {
  if (!Number.isSafeInteger(blockIndex) || blockIndex < 0 || blockIndex >= metadata.edition.blockCount) return null;
  return { version: 1, bookId: metadata.bookId, editionId: metadata.edition.editionId, blockIndex, start: null, end: null };
}

/** Capture coordinates from the live same-origin edition frame. The server
 * independently resolves them; selected or pasted words are never authority. */
export function capturePassageSelection(document: Document, blocks: HTMLElement[], metadata: BookEditionResponse): PassageSelection {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return { ok: false, reason: 'Select a short passage in the book first.' };
  if (blocks.length !== metadata.edition.blockCount) return { ok: false, reason: 'This edition changed. Reload the complete book before selecting a passage.' };
  const range = selection.getRangeAt(0);
  const elementFor = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;
  const first = elementFor(range.startContainer)?.closest<HTMLElement>('[data-reading-index]');
  const last = elementFor(range.endContainer)?.closest<HTMLElement>('[data-reading-index]');
  if (!first || first !== last || !first.contains(range.startContainer) || !first.contains(range.endContainer)) {
    return { ok: false, reason: 'Choose an excerpt within one reading block, or share a source-block link without a quotation.' };
  }
  const blockIndex = Number(first.dataset.readingIndex);
  const reference = passageBlockReference(metadata, blockIndex);
  if (!reference || blocks[blockIndex] !== first) return { ok: false, reason: 'This reading position could not be verified.' };
  if (passageBlockReason(first)) {
    return { ok: false, reference, reason: 'This block includes an equation, image or table. Share its source link so that content is not omitted from a quotation.' };
  }
  try {
    const pre = first.tagName.toLowerCase() === 'pre' || Boolean(first.closest('pre'));
    const quote = canonicalPassageText(range.cloneContents(), pre);
    if (!quote || quote.length > PASSAGE_QUOTE_LIMIT) return { ok: false, reference, reason: `Select 1–${PASSAGE_QUOTE_LIMIT} text characters, or use the source-block link.` };
    const through = range.cloneRange();
    through.selectNodeContents(first);
    through.setEnd(range.endContainer, range.endOffset);
    const end = canonicalPassageText(through.cloneContents(), pre).length;
    const start = end - quote.length;
    const text = canonicalPassageText(first, pre);
    if (start < 0 || text.slice(start, end) !== quote
      || (start > 0 && /[\uDC00-\uDFFF]/u.test(text[start]))
      || (end < text.length && /[\uDC00-\uDFFF]/u.test(text[end]))) {
      return { ok: false, reference, reason: 'The selected text could not be located exactly. Choose it again or use a source-block link.' };
    }
    return { ok: true, reference: { ...reference, start, end }, selectedText: quote };
  } catch {
    return { ok: false, reference, reason: 'The selected text could not be located exactly. Nothing has been shared.' };
  }
}
