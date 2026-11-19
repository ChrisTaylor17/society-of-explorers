import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { dirname, join } from "node:path";

export type StoreKind = "postgres" | "sqlite" | "ephemeral-sqlite" | "blob";

type Row = Record<string, unknown>;

export interface Exec {
  all<T extends Row>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T extends Row>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  begin?: () => Promise<void>;
  commit?: () => Promise<void>;
  rollback?: () => Promise<void>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS signer (
    id TEXT PRIMARY KEY,
    private_pem TEXT NOT NULL,
    public_pem TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    magic_name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    passcode_hash TEXT NOT NULL,
    passcode_salt TEXT NOT NULL,
    interests TEXT NOT NULL,
    availability TEXT NOT NULL,
    area TEXT NOT NULL,
    contact_handle TEXT NOT NULL,
    bio TEXT NOT NULL,
    share_area INTEGER NOT NULL DEFAULT 0,
    share_bio INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    issued_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    blurb TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    when_label TEXT NOT NULL,
    place_label TEXT NOT NULL,
    note TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (plan_id, invitee_id)
  )`,
  `CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    grantor_id TEXT NOT NULL,
    grantee_kind TEXT NOT NULL,
    grantee_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    enjoyment TEXT NOT NULL,
    keep_note TEXT NOT NULL,
    again TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (plan_id, author_id)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    grantee_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    signature TEXT NOT NULL,
    public_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    seq INTEGER,
    prev_hash TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    bucket TEXT PRIMARY KEY,
    hits INTEGER NOT NULL,
    window_start TEXT NOT NULL
  )`,
];

const ADD_COLUMNS = [
  "ALTER TABLE people ADD COLUMN share_area INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE people ADD COLUMN share_bio INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE sessions ADD COLUMN issued_at TEXT",
  "ALTER TABLE audit_events ADD COLUMN seq INTEGER",
  "ALTER TABLE audit_events ADD COLUMN prev_hash TEXT",
];

function bind(params: unknown[] = []): SQLInputValue[] {
  return params.map((value) => {
    if (value == null) return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
    if (value instanceof Uint8Array) return value;
    return String(value);
  });
}

function toPg(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

export function createSqliteExec(filename: string): Exec {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return {
    async all<T extends Row>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...bind(params)) as T[];
    },
    async get<T extends Row>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).get(...bind(params)) as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      const info = db.prepare(sql).run(...bind(params));
      return { changes: Number(info.changes ?? 0) };
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  };
}

export async function createNeonExec(url: string): Promise<Exec> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  return {
    async all<T extends Row>(q: string, params: unknown[] = []) {
      const rows = await sql.query(toPg(q), params);
      return rows as T[];
    },
    async get<T extends Row>(q: string, params: unknown[] = []) {
      const rows = await sql.query(toPg(q), params);
      return (rows[0] as T | undefined) ?? undefined;
    },
    async run(q: string, params: unknown[] = []) {
      const rows = await sql.query(toPg(q), params);
      return { changes: Array.isArray(rows) ? rows.length : 0 };
    },
    async exec(q: string) {
      const parts = q
        .split(/;\s*\n/)
        .map((part) => part.trim())
        .filter(Boolean);
      for (const part of parts) await sql.query(part.endsWith(";") ? part.slice(0, -1) : part);
    },
  };
}

const BLOB_PATH = "meridian/state.sqlite";

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

type JournalEntry = { sql: string; params?: unknown[] };

export async function createBlobSqliteExec(filename: string): Promise<Exec> {
  const { BlobPreconditionFailedError, get, put } = await import("@vercel/blob");
  mkdirSync(dirname(filename), { recursive: true });
  let database: DatabaseSync | null = null;
  let etag: string | undefined;
  let depth = 0;
  let dirty = false;
  let journal: JournalEntry[] = [];
  let locked = false;
  const waiters: Array<() => void> = [];

  const acquire = () => {
    if (!locked) {
      locked = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiters.push(resolve));
  };

  const release = () => {
    const next = waiters.shift();
    if (next) next();
    else locked = false;
  };

  const open = (bytes?: Buffer) => {
    database?.close();
    if (bytes) writeFileSync(filename, bytes);
    database = new DatabaseSync(filename);
    database.exec("PRAGMA foreign_keys = ON");
  };

  const discard = () => {
    database?.close();
    database = null;
    dirty = false;
    journal = [];
  };

  const totalChanges = () => {
    const row = handle().prepare("SELECT total_changes() AS n").get() as { n: number };
    return Number(row.n);
  };

  const applyEntry = (entry: JournalEntry) => {
    if (entry.params) handle().prepare(entry.sql).run(...bind(entry.params));
    else handle().exec(entry.sql);
  };

  const note = (entry: JournalEntry, before: number) => {
    if (totalChanges() === before) return;
    journal.push(entry);
    dirty = true;
  };

  const handle = () => {
    if (!database) throw new Error("Database is not open.");
    return database;
  };

  const fresh = async () => {
    let result: Awaited<ReturnType<typeof get>> = null;
    try {
      result = await get(BLOB_PATH, {
        access: "private",
        useCache: false,
        ...(etag && database ? { ifNoneMatch: etag } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/not found/i.test(message)) throw error;
    }
    if (result?.statusCode === 200 && result.stream) {
      const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
      open(bytes);
      etag = result.blob.etag;
      return;
    }
    if (result?.statusCode === 304 && database) return;
    if (!database) open();
  };

  const publish = async () => {
    if (!dirty || journal.length === 0) {
      dirty = false;
      return;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const saved = await put(BLOB_PATH, readFileSync(filename), {
          access: "private",
          addRandomSuffix: false,
          contentType: "application/vnd.sqlite3",
          ...(etag ? { ifMatch: etag } : { allowOverwrite: true }),
        });
        etag = saved.etag;
        dirty = false;
        journal = [];
        return;
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError) || attempt === 4) throw error;
        const pending = journal;
        journal = [];
        dirty = false;
        await fresh();
        for (const entry of pending) {
          const before = totalChanges();
          applyEntry(entry);
          note(entry, before);
        }
      }
    }
  };

  const write = async <T>(fn: () => T): Promise<T> => {
    if (depth > 0) return fn();
    await acquire();
    try {
      await fresh();
      const value = fn();
      await publish();
      return value;
    } catch (error) {
      discard();
      throw error;
    } finally {
      release();
    }
  };

  return {
    async begin() {
      if (depth === 0) await acquire();
      try {
        if (depth === 0) await fresh();
        depth += 1;
      } catch (error) {
        if (depth === 0) release();
        throw error;
      }
    },
    async commit() {
      if (depth === 0) return;
      depth -= 1;
      if (depth > 0) return;
      try {
        if (dirty) await publish();
      } catch (error) {
        discard();
        throw error;
      } finally {
        release();
      }
    },
    async rollback() {
      if (depth === 0) return;
      depth = 0;
      discard();
      release();
    },
    all<T extends Row>(sql: string, params: unknown[] = []) {
      return write(() => {
        const before = totalChanges();
        const rows = handle().prepare(sql).all(...bind(params)) as T[];
        note({ sql, params }, before);
        return rows;
      });
    },
    get<T extends Row>(sql: string, params: unknown[] = []) {
      return write(() => {
        const before = totalChanges();
        const row = handle().prepare(sql).get(...bind(params)) as T | undefined;
        note({ sql, params }, before);
        return row;
      });
    },
    run(sql: string, params: unknown[] = []) {
      return write(() => {
        const before = totalChanges();
        const info = handle().prepare(sql).run(...bind(params));
        note({ sql, params }, before);
        return { changes: Number(info.changes ?? 0) };
      });
    },
    exec(sql: string) {
      return write(() => {
        const before = totalChanges();
        handle().exec(sql);
        note({ sql }, before);
      });
    },
  };
}

export function sqlitePath(): string {
  if (process.env.MERIDIAN_SQLITE) return process.env.MERIDIAN_SQLITE;
  if (process.env.VERCEL) return "/tmp/meridian.sqlite";
  return join(process.cwd(), "data", "meridian.sqlite");
}

export function currentStoreKind(): StoreKind {
  if (process.env.DATABASE_URL) return "postgres";
  if (blobConfigured()) return "blob";
  if (process.env.VERCEL) return "ephemeral-sqlite";
  return "sqlite";
}

export async function openExec(): Promise<Exec> {
  const url = process.env.DATABASE_URL;
  if (url) return createNeonExec(url);
  if (blobConfigured()) return createBlobSqliteExec(sqlitePath());
  return createSqliteExec(sqlitePath());
}

export class Repository {
  constructor(private readonly db: Exec) {}

  async batch<T>(work: () => Promise<T>): Promise<T> {
    if (!this.db.begin || !this.db.commit) return work();
    await this.db.begin();
    try {
      const value = await work();
      await this.db.commit();
      return value;
    } catch (error) {
      await this.db.rollback?.();
      throw error;
    }
  }

  async migrate(): Promise<void> {
    await this.batch(async () => {
      await this.applySchema();
    });
  }

  private async applySchema(): Promise<void> {
    for (const statement of SCHEMA) await this.db.exec(statement);
    for (const statement of ADD_COLUMNS) {
      try {
        await this.db.exec(statement);
      } catch {
        // The column is already there.
      }
    }
    await this.db.exec("DELETE FROM signer");
  }

  async getMeta(key: string): Promise<string | undefined> {
    const row = await this.db.get<{ value: string }>("SELECT value FROM meta WHERE key = ?", [key]);
    return row?.value;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.db.run(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  }

  async storedPrivateKeys(): Promise<string[]> {
    const rows = await this.db.all<{ private_pem: string }>("SELECT private_pem FROM signer");
    return rows.map((row) => row.private_pem).filter((value) => value.length > 0);
  }

  async plantSigner(privatePem: string): Promise<void> {
    await this.db.run("INSERT INTO signer (id, private_pem, public_pem) VALUES (?, ?, ?)", [
      "log",
      privatePem,
      "not-a-key",
    ]);
  }

  async countPeople(): Promise<number> {
    const row = await this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM people");
    return Number(row?.n ?? 0);
  }

  async insertPerson(row: {
    id: string;
    magicName: string;
    displayName: string;
    passcodeHash: string;
    passcodeSalt: string;
    interests: string[];
    availability: string[];
    area: string;
    contactHandle: string;
    bio: string;
    shareArea: boolean;
    shareBio: boolean;
    createdAt: string;
  }): Promise<void> {
    await this.db.run(
      `INSERT INTO people
        (id, magic_name, display_name, passcode_hash, passcode_salt, interests, availability, area, contact_handle, bio, share_area, share_bio, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.magicName,
        row.displayName,
        row.passcodeHash,
        row.passcodeSalt,
        JSON.stringify(row.interests),
        JSON.stringify(row.availability),
        row.area,
        row.contactHandle,
        row.bio,
        row.shareArea ? 1 : 0,
        row.shareBio ? 1 : 0,
        row.createdAt,
      ],
    );
  }

  async credentials(magicName: string) {
    return this.db.get<{
      id: string;
      passcode_hash: string;
      passcode_salt: string;
    }>(
      "SELECT id, passcode_hash, passcode_salt FROM people WHERE magic_name = ?",
      [magicName.trim().toLowerCase()],
    );
  }

  async personRow(id: string) {
    return this.db.get<PersonRow>("SELECT * FROM people WHERE id = ?", [id]);
  }

  async listPersonRows() {
    return this.db.all<PersonRow>("SELECT * FROM people ORDER BY display_name");
  }

  async updateProfile(
    id: string,
    profile: {
      displayName: string;
      interests: string[];
      availability: string[];
      area: string;
      contactHandle: string;
      bio: string;
      shareArea: boolean;
      shareBio: boolean;
    },
  ): Promise<void> {
    await this.db.run(
      `UPDATE people SET display_name = ?, interests = ?, availability = ?, area = ?, contact_handle = ?, bio = ?, share_area = ?, share_bio = ? WHERE id = ?`,
      [
        profile.displayName,
        JSON.stringify(profile.interests),
        JSON.stringify(profile.availability),
        profile.area,
        profile.contactHandle,
        profile.bio,
        profile.shareArea ? 1 : 0,
        profile.shareBio ? 1 : 0,
        id,
      ],
    );
  }

  async insertSession(token: string, personId: string, expiresAt: string, issuedAt: string): Promise<void> {
    await this.db.run(
      "INSERT INTO sessions (token, person_id, expires_at, issued_at) VALUES (?, ?, ?, ?)",
      [token, personId, expiresAt, issuedAt],
    );
  }

  async deleteSessionsFor(personId: string): Promise<void> {
    await this.db.run("DELETE FROM sessions WHERE person_id = ?", [personId]);
  }

  async setSessionIssuedAt(token: string, issuedAt: string): Promise<void> {
    await this.db.run("UPDATE sessions SET issued_at = ? WHERE token = ?", [issuedAt, token]);
  }

  async sessionPerson(token: string, nowIso: string) {
    const record = await this.sessionRecord(token, nowIso);
    return record?.person;
  }

  async sessionRecord(token: string, nowIso: string) {
    const row = await this.db.get<{ person_id: string; expires_at: string; issued_at: string | null }>(
      "SELECT person_id, expires_at, issued_at FROM sessions WHERE token = ?",
      [token],
    );
    if (!row) return undefined;
    if (row.expires_at < nowIso) {
      await this.db.run("DELETE FROM sessions WHERE token = ?", [token]);
      return undefined;
    }
    const person = await this.personRow(row.person_id);
    if (!person) return undefined;
    return { person, expiresAt: row.expires_at, issuedAt: row.issued_at ?? row.expires_at };
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.run("DELETE FROM sessions WHERE token = ?", [token]);
  }

  async insertAgent(row: { id: string; ownerId: string; name: string; blurb: string }) {
    await this.db.run("INSERT INTO agents (id, owner_id, name, blurb) VALUES (?, ?, ?, ?)", [
      row.id,
      row.ownerId,
      row.name,
      row.blurb,
    ]);
  }

  async agentsFor(ownerId: string) {
    return this.db.all<AgentRow>("SELECT * FROM agents WHERE owner_id = ? ORDER BY name", [ownerId]);
  }

  async agent(id: string) {
    return this.db.get<AgentRow>("SELECT * FROM agents WHERE id = ?", [id]);
  }

  async insertPlan(row: {
    id: string;
    hostId: string;
    title: string;
    kind: string;
    whenLabel: string;
    placeLabel: string;
    note: string;
    status: string;
    createdAt: string;
  }) {
    await this.db.run(
      `INSERT INTO plans (id, host_id, title, kind, when_label, place_label, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.hostId,
        row.title,
        row.kind,
        row.whenLabel,
        row.placeLabel,
        row.note,
        row.status,
        row.createdAt,
      ],
    );
  }

  async plan(id: string) {
    return this.db.get<PlanRow>("SELECT * FROM plans WHERE id = ?", [id]);
  }

  async plansFor(personId: string) {
    return this.db.all<PlanRow>(
      `SELECT * FROM plans WHERE host_id = ?
       UNION
       SELECT p.* FROM plans p JOIN invitations i ON i.plan_id = p.id WHERE i.invitee_id = ?
       ORDER BY created_at DESC`,
      [personId, personId],
    );
  }

  async setPlanStatus(id: string, status: string) {
    await this.db.run("UPDATE plans SET status = ? WHERE id = ?", [status, id]);
  }

  async insertInvitation(row: { id: string; planId: string; inviteeId: string; status: string; createdAt: string }) {
    await this.db.run(
      "INSERT INTO invitations (id, plan_id, invitee_id, status, created_at) VALUES (?, ?, ?, ?, ?)",
      [row.id, row.planId, row.inviteeId, row.status, row.createdAt],
    );
  }

  async invitationsForPlan(planId: string) {
    return this.db.all<InviteRow>("SELECT * FROM invitations WHERE plan_id = ?", [planId]);
  }

  async invitation(planId: string, inviteeId: string) {
    return this.db.get<InviteRow>(
      "SELECT * FROM invitations WHERE plan_id = ? AND invitee_id = ?",
      [planId, inviteeId],
    );
  }

  async setInvitationStatus(id: string, status: string) {
    const rows = await this.db.all<{ id: string }>(
      "UPDATE invitations SET status = ? WHERE id = ? AND status = 'invited' RETURNING id",
      [status, id],
    );
    return rows.length;
  }

  async insertPermission(row: {
    id: string;
    grantorId: string;
    granteeKind: string;
    granteeId: string;
    scope: string;
    resourceId: string;
    status: string;
    createdAt: string;
  }) {
    await this.db.run(
      `INSERT INTO permissions
        (id, grantor_id, grantee_kind, grantee_id, scope, resource_id, status, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        row.id,
        row.grantorId,
        row.granteeKind,
        row.granteeId,
        row.scope,
        row.resourceId,
        row.status,
        row.createdAt,
      ],
    );
  }

  async activePermission(input: {
    grantorId: string;
    granteeKind: string;
    granteeId: string;
    scope: string;
    resourceId: string;
  }) {
    return this.db.get<PermissionRow>(
      `SELECT * FROM permissions
       WHERE grantor_id = ? AND grantee_kind = ? AND grantee_id = ? AND scope = ? AND resource_id = ? AND status = 'active'
       LIMIT 1`,
      [input.grantorId, input.granteeKind, input.granteeId, input.scope, input.resourceId],
    );
  }

  async permissionsForGrantor(grantorId: string) {
    return this.db.all<PermissionRow>(
      "SELECT * FROM permissions WHERE grantor_id = ? ORDER BY created_at DESC",
      [grantorId],
    );
  }

  async permissionsForResource(resourceId: string, scope: string) {
    return this.db.all<PermissionRow>(
      "SELECT * FROM permissions WHERE resource_id = ? AND scope = ?",
      [resourceId, scope],
    );
  }

  async permission(id: string) {
    return this.db.get<PermissionRow>("SELECT * FROM permissions WHERE id = ?", [id]);
  }

  async revokePermission(id: string, grantorId: string, revokedAt: string) {
    const rows = await this.db.all<{ id: string }>(
      `UPDATE permissions SET status = 'revoked', revoked_at = ?
       WHERE id = ? AND grantor_id = ? AND status = 'active'
       RETURNING id`,
      [revokedAt, id, grantorId],
    );
    return rows.length;
  }

  async insertFeedback(row: {
    id: string;
    planId: string;
    authorId: string;
    enjoyment: string;
    keepNote: string;
    again: string;
    createdAt: string;
  }) {
    await this.db.run(
      `INSERT INTO feedback (id, plan_id, author_id, enjoyment, keep_note, again, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.planId, row.authorId, row.enjoyment, row.keepNote, row.again, row.createdAt],
    );
  }

  async feedback(planId: string, authorId: string) {
    return this.db.get<FeedbackRow>(
      "SELECT * FROM feedback WHERE plan_id = ? AND author_id = ?",
      [planId, authorId],
    );
  }

  async insertAudit(row: {
    id: string;
    actorId: string;
    action: string;
    granteeId: string;
    scope: string;
    resourceId: string;
    payload: string;
    signature: string;
    publicKey: string;
    createdAt: string;
    seq: number;
    prevHash: string;
  }) {
    await this.db.run(
      `INSERT INTO audit_events
        (id, actor_id, action, grantee_id, scope, resource_id, payload, signature, public_key, created_at, seq, prev_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.actorId,
        row.action,
        row.granteeId,
        row.scope,
        row.resourceId,
        row.payload,
        row.signature,
        row.publicKey,
        row.createdAt,
        row.seq,
        row.prevHash,
      ],
    );
  }

  async latestAudit() {
    return this.db.get<AuditRow>("SELECT * FROM audit_events WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1");
  }

  async auditChain() {
    // SQLite sorts NULL seq first. Numbered receipts stay in order; unnumbered ones follow.
    return this.db.all<AuditRow>(
      "SELECT * FROM audit_events ORDER BY CASE WHEN seq IS NULL THEN 1 ELSE 0 END, seq ASC",
    );
  }

  async rateBucket(bucket: string) {
    return this.db.get<{ hits: number; window_start: string }>(
      "SELECT hits, window_start FROM rate_limits WHERE bucket = ?",
      [bucket],
    );
  }

  async setRateBucket(bucket: string, hits: number, windowStart: string): Promise<void> {
    await this.db.run(
      `INSERT INTO rate_limits (bucket, hits, window_start) VALUES (?, ?, ?)
       ON CONFLICT(bucket) DO UPDATE SET hits = excluded.hits, window_start = excluded.window_start`,
      [bucket, hits, windowStart],
    );
  }

  async auditFor(personId: string) {
    const agents = await this.agentsFor(personId);
    const ids = [personId, ...agents.map((agent) => agent.id)];
    const marks = ids.map(() => "?").join(", ");
    return this.db.all<AuditRow>(
      `SELECT * FROM audit_events
       WHERE actor_id = ? OR grantee_id IN (${marks})
       ORDER BY created_at DESC`,
      [personId, ...ids],
    );
  }

  async clearDemoData(): Promise<void> {
    await this.batch(async () => {
      for (const table of [
        "audit_events",
        "feedback",
        "permissions",
        "invitations",
        "plans",
        "sessions",
        "agents",
        "people",
        "rate_limits",
      ]) {
        await this.db.exec(`DELETE FROM ${table}`);
      }
      await this.db.run("DELETE FROM meta WHERE key = ?", ["seed_version"]);
    });
  }
}

