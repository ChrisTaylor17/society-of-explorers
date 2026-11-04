// platforms/native/src/circles/path.ts
var CIRCLE_BOOK_ID = "soe-circles-path";

// platforms/native/src/circles/discussion-reader.ts
var object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
var text = (x, max) => typeof x === "string" && x.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
var id = (x) => typeof x === "string" && /^[A-Za-z0-9._:-]{1,100}$/.test(x);
var copy = (x) => JSON.parse(JSON.stringify(x));
function discussionMessageFrom(value) {
  if (!object(value) || !id(value.id) || !text(value.member_name, 200) || !text(value.content, 2000) || !text(value.created_at, 64) || !Number.isFinite(Date.parse(value.created_at)) || typeof value.is_mine !== "boolean")
    return null;
  return { id: value.id, member_name: value.member_name, content: value.content, created_at: value.created_at, is_mine: value.is_mine };
}
function conversationFrom(value, circleId) {
  if (!object(value) || !object(value.cohort) || value.cohort.id !== circleId || value.cohort.book_id !== CIRCLE_BOOK_ID || !text(value.cohort.title, 200) || !Array.isArray(value.messages) || value.messages.length > 100)
    return null;
  const messages = [], seen = new Set;
  for (const m of value.messages) {
    const message = discussionMessageFrom(m);
    if (!message || seen.has(message.id))
      return null;
    seen.add(message.id);
    messages.push(message);
  }
  return { circleId, title: value.cohort.title, messages };
}
function createCircleDiscussionReader(gateway, circleId) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(circleId))
    throw Error("Explicit circle UUID required");
  let generation = 0, disposed = false;
  let s = { revision: 0, open: false, active: true, busy: false, phase: "closed", conversation: null, message: "Open the existing circle conversation to check access." };
  const listeners = new Set, model = () => copy(s), emit = () => {
    if (!disposed)
      for (const f of listeners)
        f(model());
  };
  const current = (g) => !disposed && g === generation && s.open && s.active;
  function retire(message = "Access changed. Check membership again before reading.") {
    generation++;
    s = { ...s, busy: false, phase: s.open ? "paused" : "closed", conversation: null, message };
    emit();
  }
  async function refresh() {
    if (disposed || !s.open || !s.active || s.busy)
      return;
    const g = ++generation;
    s = { ...s, busy: true, phase: "loading", conversation: null, message: "Checking current circle membership and discussion access." };
    emit();
    try {
      const r = await gateway.read(circleId);
      if (!current(g))
        return;
      const conversation = r.http === 200 ? conversationFrom(r.body, circleId) : null;
      if (conversation)
        s = { ...s, revision: s.revision + 1, busy: false, phase: "ready", conversation, message: "Current circle conversation loaded." };
      else
        s = { ...s, busy: false, phase: [401, 403, 404].includes(r.http) ? "denied" : "unavailable", conversation: null, message: [401, 403, 404].includes(r.http) ? "Current circle membership could not be confirmed. No discussion is shown." : "Discussion unavailable. Nothing was posted or retried." };
      emit();
    } catch {
      if (current(g)) {
        s = { ...s, busy: false, phase: "unavailable", conversation: null, message: "Read unavailable. Nothing was posted or retried." };
        emit();
      }
    }
  }
  return {
    model,
    subscribe(f) {
      listeners.add(f);
      f(model());
      return () => {
        listeners.delete(f);
      };
    },
    async open() {
      if (disposed)
        return;
      s.open = true;
      await refresh();
    },
    refresh,
    retire,
    activity(state) {
      if (disposed)
        return;
      if (state !== "active") {
        s.active = false;
        retire("Private conversation cleared while inactive. Refresh access when you return.");
      } else {
        s.active = true;
        emit();
      }
    },
    close() {
      if (disposed)
        return;
      s.open = false;
      retire("Conversation closed. Stored messages and previously seen copies remain.");
    },
    dispose() {
      disposed = true;
      generation++;
      s.conversation = null;
      listeners.clear();
    }
  };
}
function createCircleDiscussionGateway(request) {
  return { read: (circleId) => request(`/api/book-salons/${encodeURIComponent(circleId)}`, { method: "GET", cache: "no-store", redirect: "error" }) };
}

