// Offline test doubles for the security tests. No network, no real credentials.
// Values below are synthetic placeholders, not secrets.
import { mock } from 'bun:test';

export const ADA = '11111111-1111-4111-8111-111111111111';   // fictional
export const JULES = '22222222-2222-4222-8222-222222222222'; // fictional

type Row = Record<string, any>;

export class FakeDb {
  tables: Record<string, Row[]> = {};
  log: { table: string; op: string; filters: any[]; payload?: any }[] = [];
  seq = 0;
  constructor(seed: Record<string, Row[]> = {}) {
    for (const [k, v] of Object.entries(seed)) this.tables[k] = v.map(r => ({ ...r }));
  }
  rows(t: string) { return (this.tables[t] ??= []); }
  from(table: string) { return new Q(this, table); }
  async rpc() { return { data: null, error: null }; }
  auth = { getUser: async () => ({ data: { user: null } }) };
}

class Q {
  op = 'select'; filters: any[] = []; payload: any; conflict?: string;
  isSingle = false; lim?: number; ord?: [string, boolean]; wantRows = false;
  constructor(public db: FakeDb, public table: string) {}
  countOnly = false;
  select(_c?: string, o?: { count?: string; head?: boolean }) { if (o?.head) this.countOnly = true; if (this.op !== 'select') this.wantRows = true; return this; }
  // Typing helpers / range filters used by production routes (range filters are not evaluated).
  returns() { return this; }
  neq(c: string, v: any) { this.filters.push(['neq', c, v]); return this; }
  gt(_c: string, _v: any) { return this; }
  gte(_c: string, _v: any) { return this; }
  lt(_c: string, _v: any) { return this; }
  lte(_c: string, _v: any) { return this; }
  ilike(_c: string, _v: any) { return this; }
  in(c: string, v: any[]) { this.filters.push(['in', c, v]); return this; }
  not(c: string, op: string, v: any) { this.filters.push(['not', c, op, v]); return this; }
  is(c: string, v: any) { this.filters.push(['isnull', c, v]); return this; }
  contains(c: string, v: any[]) { this.filters.push(['contains', c, v]); return this; }
  range(a: number, b: number) { this.lim = b - a + 1; return this; }
  maybeSingle() { this.isSingle = true; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: any) { this.filters.push(['eq', c, v]); return this; }
  or(expr: string) { this.filters.push(['or', expr]); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.ord = [c, o?.ascending !== false]; return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.isSingle = true; return this; }
  insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
  update(p: any) { this.op = 'update'; this.payload = p; return this; }
  upsert(p: any, o?: { onConflict?: string }) { this.op = 'upsert'; this.payload = p; this.conflict = o?.onConflict; return this; }
  match(r: Row) {
    return this.filters.every(f => {
      if (f[0] === 'eq') return r[f[1]] === f[2];
      if (f[0] === 'or') return String(f[1]).split(',').some(cl => {
        const [c, op, ...rest] = cl.split('.'); const v = rest.join('.');
        return op === 'eq' ? r[c] === v : op === 'is' ? r[c] == null : false;
      });
      if (f[0] === 'neq') return r[f[1]] !== f[2];
      if (f[0] === 'in') return f[2].includes(r[f[1]]);
      if (f[0] === 'not') return f[2] === 'is' ? r[f[1]] != null : true;
      if (f[0] === 'isnull') return r[f[1]] == null;
      if (f[0] === 'contains') return f[2].every((x: any) => (r[f[1]] || []).includes(x));
      return true;
    });
  }
  exec() {
    const rows = this.db.rows(this.table);
    this.db.log.push({ table: this.table, op: this.op, filters: this.filters, payload: this.payload });
    if (this.op === 'insert') {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload])
        .map((p: Row) => ({ id: `row-${++this.db.seq}`, created_at: new Date(1_700_000_000_000 + this.db.seq * 1000).toISOString(), ...p }));
      rows.push(...items);
      return { data: this.isSingle ? items[0] : items, error: null };
    }
    if (this.op === 'upsert') {
      const k = this.conflict!; const i = rows.findIndex(r => r[k] === this.payload[k]);
      const row = i >= 0 ? Object.assign(rows[i], this.payload) : (rows.push({ id: `row-${++this.db.seq}`, ...this.payload }), rows[rows.length - 1]);
      return { data: this.isSingle ? row : [row], error: null };
    }
    if (this.op === 'delete') { const keep = rows.filter(r => !this.match(r)); rows.length = 0; rows.push(...keep); return { data: null, error: null }; }
    if (this.op === 'update') { rows.filter(r => this.match(r)).forEach(r => Object.assign(r, this.payload)); return { data: null, error: null }; }
    let out = rows.filter(r => this.match(r));
    if (this.ord) { const [c, asc] = this.ord; out = [...out].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1)); }
    if (this.countOnly) return { data: null, count: out.length, error: null };
    if (this.lim != null) out = out.slice(0, this.lim);
    return { data: this.isSingle ? (out[0] ?? null) : out, error: null };
  }
  then(res: any, rej: any) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
}

