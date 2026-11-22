'use client';

import { circleHeaders } from '@/lib/circles/client';

export type AskResult = { reply: string; thinker: string; quotes: { text: string; n: number | null }[] };
export type AskOutcome = { ok: true; value: AskResult } | { ok: false; status: number | null; message: string };

/** Asks the reading companion. One request at a time; nothing retries by itself. */
export async function askLibrary(body: Record<string, unknown>, signal: AbortSignal): Promise<AskOutcome> {
  let status: number | null = null;
  try {
    const headers = await circleHeaders(true);
    const response = await fetch('/api/library/ask', { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store', redirect: 'error', signal });
    status = response.status;
    const value: unknown = await response.json().catch(() => null);
    if (response.ok && value && typeof value === 'object' && typeof (value as AskResult).reply === 'string') {
      const result = value as AskResult;
      return { ok: true, value: { reply: result.reply, thinker: String(result.thinker || ''), quotes: Array.isArray(result.quotes) ? result.quotes.filter(q => q && typeof q.text === 'string').slice(0, 4) : [] } };
    }
  } catch { if (signal.aborted) return { ok: false, status: null, message: 'Stopped.' }; }
  return { ok: false, status, message: status === 401 ? 'signin' : status === 429 ? 'Too many questions at once. Wait a moment, then ask again.' : 'The reply didn’t come through. Try again in a moment.' };
}

export async function hasSignIn(): Promise<boolean> {
  try { return Boolean((await circleHeaders(false)).Authorization); } catch { return false; }
}

type Note = { id: string; bookId: string; passage: string; text: string; createdAt: string; updatedAt: string };
const STORAGE_KEY = 'soe-notebook-v1';

/** Adds a note to the private notebook on this device (same store as /notebook). */
export function saveToNotebook(bookId: string, passage: string, text: string): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const notes = Array.isArray(parsed) ? parsed as Note[] : [];
    const now = new Date().toISOString();
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    notes.unshift({ id, bookId, passage: passage.slice(0, 5000), text: text.slice(0, 5000), createdAt: now, updatedAt: now });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes.slice(0, 500)));
    return true;
  } catch { return false; }
}
