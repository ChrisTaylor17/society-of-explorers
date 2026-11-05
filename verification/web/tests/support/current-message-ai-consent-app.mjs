// Current publication-aware Circle SQL and actual consent/contribution handlers.
// The inherited messageAiApp actor and provider adapters are explicitly synthetic.
// No provider allowance is activated by default; no provider operation is real.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { allowanceSource } from './message-ai-allowance-db.mjs';
for (const name of ['public-profile-app.mjs', 'message-ai-app.mjs', 'message-ai-consent-intent-db.mjs']) await allowanceSource('verification/web/tests/support/' + name);
const { createPublicProfileApp, publicProfileAppHashes } = await import('./public-profile-app.mjs');
const { messageAiApp } = await import('./message-ai-app.mjs');
const { consentIntentSourceHashes, runConsentIntentSql, CONTENT, IDS, activateAllowance } = await import('./message-ai-consent-intent-db.mjs');
export { CONTENT, IDS };
export async function currentConsentSourceHashes() {
 const hashes = { ...await publicProfileAppHashes(), ...await consentIntentSourceHashes() };
 for (const name of ['verification/web/tests/support/current-message-ai-consent-app.mjs', 'verification/web/tests/support/message-ai-app.mjs', 'app/api/circles/contributions/route.ts', 'app/api/circles/[circleId]/messages/[messageId]/ai-consent/route.ts', 'lib/circles/message-ai-consent.ts', 'lib/circles/message-moderation-server.ts']) hashes[name] = createHash('sha256').update(await allowanceSource(name)).digest('hex');
 return hashes;
}
export async function currentMessageAiApp({ allowance = null } = {}) {
 const f = await createPublicProfileApp();
 try {
  // The current coverage/publication chain already installed original consent
  // and allowance. Never reinstall or alter those historical migrations.
  assert.equal((await f.db.query("SELECT to_regclass('public.circle_message_ai_allowance')::text AS name")).rows[0].name, 'circle_message_ai_allowance');
  await runConsentIntentSql(f.db, 'preflight'); await runConsentIntentSql(f.db);
  const circleId = await f.seedCircle({ title: 'Synthetic current consent Circle', reading: false });
  await f.join(circleId);
  const message = await f.post({ circleId, content: CONTENT });
  const api = await messageAiApp({ fixture: { ...f, circleId, messageId: message.id, circle: circleId, message: message.id, author: f.authorId }, allowance: null });
  if (allowance) await activateAllowance(f.db, allowance);
  api.setActor(f.actors.other);
  const current = await (await api.dispatch(api.messagePath)).json();
  const reported = await api.dispatch(api.messagePath, 'POST', { action: 'report', expectedRevision: current.revision, contentHash: current.contentHash, requestId: crypto.randomUUID(), reason: 'safety', note: 'PRIVATE_REPORT_NOTE: synthetic human review allegation.' });
  assert.equal(reported.status, 200, 'Actual current message state and report must seed successfully');
  api.setActor(f.authorId);
  return { ...api, close: () => f.close() };
 } catch (error) { await f.close(); throw error; }
}
