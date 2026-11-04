import { DatabaseSync } from "node:sqlite";
import { closeSync, lstatSync, openSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { MAX_REPORTS_PER_PERSON, REPORT_CATEGORIES, REPORT_RECEIPT, validReportText } from "./reports.js";

const APPLICATION_ID = 0x534f4531; // SOE1; never adopt an unrelated SQLite database.
const SCHEMA_VERSION = 2;
const COLLECTIONS = ["people", "sessions", "plans", "invitations", "grants", "blocks", "idempotency"];
const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
const text = x => typeof x === "string" && x.length > 0;
const version = x => Number.isSafeInteger(x) && x >= 1;
const timestamp = x => text(x) && Number.isFinite(Date.parse(x));
const nullableTime = x => x === null || timestamp(x);
const strings = x => Array.isArray(x) && x.every(text);
function requireState(ok) { if (!ok) throw new Error("Invalid durable synthetic state; refusing to reseed or serve it."); }

/** Both checkpoint versions retain the fixed three-person/one-plan fixture. */
function validateCheckpoint(state, format, privacy = false) {
  requireState(object(state) && state.format === format && state.fixture === (privacy ? "soe-four-person-one-plan-queue-v1" : "soe-three-person-one-plan-v1") && Number.isSafeInteger(state.grantSerial) && state.grantSerial >= 0);
  requireState(Object.keys(state).length === (format === 2 ? 11 : 10));
  const maps = {};
  if (format === 1) requireState(!Object.hasOwn(state, "reports"));
  for (const name of format === 2 ? [...COLLECTIONS, "reports"] : COLLECTIONS) {
    requireState(Array.isArray(state[name]));
    const rows = state[name];
    requireState(rows.every(row => Array.isArray(row) && row.length === 2 && text(row[0]) && object(row[1])));
    maps[name] = new Map(rows);
    requireState(maps[name].size === rows.length);
  }
  const { people, sessions, plans, invitations, grants, blocks, idempotency } = maps;
  const reports = maps.reports ?? new Map();
  requireState(people.size === (privacy ? 4 : 3) && (privacy ? ["ada", "jules", "mina", "rhea"] : ["ada", "jules", "mina"]).every(id => people.has(id)));
  for (const [key, p] of people) {
    requireState(key === p.id && p.magicName === key && text(p.displayName) && text(p.relay) && /^relay:/.test(p.relay) && strings(p.interests) && strings(p.availability) && /^[a-f0-9]{64}$/.test(p.passcodeHash) && /^[a-f0-9]{32}$/.test(p.passcodeSalt) && nullableTime(p.deletedAt));
  }
  requireState(plans.size === 1 && plans.has("plan-riverside"));
  for (const [key, p] of plans) {
    requireState(key === p.id && p.hostId === "ada" && version(p.version) && typeof p.closed === "boolean" && ["title", "kindLabel", "whenLabel", "placeLabel"].every(k => text(p[k])));
  }
  for (const [key, s] of sessions) requireState(/^[a-f0-9]{64}$/.test(key) && people.has(s.personId) && timestamp(s.expiresAt) && timestamp(s.issuedAt));
  for (const [key, b] of blocks) requireState(people.has(b.blockerId) && people.has(b.blockedId) && b.blockerId !== b.blockedId && key === `${b.blockerId}\u0000${b.blockedId}` && timestamp(b.createdAt));
  const blocked = (a,b) => blocks.has(`${a}\u0000${b}`) || blocks.has(`${b}\u0000${a}`);
  let maxGrant = 0;
  for (const [key, g] of grants) {
    requireState(/^grant-[1-9][0-9]*$/.test(key) && key === g.id && people.has(g.grantorId) && people.has(g.granteeId) && g.grantorId !== g.granteeId && g.scope === "contact" && plans.has(g.resourceId) && ["active", "revoked"].includes(g.status) && nullableTime(g.revokedAt));
    requireState(g.status !== "active" || (!blocked(g.grantorId, g.granteeId) && !people.get(g.grantorId).deletedAt && g.revokedAt === null));
    maxGrant = Math.max(maxGrant, Number(key.slice(6)));
  }
  requireState(Number.isSafeInteger(maxGrant) && state.grantSerial >= maxGrant);
  for (const [key, i] of invitations) {
    requireState(key === i.id && plans.has(i.planId) && people.has(i.requesterId) && ["invited", "accepted", "declined", "withdrawn"].includes(i.status) && typeof i.wasVisible === "boolean");
    requireState(!["invited", "accepted"].includes(i.status) || !blocked(plans.get(i.planId).hostId, i.requesterId));
  }
  const reportCounts = new Map();
  for (const [key, report] of reports) {
    requireState(Object.keys(report).length === 7 && /^report-[a-f0-9]{32}$/.test(key) && report.id === key && people.has(report.reporterId) && people.has(report.subjectId) && report.reporterId !== report.subjectId && REPORT_CATEGORIES.includes(report.category) && validReportText(report.details) && report.details === report.details.trim() && (report.planId === null || plans.has(report.planId)) && timestamp(report.submittedAt));
    reportCounts.set(report.reporterId, (reportCounts.get(report.reporterId) ?? 0) + 1);
  }
  requireState([...reportCounts.values()].every(count => count <= MAX_REPORTS_PER_PERSON));
  const reportReceipts = new Set();
  const highest = Math.max(...[...plans.values()].map(p => p.version));
  for (const [key, row] of idempotency) {
    const parts = key.split("\u0000");
    requireState(people.has(parts[0]) && (format === 2 ? ["join", "leave", "accept", "grant", "revoke", "delete-account", "block", "report"] : ["join", "accept", "grant", "revoke", "delete-account", "block"]).includes(parts[1]) && parts.slice(2).join("\u0000").length > 0 && /^[a-f0-9]{64}$/.test(row.payloadHash) && object(row.result) && row.result.status === "committed" && version(row.result.version) && row.result.version <= highest && object(row.result.data));
    if (parts[1] === "leave") {
      const data = row.result.data, invite = invitations.get(data.invitationId);
      requireState(Object.keys(data).length === 5 && data.operation === "leave" && plans.has(data.planId) && invite?.planId === data.planId && invite.requesterId === parts[0] && invite.status === "withdrawn" && ["withdrawn", "left"].includes(data.outcome) && text(data.limit));
    }
    if (parts[1] === "report") {
      const data = row.result.data, report = reports.get(data.reportId);
      requireState(report && report.reporterId === parts[0] && data.submitted === true && data.notice === REPORT_RECEIPT && Object.keys(data).length === 3 && !reportReceipts.has(data.reportId));
      reportReceipts.add(data.reportId);
    }
  }
  requireState(reportReceipts.size === reports.size);
  return state;
}
export function validateState(state) { return validateCheckpoint(state, 2); }
// Only the explicit v4 store uses this fixed, separately identified fixture.
export function validatePrivacyBaseState(state) { return validateCheckpoint(state, 2, true); }
function parseCheckpoint(value) {
  try { return JSON.parse(value); }
  catch { throw new Error("Invalid durable checkpoint JSON; contents are not logged."); }
}
function createTable(db) {
  db.exec("CREATE TABLE soe_state (id INTEGER PRIMARY KEY CHECK(id=1), format_version INTEGER NOT NULL CHECK(format_version=2), state_json TEXT NOT NULL) STRICT");
}

/** A single SQLite row is a transactionally consistent checkpoint of this small world. */
export function openStateStore(databasePath, initialState, testHooks = {}, migrateFrom1 = false) {
  if (typeof databasePath !== "string" || !isAbsolute(databasePath)) throw new Error("Durable storage requires an explicit absolute databasePath.");
  const directory = lstatSync(dirname(databasePath));
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o022) !== 0) throw new Error("Durable database needs a trusted directory that is not group/world writable.");
  let created = false;
  try { const fd = openSync(databasePath, "wx", 0o600); closeSync(fd); created = true; }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const file = lstatSync(databasePath);
  if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) !== 0) throw new Error("Durable database must be a regular owner-only file, not a symlink.");
  const db = new DatabaseSync(databasePath);
  let closed = false;
  function rollback() { try { db.exec("ROLLBACK"); } catch {} }
  try {
    db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON");
    // Establish identity and seed atomically, including with concurrent openers.
    db.exec("BEGIN IMMEDIATE");
    const application = db.prepare("PRAGMA application_id").get().application_id;
    const schema = db.prepare("PRAGMA user_version").get().user_version;
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
    if (application === 0 && schema === 0 && tables.length === 0 && created) {
      validateState(initialState);
      db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${SCHEMA_VERSION}`);
      createTable(db);
      db.prepare("INSERT INTO soe_state(id,format_version,state_json) VALUES(1,2,?)").run(JSON.stringify(initialState));
    } else if (application === APPLICATION_ID && schema === 1 && migrateFrom1) {
      const legacy = db.prepare("SELECT id,format_version,state_json FROM soe_state").all();
      if (legacy.length !== 1 || legacy[0].id !== 1 || legacy[0].format_version !== 1) throw new Error("Invalid legacy checkpoint; no migration performed.");
      const state = validateCheckpoint(parseCheckpoint(legacy[0].state_json), 1);
      const upgraded = validateState({ ...state, format: 2, reports: [] });
      db.exec("ALTER TABLE soe_state RENAME TO soe_state_v1_migration");
      createTable(db);
      db.prepare("INSERT INTO soe_state(id,format_version,state_json) VALUES(1,2,?)").run(JSON.stringify(upgraded));
      db.exec("DROP TABLE soe_state_v1_migration; PRAGMA user_version=2");
    } else if (application !== APPLICATION_ID || schema !== SCHEMA_VERSION) {
      throw new Error("Unsupported or unrelated durable database; no automatic migration or reseed.");
    }
    const rows = db.prepare("SELECT id,format_version,state_json FROM soe_state").all();
    if (rows.length !== 1 || rows[0].id !== 1 || rows[0].format_version !== 2) throw new Error("Missing durable checkpoint; refusing to reseed.");
    validateState(parseCheckpoint(rows[0].state_json));
    db.exec("COMMIT");
    // Rollback journals keep a process crash from exposing partial block/grant/receipt state.
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON");
  } catch (error) { rollback(); db.close(); throw error; }
  const read = db.prepare("SELECT state_json FROM soe_state WHERE id=1");
  const write = db.prepare("UPDATE soe_state SET state_json=? WHERE id=1");
  return {
    transaction(run) {
      if (closed) throw new Error("Durable storage is closed.");
      let active = false;
      try {
        db.exec("BEGIN IMMEDIATE"); active = true;
        const row = read.get();
        if (!row) throw new Error("Missing durable checkpoint; refusing to reseed.");
        const before = validateState(parseCheckpoint(row.state_json));
        const { state, result } = run(before);
        validateState(state);
        const serialized = JSON.stringify(state);
        if (serialized !== row.state_json) write.run(serialized);
        testHooks.beforeCommit?.();
        db.exec("COMMIT"); active = false;
        testHooks.afterCommit?.();
        return result;
      } catch (error) { if (active) rollback(); throw error; }
    },
    close() { if (!closed) { db.close(); closed = true; } },
  };
}

/** Explicit offline migration only; normal startup never opts into this path. */
export function migrateReportStorage(databasePath) {
  lstatSync(databasePath); // Require an existing file, never seed on migration.
  const store = openStateStore(databasePath, undefined, {}, true);
  store.close();
  return { schemaVersion: 2, checkpointFormat: 2 };
}
