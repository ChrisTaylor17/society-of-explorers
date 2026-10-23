// S7 (low): auth code hard-coded the Supabase auth cookie name with the project
// ref. Guard against it coming back. (Already fixed upstream; this is a guard.)
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '../..');
function walk(d: string, out: string[] = []) {
  for (const n of readdirSync(d)) {
    if (['node_modules', '.next', '.git', 'tests', 'patches', 'security-logs'].includes(n)) continue;
    const p = join(d, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out); else if (/\.(ts|tsx|js|mjs|cjs)$/.test(n)) out.push(p);
  }
  return out;
}
test('no hard-coded sb-<ref>-auth-token cookie names in source', () => {
  const hits = walk(ROOT).filter(f => /['"`]sb-[a-z0-9]{20}-auth-token/.test(readFileSync(f, 'utf8')));
  expect(hits).toEqual([]);
});
test('proxy matches Supabase auth cookies generically', () => {
  const src = readFileSync(join(ROOT, 'proxy.ts'), 'utf8');
  expect(src).toMatch(/sb-.*auth-token/);
});
