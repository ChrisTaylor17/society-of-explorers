import { readFile } from 'node:fs/promises';
import { createDb as participationDb } from './participation-db.mjs';
export { IDS, rpc, asRole, requestId, createCircle, participate } from './participation-db.mjs';
export { messageState, messageAction, messageDecide } from './message-db.mjs';
import { IDS, rpc, requestId } from './participation-db.mjs';

export const PASSAGE_SQL = await readFile(new URL('../../../../docs/sql/circle-passage-posts.sql', import.meta.url), 'utf8');
export const EDITIONS = JSON.parse(await readFile(new URL('../../../../lib/circles/reading-program-editions.json', import.meta.url), 'utf8'));
export const CANONICAL = 'A fictional human comment.\n\nFictional source excerpt used only for SQL isolation tests.\nSource: synthetic fixture credits and edition locator.';
export const createBaseDb = participationDb;
export async function createDb() {
  const db = await participationDb();
  try { await db.exec(PASSAGE_SQL); return db; }
  catch (error) { await db.close(); throw error; }
}
export function reference(bookId = 'apology', overrides = {}) {
  const edition = EDITIONS.find(item => item.bookId === bookId);
  if (!edition) throw Error('Unknown fictional test edition');
  return { version: 1, bookId, editionId: edition.editionId, blockIndex: 0, start: 0, end: 24, ...overrides };
}
export function access(db, { actor = IDS.author, circle = IDS.circle } = {}) {
  return rpc(db, 'soe_circle_passage_access', [actor, circle]);
}
export function post(db, { actor = IDS.author, circle = IDS.circle, key = requestId(), content = CANONICAL, ref = reference(), name = 'Fictional Author' } = {}) {
  return rpc(db, 'soe_circle_passage_post', [actor, circle, key, content, ref, name]);
}
export function receipt(db, { actor = IDS.author, circle = IDS.circle, key } = {}) {
  return rpc(db, 'soe_circle_passage_receipt', [actor, circle, key]);
}