// platforms/native/src/circles/discussion-composer.ts
var CIRCLE_MESSAGE_LIMIT = 2000;
var record = (x) => !!x && typeof x === "object" && !Array.isArray(x);
var valid = (value) => value.trim().length > 0 && value.length <= CIRCLE_MESSAGE_LIMIT && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
function createCircleDiscussionComposer(gateway, circleId) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(circleId))
    throw Error("Explicit circle UUID required");
  let generation = 0, disposed = false, pending = false, reviewRequired = false;
  let readRevision = 0, reviewAfterRevision = 0;
  let state = {
    active: true,
    ready: false,
    phase: "locked",
    draft: "",
    message: "Read the current conversation to check membership before writing."
  };
  const listeners = new Set;
  const model = () => {
    const canEdit = !disposed && state.active && state.ready && !pending && !reviewRequired;
    return {
      ...state,
      circleId,
      busy: pending,
      remaining: CIRCLE_MESSAGE_LIMIT - state.draft.length,
      canEdit,
      canSend: canEdit && valid(state.draft),
      canStartNew: !disposed && state.active && state.ready && !pending && reviewRequired && readRevision > reviewAfterRevision
    };
  };
  const emit = () => {
    if (!disposed)
      for (const listener of listeners)
        listener(model());
  };
  const current = (value) => !disposed && generation === value && state.active && state.ready;
  function retire(message = "Private draft cleared. Read the conversation again before writing.") {
    if (disposed)
      return;
    generation++;
    if (pending) {
      reviewRequired = true;
      reviewAfterRevision = readRevision;
    }
    state = {
      ...state,
      ready: false,
      draft: "",
      phase: reviewRequired ? "unknown" : "locked",
      message: reviewRequired ? "A message request may have completed. Refresh the conversation before starting a new message." : message
    };
    emit();
  }
  return {
    model,
    subscribe(listener) {
      listeners.add(listener);
      listener(model());
      return () => {
        listeners.delete(listener);
      };
    },
    access(ready, revision) {
      if (disposed)
        return;
      if (!Number.isSafeInteger(revision) || revision < readRevision || ready && revision === 0)
        ready = false;
      else
        readRevision = revision;
      if (!ready && state.ready) {
        if (!pending && state.phase === "confirmed") {
          generation++;
          state.ready = false;
          state.draft = "";
          state.message = "Message posted. Check the conversation for the latest view.";
          emit();
        } else
          retire();
        return;
      }
      state.ready = ready;
      if (ready && !reviewRequired && (state.phase === "locked" || state.phase === "denied")) {
        state.phase = "editing";
        state.message = "Write a message for this circle. Nothing is posted until you choose Post to circle.";
      }
      emit();
    },
    activity(active) {
      if (disposed)
        return;
      state.active = active;
      if (!active)
        retire("Private draft cleared while inactive. Refresh access when you return.");
      else
        emit();
    },
    retire,
    edit(value) {
      if (!model().canEdit)
        return false;
      if (typeof value !== "string" || value.length > CIRCLE_MESSAGE_LIMIT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
        state.message = "Use plain text up to 2,000 characters.";
        emit();
        return false;
      }
      state.draft = value;
      state.phase = "editing";
      state.message = "Draft is kept only in this view. Leaving, pausing or changing accounts clears it.";
      emit();
      return true;
    },
    clear() {
      if (!model().canEdit)
        return;
      state.draft = "";
      state.message = "Draft cleared. Posted messages are unchanged.";
      emit();
    },
    async send() {
      if (!model().canSend)
        return "ignored";
      const content = state.draft.trim(), operation = ++generation;
      pending = true;
      state.phase = "sending";
      state.message = "Posting to this circle…";
      emit();
      try {
        const reply = await gateway.send(circleId, content, () => current(operation));
        pending = false;
        if (!current(operation)) {
          if (reviewRequired)
            reviewAfterRevision = readRevision;
          emit();
          return "ignored";
        }
        const body = record(reply.body) ? reply.body : null;
        const message = body?.outcome === "confirmed" && body.circleId === circleId ? discussionMessageFrom(body.message) : null;
        if (reply.http === 200 && message?.is_mine && message.content === content) {
          state.draft = "";
          state.phase = "confirmed";
          state.message = "Message posted to this circle.";
          emit();
          return "confirmed";
        }
        if ([400, 401, 403, 404, 429, 503].includes(reply.http) && body?.outcome === "not_attempted") {
          const denied = [401, 403, 404].includes(reply.http);
          if (denied) {
            state.ready = false;
            state.draft = "";
          }
          state.phase = denied ? "denied" : "editing";
          state.message = denied ? "Current circle access was not confirmed. Draft cleared; nothing was posted." : reply.http === 429 ? "Posting is temporarily limited. Nothing was posted; try later." : "The server did not attempt this post. Check your message and current access before trying again.";
          emit();
          return "denied";
        }
      } catch {
        pending = false;
        if (!current(operation)) {
          if (reviewRequired)
            reviewAfterRevision = readRevision;
          emit();
          return "ignored";
        }
      }
      reviewRequired = true;
      reviewAfterRevision = readRevision;
      state.draft = "";
      state.phase = "unknown";
      state.message = "Could not confirm whether your message was posted. Refresh and review the conversation before starting a new message.";
      emit();
      return "unknown";
    },
    startNewAfterReview() {
      if (!model().canStartNew)
        return false;
      reviewRequired = false;
      state.draft = "";
      state.phase = "editing";
      state.message = "Start a new message. The earlier request was not retried.";
      emit();
      return true;
    },
    dispose() {
      generation++;
      disposed = true;
      state.draft = "";
      state.ready = false;
      listeners.clear();
    }
  };
}
function createCircleMessageGateway(request) {
  return { send: (circleId, content, mayTransmit) => request(`/api/book-salons/${encodeURIComponent(circleId)}`, { method: "POST", cache: "no-store", redirect: "error", body: JSON.stringify({ content }) }, mayTransmit) };
}

