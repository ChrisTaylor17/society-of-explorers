// lib/practice/draft.ts
// Keeps a signed-out visitor's Daily Practice answer while they create a free
// account, so the first thing they wrote is waiting for them when they return
// (including from the confirmation-email link, which opens a new tab).
// Stored only on this device (localStorage) for a few hours, cleared once the
// answer is saved, and never sent anywhere.

export const PRACTICE_DRAFT_KEY = 'soe.practice.draft.v1';
export const PRACTICE_MAX_CHARS = 280;
/** A saved draft older than this is dropped (the question changes daily). */
export const PRACTICE_DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

export const PRACTICE_SIGNUP_PATH = '/login?mode=signup&next=%2Fpractice';
export const PRACTICE_SIGNIN_PATH = '/login?next=%2Fpractice';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type SavedDraft = { questionId: string; text: string; savedAt: number };

export function clampDraft(text: string): string {
  return text.slice(0, PRACTICE_MAX_CHARS);
}

export function saveDraft(storage: StorageLike | null | undefined, questionId: string, text: string, now = Date.now()): void {
  if (!storage || !questionId) return;
  try {
    const clean = clampDraft(text);
    if (!clean.trim()) {
      storage.removeItem(PRACTICE_DRAFT_KEY);
      return;
    }
    const value: SavedDraft = { questionId, text: clean, savedAt: now };
    storage.setItem(PRACTICE_DRAFT_KEY, JSON.stringify(value));
  } catch {
    // Private mode or full storage: losing the draft is acceptable.
  }
}

/** Returns the saved text only if it belongs to this question and is fresh. */
export function loadDraft(storage: StorageLike | null | undefined, questionId: string, now = Date.now()): string {
  if (!storage || !questionId) return '';
  try {
    const raw = storage.getItem(PRACTICE_DRAFT_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as Partial<SavedDraft>;
    const fresh = typeof parsed.savedAt === 'number' && now - parsed.savedAt >= 0 && now - parsed.savedAt < PRACTICE_DRAFT_TTL_MS;
    if (parsed.questionId !== questionId || typeof parsed.text !== 'string' || !fresh) {
      storage.removeItem(PRACTICE_DRAFT_KEY);
      return '';
    }
    return clampDraft(parsed.text);
  } catch {
    return '';
  }
}

export function clearDraft(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(PRACTICE_DRAFT_KEY);
  } catch {}
}

export type PracticeLoadState = 'question' | 'no_question' | 'error';

/** Distinguish "there is no question today" from "we could not load it". */
export function classifyTodayResponse(ok: boolean, data: unknown): PracticeLoadState {
  if (!ok || !data || typeof data !== 'object') return 'error';
  const q = (data as { question?: unknown }).question;
  if (q && typeof q === 'object' && typeof (q as { id?: unknown }).id === 'string') return 'question';
  if ((data as { error?: unknown }).error) return 'error';
  return 'no_question';
}

export function submitErrorMessage(status: number): string {
  if (status === 401 || status === 403) return 'Your session ended. Sign in again; your answer is kept on this device.';
  if (status === 429) return 'Too many tries. Wait a minute, then commit again.';
  return 'Your answer was not saved. Check your connection and try again.';
}
