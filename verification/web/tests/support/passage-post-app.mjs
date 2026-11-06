import { participationApp, IDS } from './participation-app.mjs';
export { IDS };

// Actual TypeScript handlers, edition resolver and disposable SQL. Only server
// identity and the PostgREST boundary are fixtures; no SDK/provider is imported.
export async function passagePostApp() {
  const base = await participationApp();
  base.setActor(IDS.reader);
  let actor = IDS.reader, displayName = 'Synthetic Explorer';
  base.app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: async () => actor
    ? { memberId: actor, member: { id: actor, display_name: displayName } } : null }));
  const cache = new Map();
  let transform = null;
  const originalRpc = base.admin.rpc;
  base.admin.rpc = async (name, args) => {
    const result = await originalRpc(name, args);
    return transform ? await transform(name, args, result) : result;
  };
  const route = file => {
    if (!cache.has(file)) cache.set(file, base.app.load(file));
    return cache.get(file);
  };
  async function dispatch(path, method = 'GET', body, headers = {}) {
    const url = new URL(path, 'https://offline.invalid');
    const match = /^\/api\/circles\/([^/]+)\/passages(\/preview)?$/.exec(url.pathname);
    if (!match) return base.dispatch(path, method, body, headers);
    const file = `app/api/circles/[circleId]/passages/${match[2] ? 'preview/' : ''}route.ts`;
    return route(file)[method](base.request(body, url.pathname + url.search, headers), { params: Promise.resolve({ circleId: match[1] }) });
  }
  async function dispatchRequest(request) {
    const match = /^\/api\/circles\/([^/]+)\/passages(\/preview)?$/.exec(new URL(request.url).pathname);
    if (!match) throw Error('Unexpected synthetic Request path');
    const file = `app/api/circles/[circleId]/passages/${match[2] ? 'preview/' : ''}route.ts`;
    return route(file)[request.method](request, { params: Promise.resolve({ circleId: match[1] }) });
  }
  return { ...base, dispatch, dispatchRequest, transformRpc: value => { transform = value; },
    setActor: value => { actor = value; base.setActor(value); }, setDisplayName: value => { displayName = value; } };
}