// platforms/native/src/circles/participation-session.ts
function createCircleParticipationSession(request, circleId) {
  let generation = 0, active = true, disposed = false, syncDepth = 0;
  const listeners = new Set;
  const guardedRequest = (path, options, mayTransmit = () => true) => {
    const operation = generation;
    return request(path, options, () => !disposed && active && operation === generation && mayTransmit());
  };
  const reader = createCircleDiscussionReader(createCircleDiscussionGateway((path, options) => guardedRequest(path, options, () => true)), circleId);
  const composer = createCircleDiscussionComposer(createCircleMessageGateway(guardedRequest), circleId);
  const model = () => ({ circleId, read: reader.model(), write: composer.model() });
  const emit = () => {
    if (!disposed && syncDepth === 0)
      for (const listener of listeners)
        listener(model());
  };
  const batch = (work) => {
    syncDepth++;
    try {
      work();
    } finally {
      syncDepth--;
      emit();
    }
  };
  const offWrite = composer.subscribe(emit);
  const offRead = reader.subscribe((value) => {
    batch(() => composer.access(value.phase === "ready", value.revision));
  });
  function retire() {
    generation++;
    batch(() => {
      composer.retire();
      reader.retire();
    });
  }
  function close() {
    generation++;
    batch(() => {
      composer.retire();
      reader.close();
    });
  }
  return {
    model,
    subscribe(listener) {
      if (disposed)
        return () => {};
      listeners.add(listener);
      listener(model());
      return () => {
        listeners.delete(listener);
      };
    },
    async open() {
      if (!disposed && active && !composer.model().busy)
        await reader.open();
    },
    async refresh() {
      if (!disposed && active && !composer.model().busy)
        await reader.refresh();
    },
    edit(value) {
      return !disposed && composer.edit(value);
    },
    clearDraft() {
      if (!disposed)
        composer.clear();
    },
    async post() {
      if (disposed || !active)
        return "ignored";
      const operation = generation;
      const outcome = await composer.send();
      if (disposed || operation !== generation || !active)
        return "ignored";
      if (outcome === "confirmed")
        await reader.refresh();
      if (disposed || operation !== generation || !active)
        return "ignored";
      return outcome;
    },
    startNewAfterReview() {
      return !disposed && composer.startNewAfterReview();
    },
    retire() {
      if (!disposed)
        retire();
    },
    close() {
      if (!disposed)
        close();
    },
    activity(isActive) {
      if (disposed)
        return;
      if (!isActive)
        generation++;
      active = isActive;
      batch(() => {
        composer.activity(isActive);
        reader.activity(isActive ? "active" : "inactive");
      });
    },
    dispose() {
      if (disposed)
        return;
      generation++;
      disposed = true;
      listeners.clear();
      offRead();
      offWrite();
      reader.dispose();
      composer.dispose();
    }
  };
}

