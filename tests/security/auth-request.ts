// Explicit synthetic browser choice for tests that exercise authenticated
// cookie/SIWE flows. Anonymous and bearer fixtures keep their own requests.
import { makeReq } from './fakes';
export const TEST_AUTH_INTENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export function selectedCookies(provider: 'supabase' | 'wallet', subject: string) {
  return { soe_auth_intent: TEST_AUTH_INTENT, soe_auth_provider: provider,
    soe_auth_selection_v1: `v1.${TEST_AUTH_INTENT}.${provider}.${subject}` };
}
export function signInReq(body: Record<string, unknown> | undefined, options: Parameters<typeof makeReq>[1] = {}) {
  const payload = body === undefined ? undefined : { ...body, intent: TEST_AUTH_INTENT };
  const req = makeReq(payload, { ...options, cookies: { soe_auth_intent: TEST_AUTH_INTENT, ...options.cookies },
    headers: { 'x-soe-auth-intent': TEST_AUTH_INTENT, ...(payload === undefined ? {} : { 'content-type': 'application/json' }), ...options.headers } });
  if (payload !== undefined) req.body = new Request(req.url, { method: 'POST', body: JSON.stringify(payload) }).body;
  return req;
}
