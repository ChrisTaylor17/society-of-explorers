import { passagePostApp, IDS } from './passage-post-app.mjs';
import { requestId, rpc } from './message-db.mjs';
export { IDS, requestId };

// Actual TypeScript routes and actual disposable SQL. Authentication and the
// PostgREST boundary are synthetic; no provider, live account or project exists.
export async function threadApp() {
  const base = await passagePostApp();
  let actor = IDS.reader, displayName = 'Synthetic Explorer', identities = null;
  base.app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: async () => {
    const current = identities?.length ? identities.shift() : actor;
    return current ? { memberId: current, member: { id: current, display_name: displayName } } : null;
  } }));
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
    const match = /^\/api\/circles\/([^/]+)\/discussion(\/preview)?$/.exec(url.pathname);
    if (!match) return base.dispatch(path, method, body, headers);
    const file = `app/api/circles/[circleId]/discussion/${match[2] ? 'preview/' : ''}route.ts`;
    return route(file)[method](base.request(body, url.pathname + url.search, headers), { params: Promise.resolve({ circleId: match[1] }) });
  }
  async function dispatchRequest(request) {
    const match = /^\/api\/circles\/([^/]+)\/discussion(\/preview)?$/.exec(new URL(request.url).pathname);
    if (!match) throw Error('Unexpected synthetic Request path');
    const file = `app/api/circles/[circleId]/discussion/${match[2] ? 'preview/' : ''}route.ts`;
    return route(file)[request.method](request, { params: Promise.resolve({ circleId: match[1] }) });
  }
  async function seedArchive(count = 105) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 200) throw Error('Bounded synthetic archive only');
    const result = await base.db.query(`INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content,created_at)
      SELECT ('f1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,$1,$2,'Synthetic archive author','Synthetic archive entry '||i,
      timestamptz '2030-01-01 00:00:00+00' FROM generate_series(1,$3::int) i RETURNING id`, [IDS.circle, IDS.author, count]);
    return result.rows.map(row => row.id);
  }
  async function seedReply(parentMessageId, comment = 'Synthetic seeded reply context.') {
    const preview = await dispatch(`/api/circles/${IDS.circle}/discussion/preview`, 'POST', { requestId: requestId(), comment, parentMessageId });
    if (preview.status !== 200) throw Error('Synthetic reply preview refused');
    const value = await preview.json();
    const result = await dispatch(`/api/circles/${IDS.circle}/discussion`, 'POST', {
      requestId: value.requestId, comment: value.comment, parentMessageId: value.parentMessageId,
      expectedParentRevision: value.parent?.revision ?? null, expectedParentHash: value.parent?.contentHash ?? null,
      contentHash: value.contentHash, reviewKey: value.reviewKey,
    });
    if (result.status !== 200) throw Error('Synthetic reply seed refused');
    return (await result.json()).message;
  }
  async function seedThreadReplies(parentMessageId, count = 30) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 60 || !actor) throw Error('Bounded synthetic reply seed only');
    const format = base.app.load('lib/circles/thread.ts').formatDiscussionContent;
    const target = await rpc(base.db, 'soe_circle_discussion_target', [actor, IDS.circle, parentMessageId]);
    const messages = [];
    // Explicit fixture setup bypasses HTTP budgets, never SQL authorization,
    // graph guards or receipt transactions. Browser actions remain separate.
    for (let index = 0; index < count; index++) {
      const content = format(IDS.circle, `Synthetic seeded thread reply ${index + 1}.`, parentMessageId);
      const saved = await rpc(base.db, 'soe_circle_discussion_post', [actor, IDS.circle, requestId(), content,
        parentMessageId, target.target.revision, target.target.contentHash, 'Synthetic seed author']);
      messages.push(saved.message);
    }
    return messages;
  }
  return { ...base, dispatch, dispatchRequest, seedArchive, seedReply, seedThreadReplies,
    transformRpc: value => { transform = value; },
    setActor: value => { actor = value; identities = null; base.setActor(value); },
    setDisplayName: value => { displayName = value; base.setDisplayName(value); },
    setIdentitySequence: value => { identities = [...value]; } };
}
