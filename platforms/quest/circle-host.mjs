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
var exact = (value, keys) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
var plain = (value, max) => typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
var uuid = (value) => isUuid(value);
var hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
var revision = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
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
function discussionHref(circleId, messageId) {
  if (!uuid(circleId) || messageId !== undefined && messageId !== null && !uuid(messageId))
    throw Error("Invalid discussion locator");
  return `/circles/${circleId.toLowerCase()}/discussion${messageId ? `?message=${messageId.toLowerCase()}` : ""}`;
}
function discussionContentSuffix(circleId, parentMessageId) {
  const href = discussionHref(circleId, parentMessageId);
  return parentMessageId ? `In reply to message:
${href}` : "";
}
function discussionCommentLimit(circleId, parentMessageId) {
  const suffix = discussionContentSuffix(circleId, parentMessageId);
  return DISCUSSION_MESSAGE_LIMIT - (suffix ? suffix.length + 2 : 0);
}
function formatDiscussionContent(circleId, comment, parentMessageId) {
  if (!uuid(circleId) || parentMessageId !== null && !uuid(parentMessageId) || !plain(comment, DISCUSSION_MESSAGE_LIMIT))
    return null;
  const normalized = comment.trim();
  if (!normalized || normalized.length > discussionCommentLimit(circleId, parentMessageId))
    return null;
  const suffix = discussionContentSuffix(circleId, parentMessageId);
  return suffix ? `${normalized}

${suffix}` : normalized;
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
function parseDiscussionTarget(value) {
  if (!record2(value) || !uuid(value.circleId) || !Object.hasOwn(value, "target"))
    return null;
  if (value.target === null)
    return { circleId: value.circleId.toLowerCase(), target: null };
  const raw = value.target;
  if (!record2(raw) || !revision(raw.revision) || !hash(raw.contentHash))
    return null;
  const message = parseThreadMessage(raw.message);
  return message?.visibility === "visible" ? { circleId: value.circleId.toLowerCase(), target: { message, revision: raw.revision, contentHash: raw.contentHash } } : null;
}
function validateDiscussionPreviewInput(value) {
  if (!record2(value) || !exact(value, ["requestId", "comment", "parentMessageId"]) || !uuid(value.requestId) || !plain(value.comment, DISCUSSION_MESSAGE_LIMIT) || !value.comment.trim() || value.parentMessageId !== null && !uuid(value.parentMessageId)) {
    return { ok: false, error: "Use a nonempty comment and a valid discussion target." };
  }
  return { ok: true, value: { requestId: value.requestId.toLowerCase(), comment: value.comment.trim(), parentMessageId: value.parentMessageId === null ? null : value.parentMessageId.toLowerCase() } };
}
function parseDiscussionPreview(value) {
  if (!record2(value) || !uuid(value.circleId) || !hash(value.contentHash) || !hash(value.reviewKey) || !plain(value.content, DISCUSSION_MESSAGE_LIMIT))
    return null;
  const base = validateDiscussionPreviewInput({ requestId: value.requestId, comment: value.comment, parentMessageId: value.parentMessageId });
  const parent = parseDiscussionTarget({ circleId: value.circleId, target: value.parent });
  if (!base.ok || !parent || value.comment !== base.value.comment || (parent.target?.message.id ?? null) !== base.value.parentMessageId || formatDiscussionContent(value.circleId, base.value.comment, base.value.parentMessageId) !== value.content || value.commentLimit !== discussionCommentLimit(value.circleId, base.value.parentMessageId))
    return null;
  return { ...base.value, circleId: value.circleId.toLowerCase(), parent: parent.target, content: value.content, contentHash: value.contentHash, reviewKey: value.reviewKey, commentLimit: Number(value.commentLimit) };
}
function parseDiscussionReceipt(value) {
  if (!record2(value) || value.outcome !== "confirmed" || !uuid(value.circleId) || !uuid(value.requestId) || typeof value.replayed !== "boolean")
    return null;
  const message = parseThreadMessage(value.message);
  return message?.is_mine ? { outcome: "confirmed", circleId: value.circleId.toLowerCase(), requestId: value.requestId.toLowerCase(), replayed: value.replayed, message } : null;
}
function parseDiscussionLookup(value) {
  if (!record2(value) || !uuid(value.circleId) || !uuid(value.requestId) || !Object.hasOwn(value, "receipt"))
    return null;
  const receipt = value.receipt === null ? null : parseDiscussionReceipt(value.receipt);
  if (value.receipt !== null && (!receipt || !same(receipt.circleId, value.circleId) || !same(receipt.requestId, value.requestId) || !receipt.replayed))
    return null;
  return { circleId: value.circleId.toLowerCase(), requestId: value.requestId.toLowerCase(), receipt };
}

// platforms/shared/archive.ts
function createDiscussionArchive(request, circleId) {
  if (!isUuid(circleId))
    throw Error("Valid Circle required");
  const circle = circleId.toLowerCase();
  let generation = 0;
  let state = { open: false, active: true, busy: false, phase: "closed", page: null, revision: 0, message: "Open the complete discussion archive to check current access." };
  const listeners = new Set;
  const model = () => JSON.parse(JSON.stringify(state));
  const emit = () => {
    for (const listener of listeners)
      listener(model());
  };
  const current = (g) => g === generation && state.open && state.active;
  function retire(message = "Private archive cleared. Check current Circle access again.") {
    generation++;
    state = { ...state, revision: state.revision + 1, busy: false, page: null, phase: state.open ? "paused" : "closed", message };
    emit();
  }
  async function read(query) {
    if (!state.active || state.busy)
      return;
    const params = discussionSearchParams(query), suffix = params.size ? `?${params}` : "";
    const g = ++generation;
    state = { ...state, revision: state.revision + 1, open: true, busy: true, phase: "loading", page: null, message: "Checking current membership and loading discussion." };
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

// platforms/shared/thread-writer.ts
var copy2 = (value) => JSON.parse(JSON.stringify(value));
function createThreadWriter(request, circleId, newRequestId) {
  if (!isUuid(circleId))
    throw Error("Valid Circle required");
  const circle = circleId.toLowerCase(), endpoint = `/api/circles/${circle}/discussion`;
  const available = typeof newRequestId === "function";
  let generation = 0, active = true, revision = -1, page = null;
  let phase = "locked", busy = false, draft = "", target = null;
  let preview = null, confirmed = false, pending = null, receipt = null;
  let message = available ? "Load the current archive or thread before writing." : "Discussion writing is not connected on this device. Use the member web discussion.";
  const listeners = new Set;
  const current = (g) => active && generation === g;
  const model = () => {
    const canStart = active && available && page !== null && !busy && !pending;
    const canEdit = canStart && phase === "editing";
    return copy2({
      active,
      available,
      phase,
      busy,
      draft,
      target,
      commentLimit: discussionCommentLimit(circle, target?.id ?? null),
      preview,
      confirmed,
      pendingRequestId: pending?.input.requestId ?? null,
      receipt,
      message: available ? message : "Discussion writing is not connected on this device. Use the member web discussion.",
      canStart,
      canEdit,
      canReview: canEdit && formatDiscussionContent(circle, draft, target?.id ?? null) !== null,
      canPost: canStart && phase === "review" && preview !== null && confirmed,
      canCheck: active && !busy && pending !== null,
      canRetry: active && !busy && pending !== null,
      canCancel: active && pending === null && ["editing", "previewing", "review"].includes(phase),
      canNavigate: !busy && pending === null
    });
  };
  const emit = () => {
    for (const listener of listeners)
      listener(model());
  };
  function clear(notice, keepPage = false) {
    generation++;
    busy = false;
    draft = "";
    target = null;
    preview = null;
    confirmed = false;
    pending = null;
    receipt = null;
    phase = "locked";
    if (!keepPage) {
      page = null;
      revision = -1;
    }
    message = notice;
    emit();
  }
  function accept(value, expected) {
    const parsed = parseDiscussionReceipt(value);
    if (!parsed || parsed.circleId !== circle || parsed.requestId !== expected.input.requestId || parsed.message.parentMessageId !== expected.input.parentMessageId || expected.root !== null && parsed.message.rootMessageId !== expected.root || parsed.message.visibility === "visible" && parsed.message.content !== expected.content)
      return false;
    receipt = parsed;
    pending = null;
    preview = null;
    confirmed = false;
    draft = "";
    target = null;
    busy = false;
    phase = "confirmed";
    message = parsed.message.visibility === "visible" ? "Posting confirmed. Open the saved message to check its current thread." : `Posting confirmed. The saved message is currently ${parsed.message.visibility}; its earlier body is not displayed.`;
    return true;
  }
  async function send(exact) {
    if (!active || busy)
      return;
    const g = ++generation;
    pending = exact;
    preview = null;
    confirmed = false;
    draft = "";
    target = null;
    receipt = null;
    busy = true;
    phase = "sending";
    message = "Sending the exact reviewed discussion message…";
    emit();
    try {
      const result = await request(endpoint, { method: "POST", cache: "no-store", redirect: "error", body: exact.body }, () => current(g));
      if (!current(g))
        return;
      if (result.http === 200 && accept(result.body, exact)) {
        emit();
        return;
      }
    } catch {
      if (!current(g))
        return;
    }
    busy = false;
    phase = "unknown";
    message = "Posting is unconfirmed. It may have been saved. Check its receipt or retry this exact reviewed request manually; do not create a duplicate.";
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
    access(next, nextRevision) {
      if (!Number.isSafeInteger(nextRevision) || nextRevision < 0 || next && next.circleId !== circle) {
        clear("Current discussion access could not be verified.");
        return;
      }
      if (revision === nextRevision && Boolean(page) === Boolean(next))
        return;
      if (nextRevision < revision)
        return;
      page = next ? copy2(next) : null;
      revision = nextRevision;
      if (pending || phase === "confirmed" && !next) {
        emit();
        return;
      }
      clear(next ? "Current discussion loaded. Choose a new message or a visible reply target." : "Load current discussion access before writing.", true);
    },
    activity(value) {
      active = value;
      if (!value)
        clear("Private discussion draft, preview and request key cleared while inactive. A sent request may still have been saved.");
      else
        emit();
    },
    retire() {
      clear("Private discussion draft, preview and request key cleared. A sent request may still have been saved. Nothing will reload or retry automatically.");
    },
    close() {
      clear("Discussion writing closed. A request already sent may still have been saved.");
    },
    start(parentId) {
      if (!model().canStart || !page || parentId !== null && !isUuid(parentId))
        return false;
      const candidates = page.kind === "thread" ? [page.root, page.focus, ...page.items] : page.items;
      const selected = parentId === null ? null : candidates.find((item) => item.id === parentId.toLowerCase() && item.visibility === "visible");
      if (parentId !== null && !selected)
        return false;
      clear("Write your own comment, then prepare its exact server preview. Nothing posts until you review and confirm.", true);
      target = selected ? copy2(selected) : null;
      phase = "editing";
      emit();
      return true;
    },
    edit(value) {
      if (!model().canEdit || typeof value !== "string" || value.length > discussionCommentLimit(circle, target?.id ?? null) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
        return false;
      draft = value;
      preview = null;
      confirmed = false;
      emit();
      return true;
    },
    async review() {
      if (!model().canReview || !newRequestId)
        return;
      const g = ++generation, comment = draft.trim(), parentId = target?.id ?? null, root = target?.rootMessageId ?? null;
      preview = null;
      confirmed = false;
      receipt = null;
      busy = true;
      phase = "previewing";
      message = "Preparing the exact message and checking its current target. This does not post…";
      emit();
      try {
        const rawId = await newRequestId();
        if (!current(g))
          return;
        if (!isUuid(rawId))
          throw Error("Request key unavailable");
        const requestId = rawId.toLowerCase();
        const result = await request(`${endpoint}/preview`, {
          method: "POST",
          cache: "no-store",
          redirect: "error",
          body: JSON.stringify({ requestId, comment, parentMessageId: parentId })
        }, () => current(g));
        if (!current(g))
          return;
        const parsed = result.http === 200 ? parseDiscussionPreview(result.body) : null;
        if (!parsed || parsed.circleId !== circle || parsed.requestId !== requestId || parsed.comment !== comment || parsed.parentMessageId !== parentId || root !== null && parsed.parent?.message.rootMessageId !== root) {
          clear("The exact preview or current parent could not be verified. Load the discussion and choose a target again. Nothing was posted.");
          return;
        }
        preview = parsed;
        target = parsed.parent?.message ?? null;
        busy = false;
        phase = "review";
        message = "Review the complete message and its target. It has not been posted.";
        emit();
      } catch {
        if (current(g)) {
          busy = false;
          phase = "editing";
          message = "Preview unavailable. Nothing was posted. Prepare a new preview manually when ready.";
          emit();
        }
      }
    },
    confirm(value) {
      if (active && !busy && !pending && phase === "review" && preview) {
        confirmed = value === true;
        emit();
      }
    },
    post() {
      if (!model().canPost || !preview)
        return Promise.resolve();
      const input = {
        requestId: preview.requestId,
        comment: preview.comment,
        parentMessageId: preview.parentMessageId,
        expectedParentRevision: preview.parent?.revision ?? null,
        expectedParentHash: preview.parent?.contentHash ?? null,
        contentHash: preview.contentHash,
        reviewKey: preview.reviewKey
      };
      return send({ input, body: JSON.stringify(input), content: preview.content, root: preview.parent?.message.rootMessageId ?? null });
    },
    retry() {
      return model().canRetry && pending ? send(pending) : Promise.resolve();
    },
    async lookup() {
      if (!model().canCheck || !pending)
        return;
      const exact = pending, g = ++generation;
      busy = true;
      message = "Checking this request’s receipt without posting…";
      emit();
      try {
        const result = await request(`${endpoint}?requestId=${exact.input.requestId}`, { method: "GET", cache: "no-store", redirect: "error" }, () => current(g));
        if (!current(g))
          return;
        const parsed = result.http === 200 ? parseDiscussionLookup(result.body) : null;
        if (parsed?.circleId === circle && parsed.requestId === exact.input.requestId) {
          if (parsed.receipt && accept(parsed.receipt, exact)) {
            emit();
            return;
          }
          if (parsed.receipt === null) {
            busy = false;
            phase = "unknown";
            message = "No receipt was found at this check. An earlier attempt could still complete. Keep the same key and use only the exact manual retry.";
            emit();
            return;
          }
        }
      } catch {
        if (!current(g))
          return;
      }
      busy = false;
      phase = "unknown";
      message = "The receipt could not be confirmed. No post was sent by this read; the exact pending request is retained.";
      emit();
    },
    cancel() {
      if (model().canCancel)
        clear("Draft and preview cleared. Nothing was posted by this action.", true);
    },
    editReview() {
      if (active && !busy && !pending && phase === "review") {
        generation++;
        preview = null;
        confirmed = false;
        phase = "editing";
        message = "Edit this draft, then prepare a new exact preview.";
        emit();
      }
    }
  };
}

// lib/circles/report.ts
var REPORT_REASONS = ["safety", "harassment", "spam", "misleading", "inappropriate", "other"];
var REPORT_LABELS = {
  safety: "Someone may be unsafe",
  harassment: "Harassment or hateful conduct",
  spam: "Spam or selling",
  misleading: "Fake or misleading circle",
  inappropriate: "Inappropriate content",
  other: "Something else"
};

// lib/circles/message-moderation.ts
var MESSAGE_SAFETY_LIMIT = 25;
var record3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var integer = (value) => Number.isSafeInteger(value) && value >= 0;
var plain2 = (value, min, max) => typeof value === "string" && value.length <= max && value.trim().length >= min && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
var timestamp2 = (value) => typeof value === "string" && value.length <= 64 && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
var hash2 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
var visibility = (value) => value === "visible" || value === "hidden" || value === "withdrawn";
var reason = (value) => typeof value === "string" && REPORT_REASONS.includes(value);
var reasonFor = (action, value) => typeof value === "string" && (action === "hide" ? ["safety", "harassment", "spam", "misleading", "inappropriate"].includes(value) : action === "restore" && ["no_violation", "insufficient_evidence", "resolved"].includes(value));
var unique = (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length;
var cursor = (value) => value === null || isUuid(value);
function explanation(value) {
  if (!record3(value) || !isUuid(value.id) || value.action !== "hide" && value.action !== "restore" || !reasonFor(value.action, value.reason) || !plain2(value.summary, 20, 1000) || !timestamp2(value.created_at))
    return null;
  return { id: value.id, action: value.action, reason: value.reason, summary: value.summary, created_at: value.created_at };
}
function parseMessageSafetyState(value) {
  if (!record3(value) || !isUuid(value.circleId) || !record3(value.message) || !integer(value.revision) || typeof value.canReport !== "boolean" || typeof value.canWithdraw !== "boolean" || !Array.isArray(value.explanations) || value.explanations.length > 100)
    return null;
  const m = value.message;
  if (!isUuid(m.id) || !plain2(m.member_name, 0, 200) || !timestamp2(m.created_at) || typeof m.is_mine !== "boolean" || !visibility(m.visibility) || (m.visibility === "visible" ? !plain2(m.content, 1, 2000) : m.content !== null) || (m.is_mine || m.visibility === "visible" ? !hash2(value.contentHash) : value.contentHash !== null) || value.canReport && (m.is_mine || m.visibility !== "visible") || value.canWithdraw && (!m.is_mine || m.visibility === "withdrawn"))
    return null;
  const explanations = value.explanations.map(explanation);
  if (explanations.some((item) => item === null) || !m.is_mine && explanations.length > 0)
    return null;
  const valid = explanations;
  if (!unique(valid.map((item) => item.id)))
    return null;
  return {
    circleId: value.circleId,
    message: { id: m.id, member_name: m.member_name, content: m.content, created_at: m.created_at, is_mine: m.is_mine, visibility: m.visibility },
    revision: value.revision,
    contentHash: value.contentHash,
    canReport: value.canReport,
    canWithdraw: value.canWithdraw,
    explanations: valid
  };
}
function parseMessageContributions(value) {
  if (!record3(value) || !Array.isArray(value.items) || value.items.length > MESSAGE_SAFETY_LIMIT || !cursor(value.nextCursor))
    return null;
  const items = value.items.map(parseMessageSafetyState);
  if (items.some((item) => !item || !item.message.is_mine))
    return null;
  const valid = items;
  if (!unique(valid.map((item) => item.message.id)) || value.nextCursor !== null && value.nextCursor !== valid.at(-1)?.message.id)
    return null;
  return { items: valid, nextCursor: value.nextCursor };
}
function parseMessageActionReceipt(value) {
  if (!record3(value) || !isUuid(value.requestId) || !isUuid(value.circleId) || !isUuid(value.messageId) || typeof value.replayed !== "boolean" || !(value.received === true && value.withdrawn === undefined || value.withdrawn === true && value.received === undefined))
    return null;
  const state = parseMessageSafetyState(value.state);
  if (!state || state.circleId !== value.circleId || state.message.id !== value.messageId || value.withdrawn === true && state.message.visibility !== "withdrawn")
    return null;
  return {
    requestId: value.requestId,
    circleId: value.circleId,
    messageId: value.messageId,
    state,
    replayed: value.replayed,
    ...value.received === true ? { received: true } : { withdrawn: true }
  };
}
function validateMessageActionInput(value) {
  const invalid = { ok: false, error: "Use a valid post action and refresh its current state." };
  if (!record3(value) || Object.keys(value).some((key) => !["action", "expectedRevision", "contentHash", "requestId", "reason", "note"].includes(key)) || !integer(value.expectedRevision) || !hash2(value.contentHash) || !isUuid(value.requestId))
    return invalid;
  const base = { expectedRevision: value.expectedRevision, contentHash: value.contentHash, requestId: value.requestId };
  if (value.action === "withdraw" && value.reason === undefined && value.note === undefined)
    return { ok: true, value: { ...base, action: "withdraw" } };
  if (value.action !== "report" || !reason(value.reason) || !(value.note === null || value.note === undefined || plain2(value.note, 0, 1000)))
    return invalid;
  return { ok: true, value: { ...base, action: "report", reason: value.reason, note: typeof value.note === "string" && value.note.trim() ? value.note.trim() : null } };
}

// platforms/shared/message-safety.ts
var MESSAGE_REPORT_OPTIONS = REPORT_REASONS.map((value) => ({ value, label: value === "misleading" ? "Misleading content" : REPORT_LABELS[value] }));
var MESSAGE_WITHDRAWAL_PRIVACY = "Withdrawal removes the message from member views. It is not physical erasure: restricted evidence may remain for safety review. The retention policy is not yet finalized.";
var copy3 = (value) => JSON.parse(JSON.stringify(value));
var same2 = (a, b) => a.toLowerCase() === b.toLowerCase();
function createMessageSafety(request, circleId, newRequestId) {
  if (!isUuid(circleId))
    throw Error("Valid Circle required");
  const circle = circleId.toLowerCase(), available = typeof newRequestId === "function";
  let active = true, open = false, busy = false, generation = 0, messageId = null;
  let phase = "closed", state = null;
  let reason = "", note = "", confirmed = false, pending = null, receipt = null;
  let message = "Choose a contribution and explicitly check its current message actions.";
  const listeners = new Set;
  const current = (g) => active && open && generation === g;
  const endpoint = () => `/api/circles/${circle}/messages/${messageId}`;
  const model = () => {
    const ready = active && available && open && !busy && !pending && state !== null && ["ready", "confirmed"].includes(phase);
    return copy3({
      active,
      available,
      open,
      busy,
      phase,
      messageId,
      state,
      reason,
      note,
      confirmed,
      pendingRequestId: pending?.input.requestId ?? null,
      pendingAction: pending?.input.action ?? null,
      receipt,
      message,
      canEditReport: ready && Boolean(state?.canReport),
      canConfirm: ready && Boolean(state?.canReport || state?.canWithdraw),
      canReport: ready && Boolean(state?.canReport && state.contentHash) && reason !== "" && confirmed,
      canWithdraw: ready && Boolean(state?.canWithdraw && state.contentHash) && confirmed,
      canCheck: active && open && !busy && messageId !== null,
      canRetry: active && open && !busy && pending !== null,
      canClose: open && !busy && pending === null,
      canNavigate: !busy && pending === null
    });
  };
  const emit = () => {
    for (const listener of listeners)
      listener(model());
  };
  function clear(notice) {
    generation++;
    open = false;
    busy = false;
    phase = "closed";
    messageId = null;
    state = null;
    reason = "";
    note = "";
    confirmed = false;
    pending = null;
    receipt = null;
    message = notice;
    emit();
  }
  async function check() {
    if (!model().canCheck || !messageId)
      return;
    const id = messageId, g = ++generation;
    busy = true;
    state = null;
    reason = "";
    note = "";
    confirmed = false;
    receipt = null;
    phase = "loading";
    message = "Checking this message and your current action permissions. This read does not confirm an earlier report…";
    emit();
    try {
      const result = await request(endpoint(), { method: "GET", cache: "no-store", redirect: "error" }, () => current(g));
      if (!current(g))
        return;
      const parsed = result.http === 200 ? parseMessageSafetyState(result.body) : null;
      if (parsed && same2(parsed.circleId, circle) && same2(parsed.message.id, id)) {
        state = parsed;
        busy = false;
        phase = pending ? "unknown" : "ready";
        message = pending ? "Current message state loaded. This does not confirm the earlier action. Its exact request is retained for a manual retry." : available ? "Current message loaded. Review this checked version and explicitly confirm any action." : "Current message loaded. Safety actions are not connected on this device; use the member web discussion.";
        emit();
        return;
      }
    } catch {
      if (!current(g))
        return;
    }
    busy = false;
    phase = pending ? "unknown" : "unavailable";
    message = pending ? "Current state could not be checked. The earlier action remains unconfirmed; its exact request is retained." : "Current message information could not be verified. No action has been assumed.";
    emit();
  }
  function accept(value, exact) {
    const parsed = parseMessageActionReceipt(value), id = messageId;
    if (!parsed || !id || !same2(parsed.requestId, exact.input.requestId) || !same2(parsed.circleId, circle) || !same2(parsed.messageId, id) || !same2(parsed.state.circleId, circle) || !same2(parsed.state.message.id, id) || parsed.state.revision < exact.input.expectedRevision || parsed.state.contentHash !== null && parsed.state.contentHash !== exact.input.contentHash || parsed.state.message.is_mine !== exact.isMine || parsed.state.message.visibility === "visible" && exact.content !== null && parsed.state.message.content !== exact.content || (exact.input.action === "withdraw" ? parsed.withdrawn !== true || parsed.state.message.visibility !== "withdrawn" : parsed.received !== true))
      return false;
    state = parsed.state;
    receipt = parsed;
    pending = null;
    busy = false;
    phase = "confirmed";
    message = exact.input.action === "withdraw" ? "Withdrawal confirmed. The message is removed from member views; restricted safety evidence may remain." : "Report received for private human review. A report is an allegation, not a finding.";
    return true;
  }
  async function send(exact) {
    if (!active || !open || busy || !messageId)
      return;
    const g = ++generation;
    pending = exact;
    state = null;
    receipt = null;
    reason = "";
    note = "";
    confirmed = false;
    busy = true;
    phase = "sending";
    message = exact.input.action === "withdraw" ? "Sending the exact reviewed withdrawal…" : "Sending the exact private report for human review…";
    emit();
    try {
      const result = await request(endpoint(), { method: "POST", cache: "no-store", redirect: "error", body: exact.body }, () => current(g));
      if (!current(g))
        return;
      if (result.http === 200 && accept(result.body, exact)) {
        emit();
        return;
      }
    } catch {
      if (!current(g))
        return;
    }
    busy = false;
    phase = "unknown";
    message = "The action is unconfirmed and may have been saved. Only a manual retry of this exact request can confirm its receipt. Checking current state does not prove its outcome.";
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
    async open(id) {
      if (!active || busy || pending || !isUuid(id))
        return;
      clear("Checking the selected contribution.");
      open = true;
      messageId = id.toLowerCase();
      await check();
    },
    refresh: check,
    reason(value) {
      if (!model().canEditReport || value !== "" && !REPORT_REASONS.includes(value))
        return false;
      reason = value;
      confirmed = false;
      emit();
      return true;
    },
    note(value) {
      if (!model().canEditReport || typeof value !== "string" || value.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
        return false;
      note = value;
      confirmed = false;
      emit();
      return true;
    },
    confirm(value) {
      if (model().canConfirm) {
        confirmed = value === true;
        emit();
      }
    },
    async submit(action) {
      if (!state || !newRequestId || (action === "report" ? !model().canReport : action === "withdraw" ? !model().canWithdraw : true))
        return;
      const checked = state, chosenReason = reason, chosenNote = note, g = ++generation;
      busy = true;
      phase = "sending";
      state = null;
      receipt = null;
      reason = "";
      note = "";
      confirmed = false;
      message = "Preparing this exact confirmed action. No request has been sent yet…";
      emit();
      try {
        const key = await newRequestId();
        if (!current(g))
          return;
        if (!isUuid(key))
          throw Error("Request key unavailable");
        const parsed = validateMessageActionInput({
          action,
          expectedRevision: checked.revision,
          contentHash: checked.contentHash,
          requestId: key.toLowerCase(),
          ...action === "report" ? { reason: chosenReason, note: chosenNote.trim() || null } : {}
        });
        if (!parsed.ok)
          throw Error("Action unavailable");
        const input = parsed.value;
        busy = false;
        await send({ input, body: JSON.stringify(input), content: checked.message.content, isMine: checked.message.is_mine });
      } catch {
        if (current(g)) {
          busy = false;
          phase = "unavailable";
          message = "The action could not be prepared. Nothing was sent. Check the current message and decide again.";
          emit();
        }
      }
    },
    retry() {
      return model().canRetry && pending ? send(pending) : Promise.resolve();
    },
    close() {
      if (model().canClose)
        clear("Message actions closed and private details cleared.");
    },
    retire() {
      clear("Private message details, notes and request key cleared. An action already sent may still have been saved. Nothing will retry automatically.");
    },
    activity(value) {
      active = value;
      if (!value)
        clear("Private message details, notes and request key cleared while inactive. An action already sent may still have been saved.");
      else
        emit();
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
  if (config.initialOnline !== undefined && typeof config.initialOnline !== "boolean")
    throw Error("Invalid connectivity state");
  if (config.newRequestId !== undefined && typeof config.newRequestId !== "function")
    throw Error("Invalid request key factory");
  let attached = false, active = true, online = config.initialOnline ?? true, scope = null, unsubscribe = () => {};
  const listeners = new Set;
  const pendingRequests = new Set;
  const abortPending = () => {
    for (const pending of pendingRequests)
      pending.abort();
  };
  const current = (expected) => attached && active && online && scope === expected && config.owner.scope() === expected;
  const request = async (path, options, mayTransmit) => {
    const url = new URL(path, origin), query = parseDiscussionQuery(url.searchParams);
    const discussionPath = `/api/circles/${circleId}/discussion`;
    const discussion = url.pathname === discussionPath && (options.method === "GET" ? query !== null : options.method === "POST" && !url.search);
    const preview = url.pathname === `${discussionPath}/preview` && options.method === "POST" && !url.search;
    const messagePath = /^\/api\/circles\/([^/]+)\/messages\/([^/]+)$/.exec(url.pathname);
    const safety = messagePath && messagePath[1] === circleId && isUuid(messagePath[2]) && !url.search;
    if (path !== url.pathname + url.search || url.hash || url.origin !== origin || !(discussion || preview || safety || path === `/api/book-salons/${circleId}`) || !["GET", "POST"].includes(options.method))
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
        if ([401, 403, 404].includes(response.status)) {
          participation.retire();
          archive.retire();
          threadWrite.retire();
          messageSafety.retire();
        }
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
  const newRequestId = config.newRequestId ? async () => {
    const expected = scope;
    if (!expected || !current(expected))
      throw Error("Circle session unavailable");
    let timer;
    try {
      const value = await Promise.race([Promise.resolve().then(() => {
        if (!current(expected))
          throw Error("Circle session changed");
        return config.newRequestId();
      }), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Request key deadline exceeded")), timeout);
      })]);
      if (!current(expected) || !isUuid(value))
        throw Error("Request key unavailable");
      return value.toLowerCase();
    } finally {
      clearTimeout(timer);
    }
  } : undefined;
  const threadWrite = createThreadWriter(request, circleId, newRequestId);
  const messageSafety = createMessageSafety(request, circleId, newRequestId);
  const model = () => ({
    configured: true,
    connected: attached && scope !== null,
    active,
    online,
    status: !attached || !scope ? "Connect the existing member session to read this circle." : !active ? "Private circle views cleared while inactive." : !online ? "Offline. Private views and draft cleared. Requests already sent may still complete." : "Refresh to check current circle membership.",
    participation: participation.model(),
    archive: archive.model(),
    threadWrite: threadWrite.model(),
    messageSafety: messageSafety.model()
  });
  const emit = () => {
    for (const listener of listeners)
      listener(model());
  };
  participation.subscribe(emit);
  archive.subscribe((value) => {
    threadWrite.access(value.page, value.revision);
    emit();
  });
  threadWrite.subscribe(emit);
  messageSafety.subscribe(emit);
  const setActivity = () => {
    const enabled = attached && active && online && scope !== null;
    participation.activity(enabled);
    archive.activity(enabled);
    threadWrite.activity(enabled);
    messageSafety.activity(enabled);
  };
  const sync = () => {
    abortPending();
    scope = config.owner.scope();
    participation.retire();
    archive.retire();
    threadWrite.retire();
    messageSafety.retire();
    setActivity();
    emit();
  };
  const canNavigate = () => threadWrite.model().canNavigate && messageSafety.model().canNavigate && !participation.model().write.busy;
  const afterWrite = async (operation) => {
    await operation();
    if (threadWrite.model().phase === "confirmed")
      archive.retire("Posting confirmed. Open the saved message for a fresh thread read.");
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
      threadWrite.close();
      messageSafety.retire();
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
      if (scope && current(scope) && canNavigate()) {
        messageSafety.retire();
        archive.close();
        await participation.open();
      }
    },
    async openArchive() {
      if (scope && current(scope) && canNavigate()) {
        messageSafety.retire();
        participation.retire();
        await archive.open();
      }
    },
    archiveNext() {
      if (!canNavigate())
        return Promise.resolve();
      messageSafety.retire();
      return archive.next();
    },
    archiveThread(id) {
      if (!canNavigate())
        return Promise.resolve();
      messageSafety.retire();
      return archive.thread(id);
    },
    edit(value) {
      return canNavigate() && participation.edit(value);
    },
    clearDraft() {
      if (canNavigate())
        participation.clearDraft();
    },
    post() {
      return canNavigate() ? participation.post() : Promise.resolve();
    },
    startNewAfterReview() {
      if (canNavigate())
        participation.startNewAfterReview();
    },
    threadStart(parentId) {
      if (!canNavigate())
        return false;
      const started = threadWrite.start(parentId);
      if (started) {
        messageSafety.retire();
        participation.retire();
      }
      return started;
    },
    threadEdit: threadWrite.edit,
    threadReview: threadWrite.review,
    threadConfirm: threadWrite.confirm,
    threadPost: () => messageSafety.model().canNavigate ? afterWrite(threadWrite.post) : Promise.resolve(),
    threadLookup: () => messageSafety.model().canNavigate ? afterWrite(threadWrite.lookup) : Promise.resolve(),
    threadRetry: () => messageSafety.model().canNavigate ? afterWrite(threadWrite.retry) : Promise.resolve(),
    threadCancel: threadWrite.cancel,
    threadEditReview: threadWrite.editReview,
    async messageOpen(id) {
      if (!scope || !current(scope) || !canNavigate() || !isUuid(id))
        return;
      const page = archive.model().page;
      const items = page?.kind === "thread" ? [page.root, page.focus, ...page.items] : page?.items ?? [];
      if (!items.some((item) => item.id.toLowerCase() === id.toLowerCase()))
        return;
      participation.retire();
      archive.retire();
      threadWrite.retire();
      await messageSafety.open(id);
    },
    messageRefresh: messageSafety.refresh,
    messageReason: messageSafety.reason,
    messageNote: messageSafety.note,
    messageConfirm: messageSafety.confirm,
    messageSubmit: messageSafety.submit,
    messageRetry: messageSafety.retry,
    messageClose: messageSafety.close,
    close() {
      abortPending();
      participation.close();
      archive.close();
      threadWrite.close();
      messageSafety.retire();
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
      return (await owner.credentials(expected))?.bearer ?? null;
    },
    async credentials(expected) {
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
          return { bearer: checkedToken, subject: expectedSubject };
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
    if (!isUuid(v.circleId) || typeof v.origin !== "string" || typeof v.transport !== "function" || typeof v.auth?.getSession !== "function" || typeof v.auth.getUser !== "function" || typeof v.auth.onAuthStateChange !== "function" || v.verificationTimeoutMs !== undefined && (!Number.isSafeInteger(v.verificationTimeoutMs) || Number(v.verificationTimeoutMs) < 1 || Number(v.verificationTimeoutMs) > 60000) || v.newRequestId !== undefined && typeof v.newRequestId !== "function")
      return null;
    return {
      circleId: v.circleId.toLowerCase(),
      origin: approvedOrigin(v.origin),
      auth: v.auth,
      transport: v.transport,
      ...v.verificationTimeoutMs === undefined ? {} : { verificationTimeoutMs: Number(v.verificationTimeoutMs) },
      ...typeof v.newRequestId === "function" ? { newRequestId: v.newRequestId } : {}
    };
  } catch {
    return null;
  }
}
// platforms/shared/member-contributions.ts
var same3 = (a, b) => a.toLowerCase() === b.toLowerCase();
var copy4 = (value) => JSON.parse(JSON.stringify(value));
var listPath = "/api/circles/contributions";
function createMemberContributions(config) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15000;
  if (!config.owner || !["scope", "bearer", "subscribe"].every((key) => typeof config.owner[key] === "function") || typeof config.transport !== "function" || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000 || config.initialOnline !== undefined && typeof config.initialOnline !== "boolean" || config.newRequestId !== undefined && typeof config.newRequestId !== "function")
    throw Error("Verified member connection required");
  let attached = false, active = true, online = config.initialOnline ?? false, scope = null, generation = 0;
  let phase = "closed", loading = false, items = [], nextCursor = null;
  let selected = null, safety = null, offSafety = () => {}, offOwner = () => {};
  let message = "Load your own posted messages when ready. Current Circle membership is not required.";
  const listeners = new Set, requests = new Set;
  const enabled = () => attached && active && online && scope !== null && config.owner.scope() === scope;
  const model = () => {
    const action = safety?.model() ?? null, canNavigate = !loading && (action?.canNavigate ?? true), usable = enabled() && canNavigate;
    return {
      connected: attached && scope !== null,
      active,
      online,
      busy: loading || Boolean(action?.busy),
      phase,
      items: copy4(items),
      nextCursor,
      selected: selected ? { ...selected } : null,
      safety: action,
      message,
      canRefresh: usable,
      canNext: usable && selected === null && phase === "ready" && nextCursor !== null,
      canSelect: usable && selected === null && phase === "ready" && items.length > 0,
      canBack: usable && selected !== null,
      canNavigate
    };
  };
  const emit = () => {
    for (const listener of listeners) {
      try {
        listener(model());
      } catch {}
    }
  };
  function clearSelection() {
    offSafety();
    offSafety = () => {};
    const previous = safety;
    safety = null;
    selected = null;
    previous?.retire();
  }
  function retire(notice) {
    generation++;
    for (const controller of requests)
      controller.abort();
    loading = false;
    items = [];
    nextCursor = null;
    clearSelection();
    phase = attached ? "idle" : "closed";
    message = notice;
    emit();
  }
  const request = async (path, options, mayTransmit) => {
    const after = path.startsWith(listPath + "?after=") ? path.slice((listPath + "?after=").length) : null;
    const listing = options.method === "GET" && (path === listPath || after !== null && isUuid(after) && after === after.toLowerCase());
    const selection = selected ? { ...selected } : null;
    const messagePath = selection ? `/api/circles/${selection.circleId}/messages/${selection.messageId}` : null;
    if (!listing && !(selection && path === messagePath && ["GET", "POST"].includes(options.method)))
      throw Error("Unexpected contribution operation");
    const expected = scope, g = generation, abort = new AbortController;
    const current = () => enabled() && scope === expected && generation === g && !abort.signal.aborted && mayTransmit();
    if (!expected || !current())
      throw Error("Contribution session unavailable");
    requests.add(abort);
    let timer;
    try {
      return await Promise.race([(async () => {
        const bearer = await config.owner.bearer(expected);
        if (!current() || !bearer || bearer.length > 16384 || /[\s\u0000-\u001f\u007f]/.test(bearer))
          throw Error("Contribution session changed");
        const response = await config.transport(origin + path, {
          ...options,
          credentials: "omit",
          signal: abort.signal,
          headers: { Authorization: `Bearer ${bearer}`, ...options.method === "POST" ? { "Content-Type": "application/json" } : {} }
        });
        if (!current() || response.redirected || response.url !== origin + path)
          throw Error("Contribution response refused");
        if ([401, 403, 404].includes(response.status)) {
          retire("Contribution access changed. Private history and action details cleared. A previously sent action may still have completed.");
          throw Error("Contribution access retired");
        }
        const body = await response.json();
        if (!current())
          throw Error("Contribution session retired");
        if (!listing && response.status === 200) {
          const state = options.method === "GET" ? parseMessageSafetyState(body) : parseMessageActionReceipt(body)?.state;
          if (!state || !state.message.is_mine || !same3(state.circleId, selection.circleId) || !same3(state.message.id, selection.messageId)) {
            throw Error("Author contribution not verified");
          }
        }
        return { http: response.status, body };
      })(), new Promise((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(Error("Contribution deadline"));
        }, timeout);
      })]);
    } finally {
      clearTimeout(timer);
      requests.delete(abort);
    }
  };
  const newRequestId = config.newRequestId ? async () => {
    const expected = scope, g = generation;
    const current = () => enabled() && scope === expected && generation === g;
    if (!expected || !current())
      throw Error("Contribution session unavailable");
    let timer;
    try {
      const id = await Promise.race([Promise.resolve().then(() => {
        if (!current())
          throw Error("Contribution session retired");
        return config.newRequestId();
      }), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Request key deadline")), timeout);
      })]);
      if (!current() || !isUuid(id))
        throw Error("Request key unavailable");
      return id.toLowerCase();
    } finally {
      clearTimeout(timer);
    }
  } : undefined;
  async function load(after) {
    if (!model().canRefresh)
      return;
    const g = ++generation;
    clearSelection();
    items = [];
    nextCursor = null;
    loading = true;
    phase = "loading";
    message = "Loading your own posted messages…";
    emit();
    const current = () => enabled() && generation === g;
    try {
      const result = await request(listPath + (after ? "?after=" + after : ""), { method: "GET", cache: "no-store", redirect: "error" }, current);
      if (!current())
        return;
      const parsed = result.http === 200 ? parseMessageContributions(result.body) : null;
      let previous = after;
      if (!parsed || parsed.items.some((item) => {
        const id = item.message.id.toLowerCase(), invalid = previous !== null && id <= previous;
        previous = id;
        return invalid;
      }))
        throw Error("Contribution page not verified");
      items = parsed.items;
      nextCursor = parsed.nextCursor?.toLowerCase() ?? null;
      loading = false;
      phase = "ready";
      message = items.length ? "Your posted messages are shown below. Select one to check its current author controls." : "No posted messages were returned on this page. Refresh to check your history again.";
      emit();
    } catch {
      if (!current())
        return;
      loading = false;
      phase = "unavailable";
      message = "Your posted messages could not be verified. Refresh manually when ready.";
      emit();
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
    connect() {
      if (attached)
        return;
      attached = true;
      offOwner = config.owner.subscribe(() => {
        scope = config.owner.scope();
        retire("Account changed. Load your posted messages again when ready.");
      });
      scope = config.owner.scope();
      retire("Load your own posted messages when ready. Current Circle membership is not required.");
    },
    disconnect() {
      attached = false;
      scope = null;
      offOwner();
      offOwner = () => {};
      retire("Private contribution view closed. A previously sent action may still have completed.");
    },
    activity(value) {
      active = value;
      if (!value)
        retire("Private posted messages cleared while inactive. A previously sent action may still have completed.");
      else
        emit();
    },
    connectivity(value) {
      online = value;
      if (!value)
        retire("Private posted messages cleared while offline. Reconnect, then load them manually.");
      else
        emit();
    },
    refresh: () => load(null),
    next() {
      const cursor = model().canNext ? nextCursor : null;
      return cursor ? load(cursor) : Promise.resolve();
    },
    async select(circleId, messageId) {
      if (!model().canSelect || !isUuid(circleId) || !isUuid(messageId) || !items.some((item) => same3(item.circleId, circleId) && same3(item.message.id, messageId)))
        return;
      const g = ++generation;
      items = [];
      nextCursor = null;
      clearSelection();
      selected = { circleId: circleId.toLowerCase(), messageId: messageId.toLowerCase() };
      const action = createMessageSafety(request, selected.circleId, newRequestId);
      safety = action;
      action.activity(enabled());
      const stop = action.subscribe(emit);
      if (!enabled() || generation !== g || safety !== action) {
        stop();
        return;
      }
      offSafety = stop;
      phase = "idle";
      message = "Checking current author controls for the selected contribution.";
      emit();
      if (enabled() && generation === g && safety === action)
        await action.open(messageId.toLowerCase());
    },
    back() {
      if (model().canBack) {
        generation++;
        clearSelection();
        phase = "idle";
        message = "Message details cleared. Load your posted messages again when ready.";
        emit();
      }
    },
    check() {
      return safety?.refresh() ?? Promise.resolve();
    },
    confirm(value) {
      safety?.confirm(value);
    },
    withdraw() {
      return safety?.submit("withdraw") ?? Promise.resolve();
    },
    retry() {
      return safety?.retry() ?? Promise.resolve();
    },
    close() {
      retire("Private contribution view closed. A previously sent action may still have completed. Nothing retries automatically.");
    }
  };
}
export {
  MESSAGE_REPORT_OPTIONS,
  MESSAGE_WITHDRAWAL_PRIVACY,
  approvedOrigin,
  createCircleHost,
  createMemberContributions,
  createVerifiedSupabaseCircleOwner,
  memberCircleConfig
};