export const anthropicCalls: any[] = [];
export let db = new FakeDb();
export function resetDb(seed: Record<string, Row[]> = {}) { db = new FakeDb(seed); anthropicCalls.length = 0; return db; }

class FakeCookies {
  jar = new Map<string, { value: string; opts?: any }>();
  constructor(init: Record<string, string> = {}) { for (const [k, v] of Object.entries(init)) this.jar.set(k, { value: v }); }
  get(n: string) { const c = this.jar.get(n); return c ? { name: n, value: c.value } : undefined; }
  set(n: string, value: string, opts?: any) { this.jar.set(n, { value, opts }); }
}

export function makeReq(body: any, opts: { cookies?: Record<string, string>; headers?: Record<string, string>; url?: string } = {}) {
  const headers = new Headers(opts.headers || {});
  // Mirror cookies into a Cookie header too, for edge routes that parse it themselves.
  if (opts.cookies && !headers.has('cookie')) headers.set('cookie', Object.entries(opts.cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '));
  const url = opts.url || 'http://localhost/x';
  const text = body === undefined ? '' : JSON.stringify(body);
  return { json: async () => body, text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer, headers, cookies: new FakeCookies(opts.cookies), nextUrl: new URL(url), url, method: 'POST' } as any;
}

export function installMocks(extra: Record<string, () => any> = {}) {
  // Trap the network: any fetch is a test failure.
  (globalThis as any).fetch = () => { throw new Error('network access attempted in offline test'); };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://offline.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-placeholder';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'offline-placeholder';
  process.env.ANTHROPIC_API_KEY = 'offline-placeholder';

  class NextResponse extends Response {
    cookies = new FakeCookies();
    static json(data: any, init?: ResponseInit) {
      return new NextResponse(JSON.stringify(data), { ...init, headers: { 'Content-Type': 'application/json' } });
    }
  }
  mock.module('next/server', () => ({ NextResponse, NextRequest: class {} }));
  mock.module('@supabase/supabase-js', () => ({ createClient: () => new Proxy({}, { get: (_t, p) => (db as any)[p] }) }));
  mock.module('@/lib/supabase/server', () => ({
    // Supabase-session user is controllable per test via globalThis.__authUser.
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: (globalThis as any).__authUser ?? null } }) } }),
    createServiceClient: () => new Proxy({}, { get: (_t, p) => (db as any)[p] }),
  }));
  class Anthropic {
    messages = {
      create: async (args: any) => { anthropicCalls.push(args); return { content: [{ type: 'text', text: '{"votes":[],"best_quote":"","best_quote_thinker":"","session_theme":"t"}' }] }; },
      stream: (args: any) => {
        anthropicCalls.push(args);
        const handlers: any = {};
        return { on: (e: string, f: any) => { handlers[e] = f; }, finalMessage: async () => { handlers.text?.('Consider the question.'); return {}; } };
      },
    };
  }
  mock.module('@anthropic-ai/sdk', () => ({ default: Anthropic }));
  for (const [k, f] of Object.entries(extra)) mock.module(k, f);
}

// Production signs the soe_wallet_id cookie (lib/auth/walletSession.ts) with
// WALLET_SESSION_SECRET || NEXTAUTH_SECRET. Tests set a synthetic NEXTAUTH_SECRET.
export async function walletCookie(memberId: string): Promise<string> {
  const m = await import('../../lib/auth/walletSession.ts');
  const v = await m.createWalletSessionValue(memberId);
  if (!v) throw new Error('walletCookie: signing failed (no test secret set?)');
  return v;
}

export async function drain(res: Response) { try { return await res.text(); } catch { return ''; } }
export async function settle() { for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0)); }
