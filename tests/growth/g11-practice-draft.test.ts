// G11: Daily Practice first run. Signed-out visitors can write, the answer
// survives signup on this device (TTL-limited), and failures are explained.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRACTICE_DRAFT_KEY,
  PRACTICE_DRAFT_TTL_MS,
  PRACTICE_MAX_CHARS,
  PRACTICE_SIGNIN_PATH,
  PRACTICE_SIGNUP_PATH,
  classifyTodayResponse,
  clearDraft,
  loadDraft,
  saveDraft,
  submitErrorMessage,
} from '../../lib/practice/draft';
import { getSafeNextPath, modeFromSearch } from '../../lib/auth/loginForm';
import { FREE_SIGNUP_PATH } from '../../lib/join/content';

const root = join(import.meta.dir, '../..');
const page = readFileSync(join(root, 'app/practice/page.tsx'), 'utf8');

function memStorage() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

test('G11a draft round-trips for the same question', () => {
  const s = memStorage();
  saveDraft(s, 'q1', 'I notice the light.', 1000);
  expect(loadDraft(s, 'q1', 2000)).toBe('I notice the light.');
});

test('G11b draft for another question or past the TTL is dropped', () => {
  const s = memStorage();
  saveDraft(s, 'q1', 'old', 0);
  expect(loadDraft(s, 'q2', 1)).toBe('');
  expect(s.m.has(PRACTICE_DRAFT_KEY)).toBe(false);
  saveDraft(s, 'q1', 'old', 0);
  expect(loadDraft(s, 'q1', PRACTICE_DRAFT_TTL_MS)).toBe('');
  saveDraft(s, 'q1', 'future', 10_000);
  expect(loadDraft(s, 'q1', 0)).toBe('');
});

test('G11c drafts are clamped, blanks are not stored, clear works', () => {
  const s = memStorage();
  saveDraft(s, 'q1', 'x'.repeat(400), 0);
  expect(loadDraft(s, 'q1', 1).length).toBe(PRACTICE_MAX_CHARS);
  saveDraft(s, 'q1', '   ', 0);
  expect(s.m.size).toBe(0);
  saveDraft(s, 'q1', 'keep', 0);
  clearDraft(s);
  expect(s.m.size).toBe(0);
});

test('G11d storage failures never throw', () => {
  const broken = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('denied'); },
  };
  expect(() => saveDraft(broken, 'q1', 'x')).not.toThrow();
  expect(loadDraft(broken, 'q1')).toBe('');
  expect(() => clearDraft(broken)).not.toThrow();
  expect(loadDraft(null, 'q1')).toBe('');
  const s = memStorage();
  s.setItem(PRACTICE_DRAFT_KEY, '{not json');
  expect(loadDraft(s, 'q1')).toBe('');
});

test('G11e only a short text, question id and time are stored (no ids or tokens)', () => {
  const s = memStorage();
  saveDraft(s, 'q1', 'hello', 5);
  expect(Object.keys(JSON.parse(s.m.get(PRACTICE_DRAFT_KEY)!)).sort()).toEqual(['questionId', 'savedAt', 'text']);
});

test('G11f load failures are not shown as "no question today"', () => {
  expect(classifyTodayResponse(true, { question: { id: 'q1' } })).toBe('question');
  expect(classifyTodayResponse(false, { question: null })).toBe('error');
  expect(classifyTodayResponse(true, null)).toBe('error');
  expect(classifyTodayResponse(true, { error: 'boom' })).toBe('error');
  expect(classifyTodayResponse(true, { question: null })).toBe('no_question');
});

test('G11g submit errors explain what happened and that the answer is kept', () => {
  expect(submitErrorMessage(401)).toMatch(/Sign in again/);
  expect(submitErrorMessage(429)).toMatch(/Wait a minute/);
  expect(submitErrorMessage(500)).toMatch(/not saved/);
  expect(submitErrorMessage(0)).toMatch(/connection/);
});

test('G11h signed-out paths go to free signup / sign-in and come back to /practice', () => {
  expect(PRACTICE_SIGNUP_PATH).toBe(FREE_SIGNUP_PATH);
  for (const p of [PRACTICE_SIGNUP_PATH, PRACTICE_SIGNIN_PATH]) {
    const u = new URL(p, 'http://x');
    expect(u.pathname).toBe('/login');
    expect(getSafeNextPath(u.searchParams.get('next'))).toBe('/practice');
  }
  expect(modeFromSearch(new URL(PRACTICE_SIGNIN_PATH, 'http://x').search)).toBe('signin');
});

test('G11i practice page: visitors can type; no bounce to the paid /join page', () => {
  expect(page).not.toMatch(/readOnly=\{loggedOut\}/);
  expect(page).not.toContain("window.location.href = '/join'");
  expect(page).not.toContain("window.location.assign('/join')");
  expect(page).not.toContain('href="/join"');
  expect(page).toContain('PRACTICE_SIGNUP_PATH');
  expect(page).toContain('loadDraft(');
  expect(page).toContain('clearDraft(');
  expect(page).toContain('aria-label={`Your answer');
  expect(page).toContain('TRY AGAIN');
});
