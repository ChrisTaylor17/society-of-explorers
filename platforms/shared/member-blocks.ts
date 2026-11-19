import { isUuid } from '../../lib/ids/uuid';
import {
  DIRECT_MESSAGE_OWNER_HEADER, MEMBER_BLOCKS_PATH, parseDirectMessageBlockReceipt, parseMemberBlockPage, parseMemberUnblockInput,
  type DirectMessageBlock, type DirectMessageBlockPage, type MemberUnblockInput,
} from '../../lib/members/direct-message';
import { approvedOrigin, circleAuthorizationHeaders, hasCircleAuthority, type CircleOwner, type CircleTransport } from '../native/src/circles/host';

type Config = {
  owner: CircleOwner; origin: string; transport: CircleTransport; memberId?: string;
  timeoutMs?: number; initialOnline?: boolean; newRequestId?: () => Promise<string>;
};
export type MemberBlocksModel = {
  active: boolean; connected: boolean; online: boolean; busy: boolean; page: DirectMessageBlockPage | null;
  review: DirectMessageBlock | null; message: string; canLoad: boolean; canNext: boolean; canReview: boolean;
  canUnblock: boolean; canRetry: boolean;
};
type Reply = { status: number; value: unknown };
type Operation = {
  memberId: string;
  current(): boolean;
  request(path: string, method: 'GET' | 'POST', body?: string): Promise<Reply>;
};
const startMessage = 'Load your private list to review the blocks you set.';