// lib/ids/uuid.ts
var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

// lib/circles/thread.ts
var DISCUSSION_MESSAGE_LIMIT = 2000;
var DISCUSSION_PAGE_LIMIT = 25;
var record2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var plain = (value, max) => typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
var uuid = (value) => isUuid(value);
var same = (a, b) => a.toLowerCase() === b.toLowerCase();
var timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value));
function displayName(value) {
  if (!value.trim() || value.includes("@") || /[\r\n\t]/u.test(value))
    return "Explorer";
  let result = "";
  for (const character of value.trim()) {
    if (result.length + character.length > 200)
      break;
    result += character;
  }
  return result || "Explorer";
}
function parseDiscussionQuery(params) {
  if (Array.from(params.keys()).some((key) => params.getAll(key).length !== 1))
    return null;
  if (params.has("requestId"))
    return params.size === 1 && uuid(params.get("requestId")) ? { kind: "receipt", requestId: params.get("requestId").toLowerCase() } : null;
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? DISCUSSION_PAGE_LIMIT : /^[1-9][0-9]*$/u.test(rawLimit) ? Number(rawLimit) : NaN;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DISCUSSION_PAGE_LIMIT)
    return null;
  if (params.has("message")) {
    if (Array.from(params.keys()).some((key) => !["message", "after", "limit"].includes(key)) || !uuid(params.get("message")) || params.has("after") && !uuid(params.get("after")))
      return null;
    return { kind: "thread", messageId: params.get("message").toLowerCase(), after: params.get("after")?.toLowerCase() ?? null, limit };
  }
  if (Array.from(params.keys()).some((key) => !["before", "limit"].includes(key)) || params.has("before") && !uuid(params.get("before")))
    return null;
  return { kind: "archive", before: params.get("before")?.toLowerCase() ?? null, limit };
}
function discussionSearchParams(query) {
  const params = new URLSearchParams;
  if (query.kind === "thread") {
    params.set("message", query.messageId);
    if (query.after)
      params.set("after", query.after);
  } else if (query.before)
    params.set("before", query.before);
  if (query.limit !== DISCUSSION_PAGE_LIMIT)
    params.set("limit", String(query.limit));
  const parsed = parseDiscussionQuery(params);
  if (!parsed || parsed.kind !== query.kind)
    throw Error("Invalid discussion page");
  return params;
}
function parseThreadMessage(value) {
  if (!record2(value) || !uuid(value.id) || !plain(value.member_name, 400) || value.created_at !== null && !timestamp(value.created_at) || typeof value.is_mine !== "boolean" || !["visible", "hidden", "withdrawn", "unavailable"].includes(String(value.visibility)) || !uuid(value.rootMessageId) || value.parentMessageId !== null && !uuid(value.parentMessageId))
    return null;
  const id = value.id.toLowerCase(), root = value.rootMessageId.toLowerCase(), parent = value.parentMessageId === null ? null : value.parentMessageId.toLowerCase();
  if (parent === null ? root !== id : parent === id || root === id)
    return null;
  if (value.visibility === "visible" ? !timestamp(value.created_at) || !plain(value.content, DISCUSSION_MESSAGE_LIMIT) || !value.content.trim() : value.content !== null)
    return null;
  return {
    id,
    rootMessageId: root,
    parentMessageId: parent,
    member_name: displayName(value.member_name),
    content: value.content,
    created_at: value.created_at,
    is_mine: value.is_mine,
    visibility: value.visibility
  };
}
function parseDiscussionPage(value, expected) {
  if (!record2(value) || !["archive", "thread"].includes(String(value.kind)) || !uuid(value.circleId) || !Number.isSafeInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > DISCUSSION_PAGE_LIMIT || !Array.isArray(value.items) || value.items.length > Number(value.limit) || value.nextCursor !== null && !uuid(value.nextCursor))
    return null;
  const circleId = value.circleId.toLowerCase(), limit = Number(value.limit);
  if (expected?.circleId && !same(expected.circleId, circleId) || expected?.kind && expected.kind !== value.kind || expected?.limit && expected.limit !== limit)
    return null;
  const items = [], seen = new Set;
  for (const raw of value.items) {
    const item = parseThreadMessage(raw);
    if (!item || seen.has(item.id))
      return null;
    seen.add(item.id);
    items.push(item);
  }
  const nextCursor = value.nextCursor === null ? null : value.nextCursor.toLowerCase();
  if (nextCursor && (items.length !== limit || items.at(-1)?.id !== nextCursor))
    return null;
  if (value.kind === "archive") {
    if (expected?.before && (nextCursor === expected.before.toLowerCase() || seen.has(expected.before.toLowerCase())))
      return null;
    return { kind: "archive", circleId, items, nextCursor, limit };
  }
  const root = parseThreadMessage(value.root), focus = parseThreadMessage(value.focus);
  if (!root || root.parentMessageId !== null || !focus || focus.rootMessageId !== root.id || expected?.messageId && !same(focus.id, expected.messageId) || items.some((item) => item.id === root.id || item.rootMessageId !== root.id || item.parentMessageId === null) || expected?.after && (nextCursor === expected.after.toLowerCase() || seen.has(expected.after.toLowerCase())))
    return null;
  return { kind: "thread", circleId, root, focus, items, nextCursor, limit };
}

