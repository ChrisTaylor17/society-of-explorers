// Current handler composition opts in to the additive listing contract. The
// historical fixture modules and their source-bound evidence remain unchanged.
import { createListingReceiptDb } from './circle-listing-receipt-db.mjs';
import { reviewCoverageApp } from './review-coverage-app.mjs';
import { IDS } from './moderation-db.mjs';
export { IDS };
export const listingReceiptAppCleanup = { created: 0, closed: 0 };
export async function listingReceiptApp(options = {}) {
  const f = await createListingReceiptDb(options);
  listingReceiptAppCleanup.created++;
  try {
    const app = await reviewCoverageApp({ fixture: f }); let closed = false;
    return { ...app, async close() { if (closed) return; closed = true; await app.close(); await f.db.close(); listingReceiptAppCleanup.closed++; } };
  } catch (error) { await f.db.close(); listingReceiptAppCleanup.closed++; throw error; }
}
export async function moderationReceiptApp() {
  const f = await listingReceiptApp();
  try {
    await f.db.query("INSERT INTO members(id,display_name) VALUES($1,'Synthetic second reporter') ON CONFLICT(id) DO NOTHING", [IDS.reporter2]);
    const routes = { report: f.app.load('app/api/circles/report/route.ts'), queue: f.routes.listingQueue,
      detail: f.routes.listingDetail, hosts: f.app.load('app/api/circles/review/route.ts') };
    const request = (body, path = '/api/circles/report', headers = {}) => f.app.fakes.makeReq(body,
      { url: 'https://offline.invalid' + path, headers: { origin: 'https://offline.invalid', ...headers } });
    return { ...f, routes, request, context: { params: Promise.resolve({ circleId: f.circleId }) } };
  } catch (error) { await f.close(); throw error; }
}
