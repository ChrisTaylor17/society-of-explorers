// Additive successor over the preserved historical consent/allowance fixture.
import { createHash } from 'node:crypto';
import { allowanceSource } from './message-ai-allowance-db.mjs';
await allowanceSource('verification/web/tests/support/message-ai-allowance-db.mjs');
const base = await import('./message-ai-allowance-db.mjs');
export const { IDS, rpc, asRole, requestId, POLICY, CONTENT, activateAllowance, reserveAllowance } = base;
export const INTENT_SQL = ['preflight', 'apply', 'rollback'].map(action => `docs/sql/circle-message-ai-consent-intent-${action}.sql`);
export async function consentIntentSourceHashes() {
 const hashes = { ...base.ALLOWANCE_SOURCE_HASHES };
 for (const name of [...INTENT_SQL, 'verification/web/tests/support/message-ai-consent-intent-db.mjs']) hashes[name] = createHash('sha256').update(await allowanceSource(name)).digest('hex');
 return hashes;
}
export async function runConsentIntentSql(db, action = 'apply') {
 if (!['preflight', 'apply', 'rollback'].includes(action)) throw Error('Unknown consent candidate');
 try { return await db.exec((await allowanceSource(`docs/sql/circle-message-ai-consent-intent-${action}.sql`)).toString()); }
 catch (error) { await db.exec('ROLLBACK'); throw error; }
}
export async function createConsentIntentDb({ install = true } = {}) {
 const f = await base.createMessageAiAllowanceDb();
 try { if (install) { await runConsentIntentSql(f.db, 'preflight'); await runConsentIntentSql(f.db); } return f; }
 catch (error) { await f.db.close(); throw error; }
}