// platforms/shared/archive.ts
function createDiscussionArchive(request, circleId) {
  if (!isUuid(circleId))
    throw Error("Valid Circle required");
  const circle = circleId.toLowerCase();
  let generation = 0;
  let state = { open: false, active: true, busy: false, phase: "closed", page: null, message: "Open the complete discussion archive to check current access." };
  const listeners = new Set;
  const model = () => JSON.parse(JSON.stringify(state));
  const emit = () => {
    for (const listener of listeners)
      listener(model());
  };
  const current = (g) => g === generation && state.open && state.active;
  function retire(message = "Private archive cleared. Check current Circle access again.") {
    generation++;
    state = { ...state, busy: false, page: null, phase: state.open ? "paused" : "closed", message };
    emit();
  }
  async function read(query) {
    if (!state.active || state.busy)
      return;
    const params = discussionSearchParams(query), suffix = params.size ? `?${params}` : "";
    const g = ++generation;
    state = { ...state, open: true, busy: true, phase: "loading", page: null, message: "Checking current membership and loading discussion." };
    emit();
    try {
      const reply = await request(`/api/circles/${circle}/discussion${suffix}`, { method: "GET", cache: "no-store", redirect: "error" }, () => current(g));
      if (!current(g))
        return;
      const page = reply.http === 200 ? parseDiscussionPage(reply.body, { ...query, circleId: circle }) : null;
      if (!page) {
        const denied = [401, 403, 404].includes(reply.http);
        state = {
          ...state,
          busy: false,
          phase: denied ? "denied" : "unavailable",
          page: null,
          message: denied ? "Current Circle access could not be confirmed. No discussion is shown." : "Discussion is unavailable. No messages were posted or retried."
        };
      } else
        state = { ...state, busy: false, phase: "ready", page, message: page.kind === "thread" ? "Current thread loaded. Hidden or withdrawn messages stay restricted." : "Current archive page loaded. Older messages are available through pagination." };
      emit();
    } catch {
      if (current(g)) {
        state = { ...state, busy: false, phase: "unavailable", page: null, message: "Discussion read is unavailable. Try an explicit refresh when ready." };
        emit();
      }
    }
  }
  return {
    model,
    subscribe(listener) {
      listeners.add(listener);
      listener(model());
      return () => {
        listeners.delete(listener);
      };
    },
    open: () => read({ kind: "archive", before: null, limit: 25 }),
    thread(messageId) {
      if (!isUuid(messageId))
        return Promise.resolve();
      return read({ kind: "thread", messageId: messageId.toLowerCase(), after: null, limit: 25 });
    },
    next() {
      const p = state.page;
      if (!p?.nextCursor)
        return Promise.resolve();
      return read(p.kind === "archive" ? { kind: "archive", before: p.nextCursor, limit: p.limit } : { kind: "thread", messageId: p.focus.id, after: p.nextCursor, limit: p.limit });
    },
    retire,
    activity(active) {
      state.active = active;
      if (!active)
        retire("Private archive cleared while inactive. Refresh current access when you return.");
      else
        emit();
    },
    close() {
      state.open = false;
      retire("Discussion archive closed.");
    }
  };
}

