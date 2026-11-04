import { readFile } from 'node:fs/promises';
import { createDb as participationDb, asRole } from './participation-db.mjs';
export { IDS, rpc, asRole, requestId, creationInput, createCircle, participate, detail, ROOT } from './participation-db.mjs';

export const EDITIONS = JSON.parse(await readFile(new URL('../../../../lib/circles/reading-program-editions.json', import.meta.url), 'utf8'));
export async function createDb() {
  return participationDb();
}
export function program(bookId = 'republic', sessions = [{ from: 0, to: 10 }]) {
  const edition = EDITIONS.find(item => item.bookId === bookId);
  if (!edition) throw Error('Unknown fixture edition');
  return { version: 1, bookId, editionId: edition.editionId, sessions: sessions.map(item => ({ ...item })) };
}
export async function readingSql(db, name, args = [], role = 'service_role') {
  if (!['_soe_circle_reading_editions', '_soe_circle_reading_program_valid', '_soe_circle_reading_program_length'].includes(name)) throw Error('Unexpected reading helper');
  return asRole(db, role, async tx => {
    const result = await tx.query(`SELECT public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS result`, args);
    return result.rows.map(row => row.result);
  });
}