export type PersonRow = {
  id: string;
  magic_name: string;
  display_name: string;
  passcode_hash: string;
  passcode_salt: string;
  interests: string;
  availability: string;
  area: string;
  contact_handle: string;
  bio: string;
  share_area: number;
  share_bio: number;
  created_at: string;
};

export type AgentRow = { id: string; owner_id: string; name: string; blurb: string };

export type PlanRow = {
  id: string;
  host_id: string;
  title: string;
  kind: string;
  when_label: string;
  place_label: string;
  note: string;
  status: string;
  created_at: string;
};

export type InviteRow = {
  id: string;
  plan_id: string;
  invitee_id: string;
  status: string;
  created_at: string;
};

export type PermissionRow = {
  id: string;
  grantor_id: string;
  grantee_kind: string;
  grantee_id: string;
  scope: string;
  resource_id: string;
  status: string;
  created_at: string;
  revoked_at: string | null;
};

export type FeedbackRow = {
  id: string;
  plan_id: string;
  author_id: string;
  enjoyment: string;
  keep_note: string;
  again: string;
  created_at: string;
};

export type AuditRow = {
  id: string;
  actor_id: string;
  action: string;
  grantee_id: string;
  scope: string;
  resource_id: string;
  payload: string;
  signature: string;
  public_key: string;
  created_at: string;
  seq: number | null;
  prev_hash: string | null;
};

const globalStore = globalThis as unknown as { __meridianRepo?: Promise<Repository> };

export async function openSqliteRepository(filename: string): Promise<Repository> {
  const repo = new Repository(createSqliteExec(filename));
  await repo.migrate();
  return repo;
}

export function getRepository(): Promise<Repository> {
  if (!globalStore.__meridianRepo) {
    globalStore.__meridianRepo = openExec().then(async (exec) => {
      const repo = new Repository(exec);
      await repo.migrate();
      return repo;
    });
  }
  return globalStore.__meridianRepo;
}