export function createMemberBlocks(config: Config) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15000;
  if (!hasCircleAuthority(config.owner) || typeof config.transport !== 'function'
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.memberId !== undefined && !isUuid(config.memberId)
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean'
    || config.newRequestId !== undefined && typeof config.newRequestId !== 'function') throw Error('Verified member connection required');

  let attached = false, active = true, online = config.initialOnline ?? false, busy = false;
  let scope: string | null = null, checkedMember: string | null = null, generation = 0;
  let page: DirectMessageBlockPage | null = null, review: DirectMessageBlock | null = null;
  let pending: MemberUnblockInput | null = null, operation: AbortController | null = null;
  let message = startMessage, offOwner = () => {};
  const listeners = new Set<(value: MemberBlocksModel) => void>();
  const usable = () => attached && active && online && scope !== null && config.owner.scope() === scope;
  const model = (): MemberBlocksModel => {
    const available = usable(), ready = available && !busy;
    return { active, connected: attached && scope !== null, online, busy,
      page: available && page ? { items: page.items.map(item => ({ ...item })), nextCursor: page.nextCursor } : null,
      review: available && review ? { ...review } : null, message,
      canLoad: ready && pending === null, canNext: ready && pending === null && review === null && Boolean(page?.nextCursor),
      canReview: ready && pending === null && review === null && Boolean(config.newRequestId && page?.items.length),
      canUnblock: ready && Boolean(review && config.newRequestId), canRetry: ready && pending !== null };
  };
  const emit = () => {
    for (const listener of listeners) {
      try { listener(model()); } catch { /* One view cannot stop another from clearing. */ }
    }
  };
  function clearPage() {
    page = null; review = null; checkedMember = null;
  }
  function retire(notice: string) {
    generation++; operation?.abort(); operation = null; busy = false;
    pending = null; clearPage(); message = notice; emit();
  }

  async function execute(work: (operation: Operation) => Promise<void>, failure: () => void) {
    const expected = scope;
    if (!usable() || !expected || busy) return;
    const g = ++generation, abort = new AbortController();
    operation = abort; busy = true; emit();
    const stillOwned = () => g === generation && usable() && scope === expected;
    const current = () => stillOwned() && !abort.signal.aborted;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(Error('Member request timed out')); }, timeout);
    });
    try {
      await Promise.race([deadline, (async () => {
        const headers = await circleAuthorizationHeaders(config.owner, expected);
        const proof = headers?.[DIRECT_MESSAGE_OWNER_HEADER];
        const memberId = config.memberId?.toLowerCase() ?? proof;
        if (!current() || !headers || !isUuid(memberId) || proof && proof !== memberId) throw Error('Member proof unavailable');
        await work({ memberId, current, async request(path, method, body) {
          if (!current()) throw Error('Member request retired');
          const url = origin + path;
          const result = await config.transport(url, { method, body, cache: 'no-store', redirect: 'error', credentials: 'omit',
            headers: { ...headers, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, signal: abort.signal });
          if (!current() || result.redirected || result.url !== url) throw Error('Member reply unavailable');
          const value = await result.json();
          if (!current()) throw Error('Member request retired');
          return { status: result.status, value };
        } });
      })()]);
    } catch {
      if (stillOwned()) failure();
    } finally {
      clearTimeout(timer);
      if (stillOwned()) { operation = null; busy = false; emit(); }
    }
  }

  async function load(after: string | null) {
    if (!model().canLoad) return;
    clearPage(); message = 'Checking your blocked members…';
    await execute(async ({ memberId, current, request }) => {
      const path = after ? MEMBER_BLOCKS_PATH + '?after=' + after : MEMBER_BLOCKS_PATH;
      const reply = await request(path, 'GET');
      if (!current()) return;
      const result = reply.status === 200 ? parseMemberBlockPage(reply.value, memberId) : null;
      // The service returns ascending UUIDs and uses the last shown ID as
      // the next cursor. Reject duplicates and a page that moves backward.
      if (!result || result.items.some((item, index) => item.blockId !== item.blockId.toLowerCase()
        || (after !== null && item.blockId <= after)
        || (index > 0 && item.blockId <= result.items[index - 1].blockId))) throw Error('Member list unavailable');
      page = result; checkedMember = memberId;
      message = result.items.length ? 'Your current blocks are ready to review.' : 'There are no blocks on this page.';
    }, () => { message = 'The blocked-members list could not be verified. Check your account and load it again.'; });
  }

  async function change() {
    const chosen = review, member = checkedMember, key = config.newRequestId;
    let input = pending, transmitted = false;
    if (input ? !model().canRetry : !model().canUnblock || !chosen || !member || !key) return;
    clearPage(); message = 'Checking and sending the reviewed unblock…';
    await execute(async ({ memberId, current, request }) => {
      if (!input && chosen && member && key) input = parseMemberUnblockInput({
        expectedMemberId: member, blockId: chosen.blockId, expectedRevision: chosen.revision, requestId: await key(),
      });
      if (!input || memberId !== input.expectedMemberId || !current()) throw Error('Unblock review unavailable');
      transmitted = true;
      const reply = await request(MEMBER_BLOCKS_PATH, 'POST', JSON.stringify(input));
      if (!current()) return;
      if (reply.status === 200 && parseDirectMessageBlockReceipt(reply.value, { ...input, blocked: false })) {
        pending = null; message = 'Unblocked. Load your current list to continue.';
      } else if ([400, 401, 403, 404, 409, 413, 415, 429].includes(reply.status)) {
        pending = null; message = 'The block could not be confirmed. Load the current list before deciding again.';
      } else throw Error('Unblock receipt unavailable');
    }, () => {
      pending = transmitted ? input : pending;
      message = pending ? 'Unblock unconfirmed. You can retry this exact request or clear the view.'
        : 'The unblock could not be prepared. Load the current list before deciding again.';
    });
  }

  return {
    model,
    subscribe(listener: (value: MemberBlocksModel) => void) {
      listeners.add(listener); listener(model()); return () => { listeners.delete(listener); };
    },
    connect() {
      if (attached) return;
      attached = true; scope = config.owner.scope();
      offOwner = config.owner.subscribe(() => {
        scope = config.owner.scope(); retire('Account access changed. Load your own blocks again when ready.');
      });
      emit();
    },
    disconnect() {
      attached = false; scope = null; offOwner(); offOwner = () => {}; retire(startMessage);
    },
    activity(value: boolean) {
      if (active === value) return;
      active = value;
      if (!active) retire('Private blocks and review cleared while inactive.');
      else emit();
    },
    connectivity(value: boolean) {
      if (online === value) return;
      online = value;
      if (!online) retire('Private blocks and review cleared. Connect and load them again.');
      else emit();
    },
    close() { retire(startMessage); },
    load() { return load(null); },
    next() { return model().canNext && page?.nextCursor ? load(page.nextCursor) : Promise.resolve(); },
    review(blockId: string, revision: number) {
      if (!model().canReview || !page) return;
      const selected = page.items.find(item => item.blockId === blockId && item.revision === revision);
      if (!selected) return;
      review = selected; emit();
    },
    cancelReview() { if (!busy && review) { review = null; emit(); } },
    unblock() { return model().canUnblock ? change() : Promise.resolve(); },
    retry() { return model().canRetry ? change() : Promise.resolve(); },
  };
}