// platforms/native/src/circles/host.ts
function approvedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw Error("Explicit HTTPS application origin required");
  return url.origin;
}
function createCircleHost(config) {
  if (!isUuid(config?.circleId) || typeof config?.owner?.scope !== "function" || typeof config.owner.bearer !== "function" || typeof config.owner.subscribe !== "function" || typeof config.transport !== "function")
    throw Error("Existing session owner and approved transport required");
  const circleId = config.circleId.toLowerCase();
  const origin = approvedOrigin(config.origin);
  const timeout = config.timeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000)
    throw Error("Invalid deadline");
  let attached = false, active = true, online = true, scope = null, unsubscribe = () => {};
  const listeners = new Set;
  const pendingRequests = new Set;
  const abortPending = () => {
    for (const pending of pendingRequests)
      pending.abort();
  };
  const current = (expected) => attached && active && online && scope === expected && config.owner.scope() === expected;
  const request = async (path, options, mayTransmit) => {
    const url = new URL(path, origin), query = parseDiscussionQuery(url.searchParams);
    const archiveRead = options.method === "GET" && url.pathname === `/api/circles/${circleId}/discussion` && query && query.kind !== "receipt" && !url.hash && url.origin === origin;
    if (!(archiveRead || path === `/api/book-salons/${circleId}`) || !["GET", "POST"].includes(options.method))
      throw Error("Unexpected Circle operation");
    const expected = scope;
    if (!expected || !current(expected) || !mayTransmit())
      throw Error("Circle session unavailable");
    const abort = new AbortController;
    pendingRequests.add(abort);
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(Error("Circle deadline exceeded"));
      }, timeout);
    });
    try {
      return await Promise.race([deadline, (async () => {
        const bearer = await config.owner.bearer(expected);
        if (!bearer || bearer.length > 16384 || /[\s\u0000-\u001f\u007f]/.test(bearer) || abort.signal.aborted || !current(expected) || !mayTransmit())
          throw Error("Circle session changed");
        const response = await config.transport(origin + path, {
          ...options,
          credentials: "omit",
          signal: abort.signal,
          headers: { Authorization: `Bearer ${bearer}`, ...options.method === "POST" ? { "Content-Type": "application/json" } : {} }
        });
        if (response.redirected || response.url !== origin + path)
          throw Error("Unexpected Circle response origin");
        if (abort.signal.aborted || !current(expected) || !mayTransmit())
          throw Error("Circle lifetime ended");
        if ([401, 403, 404].includes(response.status))
          participation.retire();
        const body = await response.json();
        if (abort.signal.aborted || !current(expected) || !mayTransmit())
          throw Error("Circle lifetime ended");
        return { http: response.status, body };
      })()]);
    } finally {
      clearTimeout(timer);
      pendingRequests.delete(abort);
    }
  };
  const participation = createCircleParticipationSession(request, circleId);
  const archive = createDiscussionArchive(request, circleId);
  const model = () => ({
    configured: true,
    connected: attached && scope !== null,
    active,
    online,
    status: !attached || !scope ? "Connect the existing member session to read this circle." : !active ? "Private circle views cleared while inactive." : !online ? "Offline. Private views and draft cleared. Requests already sent may still complete." : "Refresh to check current circle membership.",
    participation: participation.model(),
    archive: archive.model()
  });
  const emit = () => {
    for (const listener of listeners)
      listener(model());
  };
  participation.subscribe(emit);
  archive.subscribe(emit);
  const setActivity = () => {
    const enabled = attached && active && online && scope !== null;
    participation.activity(enabled);
    archive.activity(enabled);
  };
  const sync = () => {
    abortPending();
    scope = config.owner.scope();
    participation.retire();
    archive.retire();
    setActivity();
    emit();
  };
  return {
    model,
    subscribe(listener) {
      listeners.add(listener);
      listener(model());
      return () => {
        listeners.delete(listener);
      };
    },
    connect() {
      if (attached)
        return;
      attached = true;
      unsubscribe = config.owner.subscribe(sync);
      sync();
    },
    disconnect() {
      abortPending();
      attached = false;
      scope = null;
      unsubscribe();
      unsubscribe = () => {};
      participation.close();
      archive.close();
      setActivity();
      emit();
    },
    activity(value) {
      if (!value)
        abortPending();
      active = value;
      setActivity();
      emit();
    },
    connectivity(value) {
      if (!value)
        abortPending();
      online = value;
      setActivity();
      emit();
    },
    async refresh() {
      if (scope && current(scope)) {
        archive.close();
        await participation.open();
      }
    },
    async openArchive() {
      if (scope && current(scope)) {
        if (participation.model().write.busy)
          return;
        participation.retire();
        await archive.open();
      }
    },
    archiveNext: archive.next,
    archiveThread: archive.thread,
    edit: participation.edit,
    clearDraft: participation.clearDraft,
    post: participation.post,
    startNewAfterReview: participation.startNewAfterReview,
    close() {
      abortPending();
      participation.close();
      archive.close();
    }
  };
}
// platforms/native/src/circles/verified-member-session.ts
var identity = (x) => typeof x === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(x);
var token = (x) => typeof x === "string" && x.length > 0 && x.length <= 16384 && !/[\s\u0000-\u001f\u007f]/.test(x);
var sessionValid = (s) => !!s && token(s.access_token) && identity(s.user?.id);
var VERIFY_EVENTS = new Set(["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "MFA_CHALLENGE_VERIFIED"]);
function createVerifiedSupabaseCircleOwner(auth, { timeoutMs = 5000 } = {}) {
  if (!auth || typeof auth.getSession !== "function" || typeof auth.getUser !== "function" || typeof auth.onAuthStateChange !== "function")
    throw Error("Existing verifying auth client required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
    throw Error("Invalid verification deadline");
  let started = false, active = true, inAuthCallback = false, lifetime = 0, generation = 0, sequence = 0;
  let subject = null, scope = null, operation = null;
  let unsubscribe = null, scheduled;
  let phase = "stopped", message = "Existing member session is not connected.";
  const ownerListeners = new Set, listeners = new Set;
  const model = () => ({ phase, active, busy: phase === "checking", canCheck: started && active && phase !== "checking", message });
  const notify = () => {
    for (const f of ownerListeners) {
      try {
        f();
      } catch {}
    }
    for (const f of listeners) {
      try {
        f(model());
      } catch {}
    }
  };
  const cancelScheduled = () => {
    clearTimeout(scheduled);
    scheduled = undefined;
  };
  function clear(next, text, checking = false) {
    const transition = ++generation;
    scope = null;
    subject = null;
    operation = checking ? transition : null;
    phase = next;
    message = text;
    notify();
    return transition;
  }
  const current = (g) => started && active && generation === g;
  async function deadline(work) {
    let timer;
    try {
      return await Promise.race([work(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Verification unavailable")), timeoutMs);
      })]);
    } finally {
      clearTimeout(timer);
    }
  }
  function attach() {
    if (unsubscribe)
      return true;
    const run = lifetime;
    try {
      const result = auth.onAuthStateChange((event) => {
        if (!started || lifetime !== run)
          return;
        const wasInAuthCallback = inAuthCallback;
        inAuthCallback = true;
        try {
          cancelScheduled();
          if (!active) {
            clear("paused", "Private session access cleared while inactive. Check the existing session when you return.");
            return;
          }
          if (event === "SIGNED_OUT") {
            clear("signed_out", "No active member session. Use the existing app sign-in, then check again.");
            return;
          }
          if (!VERIFY_EVENTS.has(event)) {
            clear("unavailable", "Account state changed. Check the existing app session again before continuing.");
            return;
          }
          const transition = clear("checking", "Checking the existing member session. Circle membership still requires a fresh read.");
          if (!current(transition) || lifetime !== run)
            return;
          scheduled = setTimeout(() => {
            scheduled = undefined;
            check();
          }, 0);
        } finally {
          inAuthCallback = wasInAuthCallback;
        }
      });
      if (typeof result?.data?.subscription?.unsubscribe !== "function")
        throw Error("Subscription unavailable");
      const detach = () => result.data.subscription.unsubscribe();
      if (!started || lifetime !== run) {
        try {
          detach();
        } catch {}
        return false;
      }
      unsubscribe = detach;
      return true;
    } catch {
      if (started && lifetime === run) {
        lifetime++;
        clear("unavailable", "Session checks are unavailable. Try checking the existing session again.");
      }
      return false;
    }
  }
  async function check() {
    if (!started || !active || inAuthCallback || operation !== null)
      return;
    cancelScheduled();
    const beforeAttach = generation;
    if (!attach() || !started || !active || generation !== beforeAttach)
      return;
    const g = clear("checking", "Checking the existing member session. Circle membership still requires a fresh read.", true);
    if (!current(g))
      return;
    try {
      const verified = await deadline(async () => {
        const result = await auth.getSession();
        if (!current(g))
          return null;
        if (result.error)
          throw Error("Session unavailable");
        if (!result.data.session)
          return { signedOut: true };
        const s = result.data.session;
        if (!sessionValid(s))
          throw Error("Session unavailable");
        const checkedToken = s.access_token, checkedSubject = s.user.id;
        const reply = await auth.getUser(checkedToken);
        if (!current(g))
          return null;
        if (s.access_token !== checkedToken || s.user?.id !== checkedSubject || reply.error || !identity(reply.data.user?.id) || reply.data.user.id !== checkedSubject)
          throw Error("Identity not confirmed");
        return { subject: checkedSubject };
      });
      if (!current(g) || !verified)
        return;
      operation = null;
      if ("signedOut" in verified) {
        clear("signed_out", "No active member session. Use the existing app sign-in, then check again.");
        return;
      }
      subject = verified.subject;
      scope = `verified-owner-${++sequence}`;
      phase = "ready";
      message = "Provider session checked. Refresh Circle access to confirm current membership.";
      notify();
    } catch {
      if (current(g))
        clear("unavailable", "Could not confirm the existing member session. Check again when available.");
    }
  }
  const owner = {
    scope: () => scope,
    subscribe(listener) {
      ownerListeners.add(listener);
      return () => {
        ownerListeners.delete(listener);
      };
    },
    async bearer(expected) {
      const g = generation, expectedSubject = subject;
      if (!current(g) || !scope || expected !== scope || !expectedSubject || phase !== "ready")
        return null;
      try {
        return await deadline(async () => {
          const result = await auth.getSession();
          if (!current(g) || scope !== expected)
            return null;
          const s = result.data.session;
          if (result.error || !sessionValid(s) || s.user.id !== expectedSubject)
            throw Error("Session changed");
          const checkedToken = s.access_token;
          const reply = await auth.getUser(checkedToken);
          if (!current(g) || scope !== expected)
            return null;
          if (s.access_token !== checkedToken || s.user?.id !== expectedSubject || reply.error || reply.data.user?.id !== expectedSubject)
            throw Error("Identity not confirmed");
          return checkedToken;
        });
      } catch {
        if (current(g) && scope === expected)
          clear("unavailable", "Session access could not be confirmed. Check the existing session before continuing.");
        return null;
      }
    }
  };
  return {
    owner,
    model,
    subscribe(listener) {
      listeners.add(listener);
      listener(model());
      return () => {
        listeners.delete(listener);
      };
    },
    async start() {
      if (started)
        return;
      started = true;
      lifetime++;
      if (!active) {
        clear("paused", "Private session access cleared while inactive. Check the existing session when you return.");
        return;
      }
      await check();
    },
    check,
    activity(value) {
      if (value === active)
        return;
      active = value;
      cancelScheduled();
      if (started)
        clear("paused", value ? "Check the existing member session again before continuing." : "Private session access cleared while inactive. Check the existing session when you return.");
    },
    stop() {
      started = false;
      lifetime++;
      cancelScheduled();
      const off = unsubscribe;
      unsubscribe = null;
      clear("stopped", "Existing member session connection closed. The app still owns sign-in and sign-out.");
      try {
        off?.();
      } catch {}
    }
  };
}
// platforms/shared/bootstrap.ts
function memberCircleConfig(input) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input))
      return null;
    const v = input;
    if (!isUuid(v.circleId) || typeof v.origin !== "string" || typeof v.transport !== "function" || typeof v.auth?.getSession !== "function" || typeof v.auth.getUser !== "function" || typeof v.auth.onAuthStateChange !== "function" || v.verificationTimeoutMs !== undefined && (!Number.isSafeInteger(v.verificationTimeoutMs) || Number(v.verificationTimeoutMs) < 1 || Number(v.verificationTimeoutMs) > 60000))
      return null;
    return {
      circleId: v.circleId.toLowerCase(),
      origin: approvedOrigin(v.origin),
      auth: v.auth,
      transport: v.transport,
      ...v.verificationTimeoutMs === undefined ? {} : { verificationTimeoutMs: Number(v.verificationTimeoutMs) }
    };
  } catch {
    return null;
  }
}
export {
  approvedOrigin,
  createCircleHost,
  createVerifiedSupabaseCircleOwner,
  memberCircleConfig
};
