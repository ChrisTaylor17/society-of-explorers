// lib/members/public-reference.ts
var lowerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function parsePublicProfileReference(value) {
  if (value === void 0 || value === null) return null;
  return typeof value === "string" && lowerUuid.test(value) ? value : void 0;
}

// platforms/native/src/circles/path.ts
var CIRCLE_BOOK_ID = "soe-circles-path";

// platforms/native/src/circles/discussion-reader.ts
var object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
var text = (x, max) => typeof x === "string" && x.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
var id = (x) => typeof x === "string" && /^[A-Za-z0-9._:-]{1,100}$/.test(x);
var copy = (x) => JSON.parse(JSON.stringify(x));
function discussionMessageFrom(value) {
  if (!object(value) || !id(value.id) || !text(value.member_name, 200) || !text(value.content, 2e3) || !text(value.created_at, 64) || !Number.isFinite(Date.parse(value.created_at)) || typeof value.is_mine !== "boolean") return null;
  const publicProfileId = parsePublicProfileReference(value.publicProfileId);
  if (publicProfileId === void 0 || publicProfileId !== null && value.visibility !== "visible") return null;
  return { publicProfileId, id: value.id, member_name: value.member_name, content: value.content, created_at: value.created_at, is_mine: value.is_mine };
}
function safePrivateMeetingUrl(value) {
  if (typeof value !== "string" || value.length > 2048)
    return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
function conversationFrom(value, circleId) {
  if (!object(value) || !object(value.cohort) || value.cohort.id !== circleId || value.cohort.book_id !== CIRCLE_BOOK_ID || !text(value.cohort.title, 200) || !Array.isArray(value.messages) || value.messages.length > 100)
    return null;
  const messages = [], seen = /* @__PURE__ */ new Set();
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
  const listeners = /* @__PURE__ */ new Set(), model = () => copy(s), emit = () => {
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
var CIRCLE_MESSAGE_LIMIT = 2e3;
var record = (x) => !!x && typeof x === "object" && !Array.isArray(x);
var valid = (value) => value.trim().length > 0 && value.length <= CIRCLE_MESSAGE_LIMIT && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
function createCircleDiscussionComposer(gateway, circleId) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(circleId)) throw Error("Explicit circle UUID required");
  let generation = 0, disposed = false, pending = false, reviewRequired = false;
  let readRevision = 0, reviewAfterRevision = 0;
  let state = {
    active: true,
    ready: false,
    phase: "locked",
    draft: "",
    message: "Read the current conversation to check membership before writing."
  };
  const listeners = /* @__PURE__ */ new Set();
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
    if (!disposed) for (const listener of listeners) listener(model());
  };
  const current = (value) => !disposed && generation === value && state.active && state.ready;
  function retire(message = "Private draft cleared. Read the conversation again before writing.") {
    if (disposed) return;
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
    access(ready, revision3) {
      if (disposed) return;
      if (!Number.isSafeInteger(revision3) || revision3 < readRevision || ready && revision3 === 0) ready = false;
      else readRevision = revision3;
      if (!ready && state.ready) {
        if (!pending && state.phase === "confirmed") {
          generation++;
          state.ready = false;
          state.draft = "";
          state.message = "Message posted. Check the conversation for the latest view.";
          emit();
        } else retire();
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
      if (disposed) return;
      state.active = active;
      if (!active) retire("Private draft cleared while inactive. Refresh access when you return.");
      else emit();
    },
    retire,
    edit(value) {
      if (!model().canEdit) return false;
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
      if (!model().canEdit) return;
      state.draft = "";
      state.message = "Draft cleared. Posted messages are unchanged.";
      emit();
    },
    async send() {
      if (!model().canSend) return "ignored";
      const content = state.draft.trim(), operation = ++generation;
      pending = true;
      state.phase = "sending";
      state.message = "Posting to this circle\u2026";
      emit();
      try {
        const reply = await gateway.send(circleId, content, () => current(operation));
        pending = false;
        if (!current(operation)) {
          if (reviewRequired) reviewAfterRevision = readRevision;
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
          if (reviewRequired) reviewAfterRevision = readRevision;
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
      if (!model().canStartNew) return false;
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
  return { send: (circleId, content, mayTransmit) => request(
    `/api/book-salons/${encodeURIComponent(circleId)}`,
    { method: "POST", cache: "no-store", redirect: "error", body: JSON.stringify({ content }) },
    mayTransmit
  ) };
}

// platforms/native/src/circles/participation-session.ts
function createCircleParticipationSession(request, circleId) {
  let generation = 0, active = true, disposed = false, syncDepth = 0;
  const listeners = /* @__PURE__ */ new Set();
  const guardedRequest = (path, options, mayTransmit = () => true) => {
    const operation = generation;
    return request(path, options, () => !disposed && active && operation === generation && mayTransmit());
  };
  const reader = createCircleDiscussionReader(createCircleDiscussionGateway((path, options) => guardedRequest(path, options, () => true)), circleId);
  const composer = createCircleDiscussionComposer(createCircleMessageGateway(guardedRequest), circleId);
  const model = () => ({ circleId, read: reader.model(), write: composer.model() });
  const emit = () => {
    if (!disposed && syncDepth === 0) for (const listener of listeners) listener(model());
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
      if (disposed) return () => {
      };
      listeners.add(listener);
      listener(model());
      return () => {
        listeners.delete(listener);
      };
    },
    async open() {
      if (!disposed && active && !composer.model().busy) await reader.open();
    },
    async refresh() {
      if (!disposed && active && !composer.model().busy) await reader.refresh();
    },
    edit(value) {
      return !disposed && composer.edit(value);
    },
    clearDraft() {
      if (!disposed) composer.clear();
    },
    async post() {
      if (disposed || !active) return "ignored";
      const operation = generation;
      const outcome = await composer.send();
      if (disposed || operation !== generation || !active) return "ignored";
      if (outcome === "confirmed") await reader.refresh();
      if (disposed || operation !== generation || !active) return "ignored";
      return outcome;
    },
    startNewAfterReview() {
      return !disposed && composer.startNewAfterReview();
    },
    retire() {
      if (!disposed) retire();
    },
    close() {
      if (!disposed) close();
    },
    activity(isActive) {
      if (disposed) return;
      if (!isActive) generation++;
      active = isActive;
      batch(() => {
        composer.activity(isActive);
        reader.activity(isActive ? "active" : "inactive");
      });
    },
    dispose() {
      if (disposed) return;
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
var DISCUSSION_MESSAGE_LIMIT = 2e3;
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
  if (!value.trim() || value.includes("@") || /[\r\n\t]/u.test(value)) return "Explorer";
  let result = "";
  for (const character of value.trim()) {
    if (result.length + character.length > 200) break;
    result += character;
  }
  return result || "Explorer";
}
function discussionHref(circleId, messageId) {
  if (!uuid(circleId) || messageId !== void 0 && messageId !== null && !uuid(messageId)) throw Error("Invalid discussion locator");
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
  if (!uuid(circleId) || parentMessageId !== null && !uuid(parentMessageId) || !plain(comment, DISCUSSION_MESSAGE_LIMIT)) return null;
  const normalized = comment.trim();
  if (!normalized || normalized.length > discussionCommentLimit(circleId, parentMessageId)) return null;
  const suffix = discussionContentSuffix(circleId, parentMessageId);
  return suffix ? `${normalized}

${suffix}` : normalized;
}
function parseDiscussionQuery(params) {
  if (Array.from(params.keys()).some((key) => params.getAll(key).length !== 1)) return null;
  if (params.has("requestId")) return params.size === 1 && uuid(params.get("requestId")) ? { kind: "receipt", requestId: params.get("requestId").toLowerCase() } : null;
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? DISCUSSION_PAGE_LIMIT : /^[1-9][0-9]*$/u.test(rawLimit) ? Number(rawLimit) : NaN;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DISCUSSION_PAGE_LIMIT) return null;
  if (params.has("message")) {
    if (Array.from(params.keys()).some((key) => !["message", "after", "limit"].includes(key)) || !uuid(params.get("message")) || params.has("after") && !uuid(params.get("after"))) return null;
    return { kind: "thread", messageId: params.get("message").toLowerCase(), after: params.get("after")?.toLowerCase() ?? null, limit };
  }
  if (Array.from(params.keys()).some((key) => !["before", "limit"].includes(key)) || params.has("before") && !uuid(params.get("before"))) return null;
  return { kind: "archive", before: params.get("before")?.toLowerCase() ?? null, limit };
}
function discussionSearchParams(query) {
  const params = new URLSearchParams();
  if (query.kind === "thread") {
    params.set("message", query.messageId);
    if (query.after) params.set("after", query.after);
  } else if (query.before) params.set("before", query.before);
  if (query.limit !== DISCUSSION_PAGE_LIMIT) params.set("limit", String(query.limit));
  const parsed = parseDiscussionQuery(params);
  if (!parsed || parsed.kind !== query.kind) throw Error("Invalid discussion page");
  return params;
}
function parseThreadMessage(value) {
  if (!record2(value) || !uuid(value.id) || !plain(value.member_name, 400) || value.created_at !== null && !timestamp(value.created_at) || typeof value.is_mine !== "boolean" || !["visible", "hidden", "withdrawn", "unavailable"].includes(String(value.visibility)) || !uuid(value.rootMessageId) || value.parentMessageId !== null && !uuid(value.parentMessageId)) return null;
  const publicProfileId = parsePublicProfileReference(value.publicProfileId);
  if (publicProfileId === void 0 || value.visibility !== "visible" && publicProfileId !== null) return null;
  const id2 = value.id.toLowerCase(), root = value.rootMessageId.toLowerCase(), parent = value.parentMessageId === null ? null : value.parentMessageId.toLowerCase();
  if (parent === null ? root !== id2 : parent === id2 || root === id2) return null;
  if (value.visibility === "visible" ? !timestamp(value.created_at) || !plain(value.content, DISCUSSION_MESSAGE_LIMIT) || !value.content.trim() : value.content !== null) return null;
  return {
    id: id2,
    rootMessageId: root,
    parentMessageId: parent,
    member_name: displayName(value.member_name),
    publicProfileId,
    content: value.content,
    created_at: value.created_at,
    is_mine: value.is_mine,
    visibility: value.visibility
  };
}
function parseDiscussionPage(value, expected) {
  if (!record2(value) || !["archive", "thread"].includes(String(value.kind)) || !uuid(value.circleId) || !Number.isSafeInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > DISCUSSION_PAGE_LIMIT || !Array.isArray(value.items) || value.items.length > Number(value.limit) || value.nextCursor !== null && !uuid(value.nextCursor)) return null;
  const circleId = value.circleId.toLowerCase(), limit = Number(value.limit);
  if (expected?.circleId && !same(expected.circleId, circleId) || expected?.kind && expected.kind !== value.kind || expected?.limit && expected.limit !== limit) return null;
  const items = [], seen = /* @__PURE__ */ new Set();
  for (const raw of value.items) {
    const item = parseThreadMessage(raw);
    if (!item || seen.has(item.id)) return null;
    seen.add(item.id);
    items.push(item);
  }
  const nextCursor = value.nextCursor === null ? null : value.nextCursor.toLowerCase();
  if (nextCursor && (items.length !== limit || items.at(-1)?.id !== nextCursor)) return null;
  if (value.kind === "archive") {
    if (expected?.before && (nextCursor === expected.before.toLowerCase() || seen.has(expected.before.toLowerCase()))) return null;
    return { kind: "archive", circleId, items, nextCursor, limit };
  }
  const root = parseThreadMessage(value.root), focus = parseThreadMessage(value.focus);
  if (!root || root.parentMessageId !== null || !focus || focus.rootMessageId !== root.id || expected?.messageId && !same(focus.id, expected.messageId) || items.some((item) => item.id === root.id || item.rootMessageId !== root.id || item.parentMessageId === null) || expected?.after && (nextCursor === expected.after.toLowerCase() || seen.has(expected.after.toLowerCase()))) return null;
  return { kind: "thread", circleId, root, focus, items, nextCursor, limit };
}
function parseDiscussionTarget(value) {
  if (!record2(value) || !uuid(value.circleId) || !Object.hasOwn(value, "target")) return null;
  if (value.target === null) return { circleId: value.circleId.toLowerCase(), target: null };
  const raw = value.target;
  if (!record2(raw) || !revision(raw.revision) || !hash(raw.contentHash)) return null;
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
  if (!record2(value) || !uuid(value.circleId) || !hash(value.contentHash) || !hash(value.reviewKey) || !plain(value.content, DISCUSSION_MESSAGE_LIMIT)) return null;
  const base = validateDiscussionPreviewInput({ requestId: value.requestId, comment: value.comment, parentMessageId: value.parentMessageId });
  const parent = parseDiscussionTarget({ circleId: value.circleId, target: value.parent });
  if (!base.ok || !parent || value.comment !== base.value.comment || (parent.target?.message.id ?? null) !== base.value.parentMessageId || formatDiscussionContent(value.circleId, base.value.comment, base.value.parentMessageId) !== value.content || value.commentLimit !== discussionCommentLimit(value.circleId, base.value.parentMessageId)) return null;
  return { ...base.value, circleId: value.circleId.toLowerCase(), parent: parent.target, content: value.content, contentHash: value.contentHash, reviewKey: value.reviewKey, commentLimit: Number(value.commentLimit) };
}
function parseDiscussionReceipt(value) {
  if (!record2(value) || value.outcome !== "confirmed" || !uuid(value.circleId) || !uuid(value.requestId) || typeof value.replayed !== "boolean") return null;
  const message = parseThreadMessage(value.message);
  return message?.is_mine ? { outcome: "confirmed", circleId: value.circleId.toLowerCase(), requestId: value.requestId.toLowerCase(), replayed: value.replayed, message } : null;
}
function parseDiscussionLookup(value) {
  if (!record2(value) || !uuid(value.circleId) || !uuid(value.requestId) || !Object.hasOwn(value, "receipt")) return null;
  const receipt = value.receipt === null ? null : parseDiscussionReceipt(value.receipt);
  if (value.receipt !== null && (!receipt || !same(receipt.circleId, value.circleId) || !same(receipt.requestId, value.requestId) || !receipt.replayed)) return null;
  return { circleId: value.circleId.toLowerCase(), requestId: value.requestId.toLowerCase(), receipt };
}

// platforms/shared/archive.ts
function createDiscussionArchive(request, circleId) {
  if (!isUuid(circleId)) throw Error("Valid Circle required");
  const circle = circleId.toLowerCase();
  let generation = 0, selection = null, following = false;
  let state = { open: false, active: true, busy: false, phase: "closed", page: null, revision: 0, message: "Open the complete discussion archive to check current access." };
  const listeners = /* @__PURE__ */ new Set();
  const model = () => JSON.parse(JSON.stringify(state));
  const emit = () => {
    for (const listener of listeners) listener(model());
  };
  const current = (g) => g === generation && state.open && state.active;
  function retire(message = "Private archive cleared. Check current Circle access again.") {
    generation++;
    selection = null;
    state = { ...state, revision: state.revision + 1, busy: false, page: null, phase: state.open ? "paused" : "closed", message };
    emit();
  }
  function requestPage(query, mayTransmit) {
    const params = discussionSearchParams(query), suffix = params.size ? `?${params}` : "";
    return request(`/api/circles/${circle}/discussion${suffix}`, { method: "GET", cache: "no-store", redirect: "error" }, mayTransmit);
  }
  async function read(query) {
    if (!state.active || state.busy) return;
    const g = ++generation;
    selection = null;
    state = { ...state, revision: state.revision + 1, open: true, busy: true, phase: "loading", page: null, message: "Checking current membership and loading discussion." };
    emit();
    try {
      const reply = await requestPage(query, () => current(g));
      if (!current(g)) return;
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
      } else {
        selection = { ...query };
        state = { ...state, busy: false, phase: "ready", page, message: page.kind === "thread" ? "Current thread loaded. Hidden or withdrawn messages stay restricted." : "Current archive page loaded. Older messages are available through pagination." };
      }
      emit();
    } catch {
      if (current(g)) {
        state = { ...state, busy: false, phase: "unavailable", page: null, message: "Discussion read is unavailable. Try an explicit refresh when ready." };
        emit();
      }
    }
  }
  async function followLatest(mayFollow) {
    const query = selection;
    if (following || state.busy || !state.active || state.phase !== "ready" || query?.kind !== "archive" || query.before !== null || !mayFollow()) return;
    const g = generation;
    const allowed = () => current(g) && mayFollow();
    const paused = "Live discussion paused. Open the archive to check current access again.";
    following = true;
    try {
      const reply = await requestPage(query, allowed);
      if (!allowed()) return;
      const page = reply.http === 200 ? parseDiscussionPage(reply.body, { ...query, circleId: circle }) : null;
      if (!page) {
        retire(paused);
        return;
      }
      if (JSON.stringify(page) === JSON.stringify(state.page)) return;
      state = { ...state, page, revision: state.revision + 1 };
      emit();
    } catch {
      if (allowed()) retire(paused);
    } finally {
      following = false;
    }
  }
  return {
    model,
    currentQuery: () => selection ? { ...selection } : null,
    restore(query) {
      const parsed = parseDiscussionQuery(discussionSearchParams(query));
      return parsed && parsed.kind !== "receipt" ? read(parsed) : Promise.resolve();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(model());
      return () => {
        listeners.delete(listener);
      };
    },
    open: () => read({ kind: "archive", before: null, limit: 25 }),
    followLatest,
    thread(messageId) {
      if (!isUuid(messageId)) return Promise.resolve();
      return read({ kind: "thread", messageId: messageId.toLowerCase(), after: null, limit: 25 });
    },
    next() {
      const p = state.page;
      if (!p?.nextCursor) return Promise.resolve();
      return read(p.kind === "archive" ? { kind: "archive", before: p.nextCursor, limit: p.limit } : { kind: "thread", messageId: p.focus.id, after: p.nextCursor, limit: p.limit });
    },
    retire,
    activity(active) {
      state.active = active;
      if (!active) retire("Private archive cleared while inactive. Refresh current access when you return.");
      else emit();
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
  if (!isUuid(circleId)) throw Error("Valid Circle required");
  const circle = circleId.toLowerCase(), endpoint = `/api/circles/${circle}/discussion`;
  const available = typeof newRequestId === "function";
  let generation = 0, active = true, revision3 = -1, page = null;
  let phase = "locked", busy = false, draft = "", target = null;
  let preview = null, confirmed = false, pending = null, receipt = null;
  let message = available ? "Load the current archive or thread before writing." : "Discussion writing is not connected on this device. Use the member web discussion.";
  const listeners = /* @__PURE__ */ new Set();
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
    for (const listener of listeners) listener(model());
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
      revision3 = -1;
    }
    message = notice;
    emit();
  }
  function accept(value, expected) {
    const parsed = parseDiscussionReceipt(value);
    if (!parsed || parsed.circleId !== circle || parsed.requestId !== expected.input.requestId || parsed.message.parentMessageId !== expected.input.parentMessageId || expected.root !== null && parsed.message.rootMessageId !== expected.root || parsed.message.visibility === "visible" && parsed.message.content !== expected.content) return false;
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
  async function send(exact3) {
    if (!active || busy) return;
    const g = ++generation;
    pending = exact3;
    preview = null;
    confirmed = false;
    draft = "";
    target = null;
    receipt = null;
    busy = true;
    phase = "sending";
    message = "Sending the exact reviewed discussion message\u2026";
    emit();
    try {
      const result = await request(endpoint, { method: "POST", cache: "no-store", redirect: "error", body: exact3.body }, () => current(g));
      if (!current(g)) return;
      if (result.http === 200 && accept(result.body, exact3)) {
        emit();
        return;
      }
    } catch {
      if (!current(g)) return;
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
      if (revision3 === nextRevision && Boolean(page) === Boolean(next)) return;
      if (nextRevision < revision3) return;
      page = next ? copy2(next) : null;
      revision3 = nextRevision;
      if (pending || phase === "confirmed" && !next) {
        emit();
        return;
      }
      clear(next ? "Current discussion loaded. Choose a new message or a visible reply target." : "Load current discussion access before writing.", true);
    },
    activity(value) {
      active = value;
      if (!value) clear("Private discussion draft, preview and request key cleared while inactive. A sent request may still have been saved.");
      else emit();
    },
    retire() {
      clear("Private discussion draft, preview and request key cleared. A sent request may still have been saved. Nothing will reload or retry automatically.");
    },
    close() {
      clear("Discussion writing closed. A request already sent may still have been saved.");
    },
    start(parentId) {
      if (!model().canStart || !page || parentId !== null && !isUuid(parentId)) return false;
      const candidates = page.kind === "thread" ? [page.root, page.focus, ...page.items] : page.items;
      const selected = parentId === null ? null : candidates.find((item) => item.id === parentId.toLowerCase() && item.visibility === "visible");
      if (parentId !== null && !selected) return false;
      clear("Write your own comment, then prepare its exact server preview. Nothing posts until you review and confirm.", true);
      target = selected ? copy2(selected) : null;
      phase = "editing";
      emit();
      return true;
    },
    edit(value) {
      if (!model().canEdit || typeof value !== "string" || value.length > discussionCommentLimit(circle, target?.id ?? null) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return false;
      draft = value;
      preview = null;
      confirmed = false;
      emit();
      return true;
    },
    async review() {
      if (!model().canReview || !newRequestId) return;
      const g = ++generation, comment = draft.trim(), parentId = target?.id ?? null, root = target?.rootMessageId ?? null;
      preview = null;
      confirmed = false;
      receipt = null;
      busy = true;
      phase = "previewing";
      message = "Preparing the exact message and checking its current target. This does not post\u2026";
      emit();
      try {
        const rawId = await newRequestId();
        if (!current(g)) return;
        if (!isUuid(rawId)) throw Error("Request key unavailable");
        const requestId = rawId.toLowerCase();
        const result = await request(`${endpoint}/preview`, {
          method: "POST",
          cache: "no-store",
          redirect: "error",
          body: JSON.stringify({ requestId, comment, parentMessageId: parentId })
        }, () => current(g));
        if (!current(g)) return;
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
      if (!model().canPost || !preview) return Promise.resolve();
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
      if (!model().canCheck || !pending) return;
      const exact3 = pending, g = ++generation;
      busy = true;
      message = "Checking this request\u2019s receipt without posting\u2026";
      emit();
      try {
        const result = await request(`${endpoint}?requestId=${exact3.input.requestId}`, { method: "GET", cache: "no-store", redirect: "error" }, () => current(g));
        if (!current(g)) return;
        const parsed = result.http === 200 ? parseDiscussionLookup(result.body) : null;
        if (parsed?.circleId === circle && parsed.requestId === exact3.input.requestId) {
          if (parsed.receipt && accept(parsed.receipt, exact3)) {
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
        if (!current(g)) return;
      }
      busy = false;
      phase = "unknown";
      message = "The receipt could not be confirmed. No post was sent by this read; the exact pending request is retained.";
      emit();
    },
    cancel() {
      if (model().canCancel) clear("Draft and preview cleared. Nothing was posted by this action.", true);
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
var MESSAGE_BLOCK_CONFIRMATION = "I checked this message and will choose an action below.";
var MESSAGE_BLOCK_PRIVACY = "Blocking hides this member\u2019s Circle posts and stops direct messages and direct replies between you. Manage your blocks under Members \u2192 Chat \u2192 Blocked members on the web.";
var record3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var integer = (value) => Number.isSafeInteger(value) && value >= 0;
var plain2 = (value, min, max) => typeof value === "string" && value.length <= max && value.trim().length >= min && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
var timestamp2 = (value) => typeof value === "string" && value.length <= 64 && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
var hash2 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
var visibility = (value) => value === "visible" || value === "hidden" || value === "withdrawn";
var reason = (value) => typeof value === "string" && REPORT_REASONS.includes(value);
var reasonFor = (action, value) => typeof value === "string" && (action === "hide" ? ["safety", "harassment", "spam", "misleading", "inappropriate"].includes(value) : action === "restore" && ["no_violation", "insufficient_evidence", "resolved"].includes(value));
var unique = (ids) => new Set(ids.map((id2) => id2.toLowerCase())).size === ids.length;
var cursor = (value) => value === null || isUuid(value);
function explanation(value) {
  if (!record3(value) || !isUuid(value.id) || value.action !== "hide" && value.action !== "restore" || !reasonFor(value.action, value.reason) || !plain2(value.summary, 20, 1e3) || !timestamp2(value.created_at)) return null;
  return { id: value.id, action: value.action, reason: value.reason, summary: value.summary, created_at: value.created_at };
}
function parseMessageSafetyState(value) {
  if (!record3(value) || !isUuid(value.circleId) || !record3(value.message) || !integer(value.revision) || typeof value.canReport !== "boolean" || typeof value.canWithdraw !== "boolean" || !Array.isArray(value.explanations) || value.explanations.length > 100) return null;
  const m = value.message;
  if (!isUuid(m.id) || !plain2(m.member_name, 0, 200) || !timestamp2(m.created_at) || typeof m.is_mine !== "boolean" || !visibility(m.visibility) || (m.visibility === "visible" ? !plain2(m.content, 1, 2e3) : m.content !== null) || (m.is_mine || m.visibility === "visible" ? !hash2(value.contentHash) : value.contentHash !== null) || value.canReport && (m.is_mine || m.visibility !== "visible") || value.canWithdraw && (!m.is_mine || m.visibility === "withdrawn")) return null;
  const publicProfileId = parsePublicProfileReference(m.publicProfileId);
  if (publicProfileId === void 0 || m.visibility !== "visible" && publicProfileId !== null) return null;
  const block = value.blockReview;
  let blockReview;
  if (block !== void 0) {
    if (!record3(block) || !isUuid(block.memberId) || !integer(block.revision) || block.revision >= Number.MAX_SAFE_INTEGER || m.is_mine || m.visibility !== "visible") return null;
    blockReview = { memberId: block.memberId.toLowerCase(), revision: block.revision };
  }
  const explanations = value.explanations.map(explanation);
  if (explanations.some((item) => item === null) || !m.is_mine && explanations.length > 0) return null;
  const valid2 = explanations;
  if (!unique(valid2.map((item) => item.id))) return null;
  return {
    circleId: value.circleId,
    message: { id: m.id, member_name: m.member_name, publicProfileId, content: m.content, created_at: m.created_at, is_mine: m.is_mine, visibility: m.visibility },
    revision: value.revision,
    contentHash: value.contentHash,
    canReport: value.canReport,
    canWithdraw: value.canWithdraw,
    explanations: valid2,
    ...blockReview ? { blockReview } : {}
  };
}
function parseMessageContributions(value) {
  if (!record3(value) || !Array.isArray(value.items) || value.items.length > MESSAGE_SAFETY_LIMIT || !cursor(value.nextCursor)) return null;
  const items = value.items.map(parseMessageSafetyState);
  if (items.some((item) => !item || !item.message.is_mine)) return null;
  const valid2 = items;
  if (!unique(valid2.map((item) => item.message.id)) || value.nextCursor !== null && value.nextCursor !== valid2.at(-1)?.message.id) return null;
  return { items: valid2, nextCursor: value.nextCursor };
}
function parseMessageActionReceipt(value) {
  if (!record3(value) || !isUuid(value.requestId) || !isUuid(value.circleId) || !isUuid(value.messageId) || typeof value.replayed !== "boolean" || !(value.received === true && value.withdrawn === void 0 || value.withdrawn === true && value.received === void 0)) return null;
  const state = parseMessageSafetyState(value.state);
  if (!state || state.circleId !== value.circleId || state.message.id !== value.messageId || value.withdrawn === true && state.message.visibility !== "withdrawn") return null;
  return {
    requestId: value.requestId,
    circleId: value.circleId,
    messageId: value.messageId,
    state,
    replayed: value.replayed,
    ...value.received === true ? { received: true } : { withdrawn: true }
  };
}
function parseMessageBlockInput(value) {
  if (!record3(value) || Object.keys(value).length !== 6 || value.action !== "block" || !isUuid(value.expectedMemberId) || !integer(value.expectedBlockRevision) || value.expectedBlockRevision >= Number.MAX_SAFE_INTEGER || !integer(value.expectedRevision) || !hash2(value.contentHash) || !isUuid(value.requestId)) return null;
  return {
    action: "block",
    expectedMemberId: value.expectedMemberId.toLowerCase(),
    expectedBlockRevision: value.expectedBlockRevision,
    expectedRevision: value.expectedRevision,
    contentHash: value.contentHash,
    requestId: value.requestId.toLowerCase()
  };
}
function messageBlockInput(state, requestId) {
  if (!state.blockReview) return null;
  return parseMessageBlockInput({
    action: "block",
    expectedMemberId: state.blockReview.memberId,
    expectedBlockRevision: state.blockReview.revision,
    expectedRevision: state.revision,
    contentHash: state.contentHash,
    requestId
  });
}
function parseMessageBlockReceipt(value, input, circleId, messageId) {
  if (!record3(value) || value.requestId !== input.requestId || value.circleId !== circleId.toLowerCase() || value.messageId !== messageId.toLowerCase() || value.blockedByMe !== true || value.revision !== input.expectedBlockRevision + 1 || !isUuid(value.blockId)) return null;
  return {
    requestId: input.requestId,
    circleId: value.circleId,
    messageId: value.messageId,
    blockedByMe: true,
    revision: value.revision,
    blockId: value.blockId
  };
}
function validateMessageActionInput(value) {
  const invalid = { ok: false, error: "Use a valid post action and refresh its current state." };
  if (!record3(value) || Object.keys(value).some((key) => !["action", "expectedRevision", "contentHash", "requestId", "reason", "note"].includes(key)) || !integer(value.expectedRevision) || !hash2(value.contentHash) || !isUuid(value.requestId)) return invalid;
  const base = { expectedRevision: value.expectedRevision, contentHash: value.contentHash, requestId: value.requestId };
  if (value.action === "withdraw" && value.reason === void 0 && value.note === void 0) return { ok: true, value: { ...base, action: "withdraw" } };
  if (value.action !== "report" || !reason(value.reason) || !(value.note === null || value.note === void 0 || plain2(value.note, 0, 1e3))) return invalid;
  return { ok: true, value: { ...base, action: "report", reason: value.reason, note: typeof value.note === "string" && value.note.trim() ? value.note.trim() : null } };
}

// platforms/shared/message-safety.ts
var MESSAGE_REPORT_OPTIONS = REPORT_REASONS.map((value) => ({ value, label: value === "misleading" ? "Misleading content" : REPORT_LABELS[value] }));
var MESSAGE_WITHDRAWAL_PRIVACY = "Withdrawal removes the message from member views. It is not physical erasure: restricted evidence may remain for safety review. The retention policy is not yet finalized.";
var copy3 = (value) => JSON.parse(JSON.stringify(value));
var same2 = (a, b) => a.toLowerCase() === b.toLowerCase();
function createMessageSafety(request, circleId, newRequestId) {
  if (!isUuid(circleId)) throw Error("Valid Circle required");
  const circle = circleId.toLowerCase(), available = typeof newRequestId === "function";
  let active = true, open = false, busy = false, generation = 0, messageId = null;
  let phase = "closed", state = null;
  let reason2 = "", note = "", confirmed = false, pending = null, receipt = null;
  let message = "Choose a contribution and explicitly check its current message actions.";
  const listeners = /* @__PURE__ */ new Set();
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
      reason: reason2,
      note,
      confirmed,
      pendingRequestId: pending?.input.requestId ?? null,
      pendingAction: pending?.input.action ?? null,
      receipt,
      message,
      canEditReport: ready && Boolean(state?.canReport),
      canConfirm: ready && Boolean(state?.canReport || state?.canWithdraw || state?.blockReview),
      canReport: ready && Boolean(state?.canReport && state.contentHash) && reason2 !== "" && confirmed,
      canWithdraw: ready && Boolean(state?.canWithdraw && state.contentHash) && confirmed,
      canBlock: ready && Boolean(state?.blockReview && state.contentHash) && confirmed,
      // A committed block makes state return 404. Preserve the pending exact
      // retry without asking the host to reopen the old private post.
      canCheck: active && open && !busy && messageId !== null && pending?.input.action !== "block" && (phase !== "confirmed" || state !== null),
      canRetry: active && open && !busy && pending !== null,
      canClose: open && !busy && pending === null,
      canNavigate: !busy && pending === null
    });
  };
  const emit = () => {
    for (const listener of listeners) listener(model());
  };
  function clear(notice) {
    generation++;
    open = false;
    busy = false;
    phase = "closed";
    messageId = null;
    state = null;
    reason2 = "";
    note = "";
    confirmed = false;
    pending = null;
    receipt = null;
    message = notice;
    emit();
  }
  async function check() {
    if (!model().canCheck || !messageId) return;
    const id2 = messageId, g = ++generation;
    busy = true;
    state = null;
    reason2 = "";
    note = "";
    confirmed = false;
    receipt = null;
    phase = "loading";
    message = "Checking this message and your current action permissions. This read does not confirm an earlier report\u2026";
    emit();
    try {
      const result = await request(endpoint(), { method: "GET", cache: "no-store", redirect: "error" }, () => current(g));
      if (!current(g)) return;
      const parsed = result.http === 200 ? parseMessageSafetyState(result.body) : null;
      if (parsed && same2(parsed.circleId, circle) && same2(parsed.message.id, id2)) {
        state = parsed;
        busy = false;
        phase = pending ? "unknown" : "ready";
        message = pending ? "Current message state loaded. This does not confirm the earlier action. Its exact request is retained for a manual retry." : available ? "Current message loaded. Review this checked version and explicitly confirm any action." : "Current message loaded. Safety actions are not connected on this device; use the member web discussion.";
        emit();
        return;
      }
    } catch {
      if (!current(g)) return;
    }
    busy = false;
    phase = pending ? "unknown" : "unavailable";
    message = pending ? "Current state could not be checked. The earlier action remains unconfirmed; its exact request is retained." : "Current message information could not be verified. No action has been assumed.";
    emit();
  }
  function accept(value, exact3) {
    const id2 = messageId;
    if (!id2) return false;
    if (exact3.input.action === "block") {
      if (!parseMessageBlockReceipt(value, exact3.input, circle, id2)) return false;
      state = null;
      receipt = null;
      pending = null;
      busy = false;
      phase = "confirmed";
      message = "Member blocked. Open the current discussion to continue. Manage your blocks under Members \u2192 Chat \u2192 Blocked members on the web.";
      return true;
    }
    const parsed = parseMessageActionReceipt(value);
    if (!parsed || !same2(parsed.requestId, exact3.input.requestId) || !same2(parsed.circleId, circle) || !same2(parsed.messageId, id2) || !same2(parsed.state.circleId, circle) || !same2(parsed.state.message.id, id2) || parsed.state.revision < exact3.input.expectedRevision || parsed.state.contentHash !== null && parsed.state.contentHash !== exact3.input.contentHash || parsed.state.message.is_mine !== exact3.isMine || parsed.state.message.visibility === "visible" && exact3.content !== null && parsed.state.message.content !== exact3.content || (exact3.input.action === "withdraw" ? parsed.withdrawn !== true || parsed.state.message.visibility !== "withdrawn" : parsed.received !== true)) return false;
    state = parsed.state;
    receipt = parsed;
    pending = null;
    busy = false;
    phase = "confirmed";
    message = exact3.input.action === "withdraw" ? "Withdrawal confirmed. The message is removed from member views; restricted safety evidence may remain." : "Report received for private human review. A report is an allegation, not a finding.";
    return true;
  }
  async function send(exact3) {
    if (!active || !open || busy || !messageId) return;
    const g = ++generation;
    pending = exact3;
    state = null;
    receipt = null;
    reason2 = "";
    note = "";
    confirmed = false;
    busy = true;
    phase = "sending";
    message = exact3.input.action === "block" ? "Sending the reviewed block\u2026" : exact3.input.action === "withdraw" ? "Sending the exact reviewed withdrawal\u2026" : "Sending the exact private report for human review\u2026";
    emit();
    try {
      const result = await request(endpoint(), { method: "POST", cache: "no-store", redirect: "error", body: exact3.body }, () => current(g));
      if (!current(g)) return;
      if (result.http === 200 && accept(result.body, exact3)) {
        emit();
        return;
      }
      if (exact3.input.action === "block" && [400, 401, 403, 404, 409].includes(result.http)) {
        pending = null;
        busy = false;
        phase = "unavailable";
        message = "Block unconfirmed. Check the current discussion and your blocked members before deciding again.";
        emit();
        return;
      }
    } catch {
      if (!current(g)) return;
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
    async open(id2) {
      if (!active || busy || pending || !isUuid(id2)) return;
      clear("Checking the selected contribution.");
      open = true;
      messageId = id2.toLowerCase();
      await check();
    },
    refresh: check,
    reason(value) {
      if (!model().canEditReport || value !== "" && !REPORT_REASONS.includes(value)) return false;
      reason2 = value;
      confirmed = false;
      emit();
      return true;
    },
    note(value) {
      if (!model().canEditReport || typeof value !== "string" || value.length > 1e3 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return false;
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
      const { canReport, canWithdraw, canBlock } = model();
      if (!state || !newRequestId || !{ report: canReport, withdraw: canWithdraw, block: canBlock }[action]) return;
      const checked = state, chosenReason = reason2, chosenNote = note, g = ++generation;
      busy = true;
      phase = "sending";
      state = null;
      receipt = null;
      reason2 = "";
      note = "";
      confirmed = false;
      message = "Preparing this exact confirmed action. No request has been sent yet\u2026";
      emit();
      try {
        const key = await newRequestId();
        if (!current(g)) return;
        if (!isUuid(key)) throw Error("Request key unavailable");
        if (action === "block") {
          const input2 = messageBlockInput(checked, key);
          if (!input2) throw Error("Block unavailable");
          busy = false;
          await send({ input: input2, body: JSON.stringify(input2), content: null, isMine: false });
          return;
        }
        const parsed = validateMessageActionInput({
          action,
          expectedRevision: checked.revision,
          contentHash: checked.contentHash,
          requestId: key.toLowerCase(),
          ...action === "report" ? { reason: chosenReason, note: chosenNote.trim() || null } : {}
        });
        if (!parsed.ok) throw Error("Action unavailable");
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
      if (model().canClose) clear("Message actions closed and private details cleared.");
    },
    retire() {
      clear("Private message details, notes and request key cleared. An action already sent may still have been saved. Nothing will retry automatically.");
    },
    activity(value) {
      active = value;
      if (!value) clear("Private message details, notes and request key cleared while inactive. An action already sent may still have been saved.");
      else emit();
    }
  };
}

// lib/auth/browserIntent.ts
var AUTH_INTENT_HEADER = "x-soe-auth-intent";
var EXPECTED_MEMBER_HEADER = "x-soe-expected-member";
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function parseBrowserIntent(value) {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

// platforms/native/src/circles/host.ts
function hasCircleAuthority(owner) {
  return typeof owner?.scope === "function" && typeof owner.subscribe === "function" && typeof owner.bearer === "function" !== (typeof owner.browserAuthority === "function");
}
var validBearer = (value) => typeof value === "string" && value.length > 0 && value.length <= 16384 && !/[\s\u0000-\u001f\u007f]/.test(value);
async function circleAuthorizationHeaders(owner, expectedScope) {
  if (owner.browserAuthority) {
    const value = await owner.browserAuthority(expectedScope);
    if (!value || !parseBrowserIntent(value.intent) || !isUuid(value.memberId) || value.bearer !== void 0 && !validBearer(value.bearer)) return null;
    return {
      [AUTH_INTENT_HEADER]: value.intent,
      [EXPECTED_MEMBER_HEADER]: value.memberId,
      ...value.bearer ? { Authorization: `Bearer ${value.bearer}` } : {}
    };
  }
  const bearer = await owner.bearer(expectedScope);
  return validBearer(bearer) ? { Authorization: `Bearer ${bearer}` } : null;
}
function approvedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw Error("Explicit HTTPS application origin required");
  return url.origin;
}
function createCircleHost(config) {
  if (!isUuid(config?.circleId) || !hasCircleAuthority(config.owner) || typeof config.transport !== "function") throw Error("Existing session owner and approved transport required");
  const circleId = config.circleId.toLowerCase();
  const origin = approvedOrigin(config.origin);
  const timeout = config.timeoutMs ?? 15e3;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 6e4) throw Error("Invalid deadline");
  if (config.initialOnline !== void 0 && typeof config.initialOnline !== "boolean") throw Error("Invalid connectivity state");
  if (config.newRequestId !== void 0 && typeof config.newRequestId !== "function") throw Error("Invalid request key factory");
  let attached = false, active = true, online = config.initialOnline ?? true, scope = null, unsubscribe = () => {
  };
  const listeners = /* @__PURE__ */ new Set();
  const pendingRequests = /* @__PURE__ */ new Set();
  const abortPending = () => {
    for (const pending of pendingRequests) pending.abort();
  };
  const current = (expected) => attached && active && online && scope === expected && config.owner.scope() === expected;
  const request = async (path, options, mayTransmit) => {
    const url = new URL(path, origin), query = parseDiscussionQuery(url.searchParams);
    const discussionPath = `/api/circles/${circleId}/discussion`;
    const discussion = url.pathname === discussionPath && (options.method === "GET" ? query !== null : options.method === "POST" && !url.search);
    const preview = url.pathname === `${discussionPath}/preview` && options.method === "POST" && !url.search;
    const messagePath = /^\/api\/circles\/([^/]+)\/messages\/([^/]+)$/.exec(url.pathname);
    const safety = messagePath && messagePath[1] === circleId && isUuid(messagePath[2]) && !url.search;
    if (path !== url.pathname + url.search || url.hash || url.origin !== origin || !(discussion || preview || safety || path === `/api/book-salons/${circleId}`) || !["GET", "POST"].includes(options.method)) throw Error("Unexpected Circle operation");
    const expected = scope;
    if (!expected || !current(expected) || !mayTransmit()) throw Error("Circle session unavailable");
    const abort = new AbortController();
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
        const headers = await circleAuthorizationHeaders(config.owner, expected);
        if (!headers || abort.signal.aborted || !current(expected) || !mayTransmit()) throw Error("Circle session changed");
        const response = await config.transport(origin + path, {
          ...options,
          credentials: "omit",
          signal: abort.signal,
          headers: { ...headers, ...options.method === "POST" ? { "Content-Type": "application/json" } : {} }
        });
        if (response.redirected || response.url !== origin + path) throw Error("Unexpected Circle response origin");
        if (abort.signal.aborted || !current(expected) || !mayTransmit()) throw Error("Circle lifetime ended");
        if ([401, 403, 404].includes(response.status)) {
          participation.retire();
          archive.retire();
          threadWrite.retire();
          messageSafety.retire();
        }
        const body = await response.json();
        if (abort.signal.aborted || !current(expected) || !mayTransmit()) throw Error("Circle lifetime ended");
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
    if (!expected || !current(expected)) throw Error("Circle session unavailable");
    let timer;
    try {
      const value = await Promise.race([Promise.resolve().then(() => {
        if (!current(expected)) throw Error("Circle session changed");
        return config.newRequestId();
      }), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Request key deadline exceeded")), timeout);
      })]);
      if (!current(expected) || !isUuid(value)) throw Error("Request key unavailable");
      return value.toLowerCase();
    } finally {
      clearTimeout(timer);
    }
  } : void 0;
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
    for (const listener of listeners) listener(model());
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
    if (threadWrite.model().phase === "confirmed") archive.retire("Posting confirmed. Open the saved message for a fresh thread read.");
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
      if (attached) return;
      attached = true;
      unsubscribe = config.owner.subscribe(sync);
      sync();
    },
    disconnect() {
      abortPending();
      attached = false;
      scope = null;
      unsubscribe();
      unsubscribe = () => {
      };
      participation.close();
      archive.close();
      threadWrite.close();
      messageSafety.retire();
      setActivity();
      emit();
    },
    activity(value) {
      if (!value) abortPending();
      active = value;
      setActivity();
      emit();
    },
    connectivity(value) {
      if (!value) abortPending();
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
    async followLatestArchive(mayFollow) {
      const expected = scope;
      if (!expected) return;
      await archive.followLatest(() => current(expected) && mayFollow() && canNavigate() && !messageSafety.model().open && threadWrite.model().phase === "locked");
    },
    archiveSelection: () => archive.currentQuery(),
    async restoreArchive(query) {
      if (scope && current(scope) && canNavigate()) {
        messageSafety.retire();
        participation.retire();
        await archive.restore(query);
      }
    },
    archiveNext() {
      if (!canNavigate()) return Promise.resolve();
      messageSafety.retire();
      return archive.next();
    },
    archiveThread(id2) {
      if (!canNavigate()) return Promise.resolve();
      messageSafety.retire();
      return archive.thread(id2);
    },
    edit(value) {
      return canNavigate() && participation.edit(value);
    },
    clearDraft() {
      if (canNavigate()) participation.clearDraft();
    },
    post() {
      return canNavigate() ? participation.post() : Promise.resolve();
    },
    startNewAfterReview() {
      if (canNavigate()) participation.startNewAfterReview();
    },
    threadStart(parentId) {
      if (!canNavigate()) return false;
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
    async messageOpen(id2) {
      if (!scope || !current(scope) || !canNavigate() || !isUuid(id2)) return;
      const page = archive.model().page;
      const items = page?.kind === "thread" ? [page.root, page.focus, ...page.items] : page?.items ?? [];
      if (!items.some((item) => item.id.toLowerCase() === id2.toLowerCase())) return;
      participation.retire();
      archive.retire();
      threadWrite.retire();
      await messageSafety.open(id2);
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
var VERIFY_EVENTS = /* @__PURE__ */ new Set(["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "MFA_CHALLENGE_VERIFIED"]);
function createVerifiedMemberSession(source, { timeoutMs = 5e3 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 6e4) throw Error("Invalid verification deadline");
  let started = false, active = true, inAuthCallback = false, lifetime = 0, generation = 0, sequence = 0;
  let subject = null, scope = null, operation = null;
  let unsubscribe = null, scheduled;
  let phase = "stopped", message = "Existing member session is not connected.";
  const ownerListeners = /* @__PURE__ */ new Set(), listeners = /* @__PURE__ */ new Set();
  const model = () => ({ phase, active, busy: phase === "checking", canCheck: started && active && phase !== "checking", message });
  const notify = () => {
    for (const f of ownerListeners) {
      try {
        f();
      } catch {
      }
    }
    for (const f of listeners) {
      try {
        f(model());
      } catch {
      }
    }
  };
  const cancelScheduled = () => {
    clearTimeout(scheduled);
    scheduled = void 0;
  };
  function clear(next, text3, checking = false) {
    const transition = ++generation;
    scope = null;
    subject = null;
    operation = checking ? transition : null;
    phase = next;
    message = text3;
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
    if (unsubscribe) return true;
    const run = lifetime;
    try {
      const result = source.onAuthStateChange((event) => {
        if (!started || lifetime !== run) return;
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
          if (!current(transition) || lifetime !== run) return;
          scheduled = setTimeout(() => {
            scheduled = void 0;
            void check();
          }, 0);
        } finally {
          inAuthCallback = wasInAuthCallback;
        }
      });
      if (typeof result?.data?.subscription?.unsubscribe !== "function") throw Error("Subscription unavailable");
      const detach = () => result.data.subscription.unsubscribe();
      if (!started || lifetime !== run) {
        try {
          detach();
        } catch {
        }
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
    if (!started || !active || inAuthCallback || operation !== null) return;
    cancelScheduled();
    const beforeAttach = generation;
    if (!attach() || !started || !active || generation !== beforeAttach) return;
    const g = clear("checking", "Checking the existing member session. Circle membership still requires a fresh read.", true);
    if (!current(g)) return;
    try {
      const verified = await deadline(() => source.verify(() => current(g)));
      if (!current(g)) return;
      operation = null;
      if (!verified) {
        clear("signed_out", "No active member session. Use the existing app sign-in, then check again.");
        return;
      }
      if (!identity(verified.subject)) throw Error("Identity not confirmed");
      subject = verified.subject;
      scope = `verified-owner-${++sequence}`;
      phase = "ready";
      message = "Provider session checked. Refresh Circle access to confirm current membership.";
      notify();
    } catch {
      if (current(g)) clear("unavailable", "Could not confirm the existing member session. Check again when available.");
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
    async credentials(expected) {
      const g = generation, expectedSubject = subject;
      if (!current(g) || !scope || expected !== scope || !expectedSubject || phase !== "ready") return null;
      try {
        const valid2 = () => current(g) && scope === expected;
        const verified = await deadline(() => source.verify(valid2, expectedSubject));
        if (!valid2()) return null;
        if (verified?.subject !== expectedSubject) throw Error("Session changed");
        return verified.credentials;
      } catch {
        if (current(g) && scope === expected) clear("unavailable", "Session access could not be confirmed. Check the existing session before continuing.");
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
      if (started) return;
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
      if (value === active) return;
      active = value;
      cancelScheduled();
      if (started) clear("paused", value ? "Check the existing member session again before continuing." : "Private session access cleared while inactive. Check the existing session when you return.");
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
      } catch {
      }
    }
  };
}
function createVerifiedSupabaseCircleOwner(auth, options) {
  if (!auth || typeof auth.getSession !== "function" || typeof auth.getUser !== "function" || typeof auth.onAuthStateChange !== "function") throw Error("Existing verifying auth client required");
  const binding = createVerifiedMemberSession({
    async verify(current, expectedSubject) {
      const result = await auth.getSession();
      if (!current() || result.error) throw Error("Session unavailable");
      const session = result.data.session;
      if (!session) return null;
      if (!sessionValid(session) || expectedSubject && session.user.id !== expectedSubject) throw Error("Session unavailable");
      const bearer = session.access_token, subject = session.user.id;
      const reply = await auth.getUser(bearer);
      if (!current() || session.access_token !== bearer || session.user?.id !== subject || reply.error || reply.data.user?.id !== subject) throw Error("Identity not confirmed");
      return { subject, credentials: { bearer, subject } };
    },
    onAuthStateChange: (listener) => auth.onAuthStateChange(listener)
  }, options);
  const owner = {
    ...binding.owner,
    async bearer(expected) {
      return (await binding.owner.credentials(expected))?.bearer ?? null;
    }
  };
  return { ...binding, owner };
}

// platforms/shared/bootstrap.ts
function memberCircleConfig(input) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const v = input;
    if (!isUuid(v.circleId) || typeof v.origin !== "string" || typeof v.transport !== "function" || typeof v.auth?.getSession !== "function" || typeof v.auth.getUser !== "function" || typeof v.auth.onAuthStateChange !== "function" || v.verificationTimeoutMs !== void 0 && (!Number.isSafeInteger(v.verificationTimeoutMs) || Number(v.verificationTimeoutMs) < 1 || Number(v.verificationTimeoutMs) > 6e4) || v.newRequestId !== void 0 && typeof v.newRequestId !== "function") return null;
    return {
      circleId: v.circleId.toLowerCase(),
      origin: approvedOrigin(v.origin),
      auth: v.auth,
      transport: v.transport,
      ...v.verificationTimeoutMs === void 0 ? {} : { verificationTimeoutMs: Number(v.verificationTimeoutMs) },
      ...typeof v.newRequestId === "function" ? { newRequestId: v.newRequestId } : {}
    };
  } catch {
    return null;
  }
}

// lib/circles/message-ai.ts
var MESSAGE_AI_POLICY = "anthropic-message-review-v1";

// lib/circles/message-ai-consent.ts
var MESSAGE_AI_POLICY_HREF = "/circles/message-ai-policy";
var record4 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var revision2 = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
var hash3 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
function parseMessageAiConsent(value) {
  if (!record4(value) || !isUuid(value.circleId) || !isUuid(value.messageId) || typeof value.allowed !== "boolean" || !revision2(value.consentRevision) || value.policy !== MESSAGE_AI_POLICY || !hash3(value.contentHash) || !revision2(value.messageRevision) || typeof value.canEnable !== "boolean") return null;
  return {
    circleId: value.circleId.toLowerCase(),
    messageId: value.messageId.toLowerCase(),
    allowed: value.allowed,
    consentRevision: value.consentRevision,
    policy: MESSAGE_AI_POLICY,
    contentHash: value.contentHash,
    messageRevision: value.messageRevision,
    canEnable: value.canEnable
  };
}
function parseMessageAiConsentInput(value) {
  if (!record4(value) || Object.keys(value).length !== 4 || !["expectedConsentRevision", "contentHash", "policy", "allowed"].every((key) => Object.hasOwn(value, key)) || !revision2(value.expectedConsentRevision) || !hash3(value.contentHash) || value.policy !== MESSAGE_AI_POLICY || typeof value.allowed !== "boolean") return null;
  return {
    expectedConsentRevision: value.expectedConsentRevision,
    contentHash: value.contentHash,
    policy: MESSAGE_AI_POLICY,
    allowed: value.allowed
  };
}
function sameMessageAiConsent(a, b) {
  return a.circleId === b.circleId && a.messageId === b.messageId && a.allowed === b.allowed && a.consentRevision === b.consentRevision && a.policy === b.policy && a.contentHash === b.contentHash && a.messageRevision === b.messageRevision && a.canEnable === b.canEnable;
}

// platforms/shared/message-ai-consent.ts
var MESSAGE_AI_DISCLOSURE = {
  intro: "Optional for this message only. Human review does not require this permission, and choosing not to allow it carries no review penalty.",
  provider: "An assigned reviewer may send this message\u2019s text to Anthropic\u2019s Claude for advisory safety review. We do not add your profile or author name, but names or other personal details may be present in your text. Anthropic may retain data under its terms, including safety and legal exceptions. This is not anonymous or zero-retention processing.",
  revocation: "Revoking blocks new requests. A request already in progress may still transmit or complete; text already sent cannot be recalled. AI advice does not decide whether a message is hidden or restored.",
  confirmation: "I read this policy and allow this message\u2019s text to be sent to Anthropic for advisory review.",
  retirement: "Closing or leaving clears these local settings. A decision already sent may still finish. After returning, check settings and explicitly choose your preference. Nothing is retried automatically."
};
var copy4 = (value) => JSON.parse(JSON.stringify(value));
var record5 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
function createMessageAiConsent(request, circleId, messageId, contextRevision, initialUncertain = false) {
  if (typeof request !== "function" || !isUuid(circleId) || !isUuid(messageId) || !Number.isSafeInteger(contextRevision) || contextRevision < 0 || typeof initialUncertain !== "boolean") throw Error("Verified message context required");
  const circle = circleId.toLowerCase(), id2 = messageId.toLowerCase(), endpoint = `/api/circles/${circle}/messages/${id2}/ai-consent`;
  let active = false, closed = false, busy = false, generation = 0, interaction = 0, confirmed = false, uncertain = initialUncertain;
  let state = null, phase = "idle";
  let message = "Check this message\u2019s current AI review settings before choosing. A change sent earlier may still finish.";
  const listeners = /* @__PURE__ */ new Set();
  const model = () => {
    const ready = active && !closed && !busy && state !== null && (phase === "ready" || phase === "confirmed") && state.consentRevision < Number.MAX_SAFE_INTEGER;
    return copy4({
      active: active && !closed,
      busy,
      phase,
      state,
      confirmed,
      uncertain,
      message,
      canCheck: active && !closed && !busy,
      canConfirm: ready && state.canEnable,
      canKeepOff: ready,
      canAllow: ready && state.canEnable && confirmed,
      canNavigate: !busy,
      action: { circleId: circle, messageId: id2, contextRevision, interactionRevision: interaction }
    });
  };
  const emit = () => {
    for (const listener of listeners) {
      try {
        listener(model());
      } catch {
      }
    }
  };
  const current = (g) => active && !closed && generation === g;
  const sameAction = (action) => record5(action) && Object.keys(action).sort().join(",") === "circleId,contextRevision,interactionRevision,messageId" && action.circleId === circle && action.messageId === id2 && action.contextRevision === contextRevision && action.interactionRevision === interaction;
  const matches = (value) => value.circleId === circle && value.messageId === id2;
  const advance = () => {
    generation++;
    interaction++;
  };
  function clear(notice) {
    advance();
    busy = false;
    state = null;
    confirmed = false;
    phase = closed ? "closed" : "idle";
    message = notice;
    emit();
  }
  function unavailable(unknown, status) {
    interaction++;
    busy = false;
    state = null;
    confirmed = false;
    phase = unknown || uncertain ? "unknown" : "unavailable";
    message = status === 401 ? "Sign in again before checking your message\u2019s AI review settings." : status === 403 || status === 404 ? "These settings are not available to this account. Private settings are cleared." : unknown || uncertain ? "The change could not be confirmed and may still finish. Check current settings, then explicitly keep future AI review off or allow it. Nothing is retried automatically." : "AI review settings could not be verified. Permission is not being assumed. Check again when available.";
    emit();
  }
  async function check(action) {
    if (!sameAction(action) || !model().canCheck) return;
    advance();
    const g = generation;
    busy = true;
    state = null;
    confirmed = false;
    phase = "loading";
    message = "Checking AI review settings\u2026";
    emit();
    try {
      if (!current(g)) return;
      const result = await request(endpoint, { method: "GET", cache: "no-store", redirect: "error" }, () => current(g));
      if (!current(g)) return;
      const value = result.http === 200 ? parseMessageAiConsent(result.body) : null;
      if (!value || !matches(value)) return unavailable(false, result.http);
      state = value;
      busy = false;
      phase = "ready";
      interaction++;
      message = uncertain ? "The earlier change is still uncertain. This read does not cancel it. Choose a new decision below to settle your preference." : "Current saved settings are shown. A change sent earlier may still finish. Choose a decision below to settle your preference.";
      emit();
    } catch {
      if (current(g)) unavailable(false);
    }
  }
  async function change(allowed, action) {
    if (typeof allowed !== "boolean" || !sameAction(action) || !state || !(allowed ? model().canAllow : model().canKeepOff)) return;
    const checked = state;
    advance();
    const g = generation;
    busy = true;
    state = null;
    confirmed = false;
    uncertain = true;
    phase = "sending";
    message = allowed ? "Saving permission for this message\u2026" : "Saving your choice to keep future AI review off\u2026";
    emit();
    try {
      if (!current(g)) return;
      const result = await request(endpoint, { method: "POST", cache: "no-store", redirect: "error", body: JSON.stringify({
        expectedConsentRevision: checked.consentRevision,
        contentHash: checked.contentHash,
        policy: MESSAGE_AI_POLICY,
        allowed
      }) }, () => current(g));
      if (!current(g)) return;
      const receipt = result.http === 200 ? parseMessageAiConsent(result.body) : null;
      if (!receipt || !matches(receipt) || receipt.allowed !== allowed || receipt.contentHash !== checked.contentHash || receipt.consentRevision !== checked.consentRevision + 1 || receipt.messageRevision < checked.messageRevision) return unavailable(true, result.http);
      phase = "checking";
      interaction++;
      message = "Permission receipt received. Reading current settings to verify\u2026";
      emit();
      if (!current(g)) return;
      const fresh = await request(endpoint, { method: "GET", cache: "no-store", redirect: "error" }, () => current(g));
      if (!current(g)) return;
      const value = fresh.http === 200 ? parseMessageAiConsent(fresh.body) : null;
      if (!value || !matches(value) || !sameMessageAiConsent(value, receipt)) return unavailable(true, fresh.http);
      state = value;
      busy = false;
      uncertain = false;
      phase = "confirmed";
      interaction++;
      message = allowed ? "Permission confirmed for this message. This setting does not itself send the message." : "Future AI review is confirmed off. A review request already in progress may still transmit or complete; text already sent to Anthropic cannot be recalled.";
      emit();
    } catch {
      if (current(g)) unavailable(true);
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
    check,
    change,
    confirm(value, action) {
      if (typeof value !== "boolean" || !sameAction(action) || !model().canConfirm || value === confirmed) return false;
      interaction++;
      confirmed = value;
      emit();
      return true;
    },
    activity(value) {
      if (closed || typeof value !== "boolean" || active === value) return;
      active = value;
      if (!value) clear("AI review settings cleared while inactive. A decision already sent may still finish. Check settings and choose again after returning.");
      else {
        interaction++;
        emit();
      }
    },
    retire() {
      if (closed) return;
      closed = true;
      active = false;
      clear("AI review settings closed. A decision already sent may still finish. Nothing is retried automatically.");
      listeners.clear();
    }
  };
}

// platforms/shared/member-contributions.ts
var same3 = (a, b) => a.toLowerCase() === b.toLowerCase();
var copy5 = (value) => JSON.parse(JSON.stringify(value));
var listPath = "/api/circles/contributions";
function createMemberContributions(config) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15e3;
  if (!hasCircleAuthority(config.owner) || typeof config.transport !== "function" || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 6e4 || config.initialOnline !== void 0 && typeof config.initialOnline !== "boolean" || config.aiConsent !== void 0 && typeof config.aiConsent !== "boolean" || config.newRequestId !== void 0 && typeof config.newRequestId !== "function") throw Error("Verified member connection required");
  let attached = false, active = true, online = config.initialOnline ?? false, scope = null, generation = 0;
  let phase = "closed", loading = false, items = [], nextCursor = null;
  let selected = null, safety = null, offSafety = () => {
  }, offOwner = () => {
  };
  let aiConsent = null, offConsent = () => {
  }, consentContext = 0, consentUncertain = false, actionTransition = false;
  let message = "Load your own posted messages when ready. Current Circle membership is not required.";
  const listeners = /* @__PURE__ */ new Set(), requests = /* @__PURE__ */ new Set();
  const enabled = () => attached && active && online && scope !== null && config.owner.scope() === scope;
  const model = () => {
    const action = safety?.model() ?? null, consent = aiConsent?.model() ?? null;
    const canNavigate = !loading && (action?.canNavigate ?? true) && !consent?.busy, usable = enabled() && canNavigate;
    const projectedSafety = action && consent?.busy ? { ...action, canCheck: false, canConfirm: false, canWithdraw: false, canRetry: false, canClose: false, canNavigate: false } : action;
    return {
      connected: attached && scope !== null,
      active,
      online,
      busy: loading || Boolean(action?.busy || consent?.busy),
      phase,
      items: copy5(items),
      nextCursor,
      selected: selected ? { ...selected } : null,
      safety: projectedSafety,
      aiConsent: consent,
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
      } catch {
      }
    }
  };
  function clearConsent() {
    offConsent();
    offConsent = () => {
    };
    const previous = aiConsent;
    aiConsent = null;
    if (previous) {
      consentUncertain = previous.model().uncertain;
      previous.retire();
    }
  }
  function authorReady() {
    const action = safety?.model();
    return enabled() && selected !== null && !!action?.state?.message.is_mine && !action.busy && action.pendingRequestId === null && same3(action.state.circleId, selected.circleId) && same3(action.state.message.id, selected.messageId) && ["ready", "confirmed"].includes(action.phase);
  }
  function syncConsent() {
    if (!config.aiConsent || !authorReady() || !selected) {
      clearConsent();
      return;
    }
    if (aiConsent) return;
    const context = ++consentContext, g = generation;
    const child = createMessageAiConsent(request, selected.circleId, selected.messageId, context, consentUncertain);
    aiConsent = child;
    child.activity(true);
    const stop = child.subscribe((value) => {
      consentUncertain = value.uncertain;
      emit();
    });
    if (aiConsent !== child || generation !== g || !authorReady()) {
      stop();
      if (aiConsent === child) clearConsent();
      return;
    }
    offConsent = stop;
  }
  function clearSelection() {
    clearConsent();
    consentUncertain = false;
    offSafety();
    offSafety = () => {
    };
    const previous = safety;
    safety = null;
    selected = null;
    previous?.retire();
  }
  function retire(notice) {
    generation++;
    for (const controller of requests) controller.abort();
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
    const consentOperation = config.aiConsent === true && selection && aiConsent && authorReady() && path === messagePath + "/ai-consent" && ["GET", "POST"].includes(options.method);
    if (!listing && !consentOperation && !(selection && path === messagePath && ["GET", "POST"].includes(options.method))) throw Error("Unexpected contribution operation");
    if (consentOperation) {
      if (options.method === "GET" && options.body !== void 0) throw Error("Unexpected consent body");
      if (options.method === "POST") {
        if (typeof options.body !== "string" || options.body.length > 4096 || !parseMessageAiConsentInput(JSON.parse(options.body))) throw Error("Unexpected consent body");
      }
    }
    const expected = scope, g = generation, abort = new AbortController();
    const current = () => enabled() && scope === expected && generation === g && !abort.signal.aborted && mayTransmit();
    if (!expected || !current()) throw Error("Contribution session unavailable");
    requests.add(abort);
    let timer;
    try {
      return await Promise.race([(async () => {
        const headers = await circleAuthorizationHeaders(config.owner, expected);
        if (!current() || !headers) throw Error("Contribution session changed");
        const response = await config.transport(origin + path, {
          ...options,
          credentials: "omit",
          signal: abort.signal,
          headers: { ...headers, ...options.method === "POST" ? { "Content-Type": "application/json" } : {} }
        });
        if (!current() || response.redirected || response.url !== origin + path) throw Error("Contribution response refused");
        if ([401, 403, 404].includes(response.status)) {
          retire("Contribution access changed. Private history and action details cleared. A previously sent action may still have completed.");
          throw Error("Contribution access retired");
        }
        const body = await response.json();
        if (!current()) throw Error("Contribution session retired");
        if (consentOperation && response.status === 200) {
          const consent = parseMessageAiConsent(body);
          if (!consent || !same3(consent.circleId, selection.circleId) || !same3(consent.messageId, selection.messageId)) throw Error("Author consent not verified");
        } else if (!listing && response.status === 200) {
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
    if (!expected || !current()) throw Error("Contribution session unavailable");
    let timer;
    try {
      const id2 = await Promise.race([Promise.resolve().then(() => {
        if (!current()) throw Error("Contribution session retired");
        return config.newRequestId();
      }), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Request key deadline")), timeout);
      })]);
      if (!current() || !isUuid(id2)) throw Error("Request key unavailable");
      return id2.toLowerCase();
    } finally {
      clearTimeout(timer);
    }
  } : void 0;
  async function load(after) {
    if (!model().canRefresh) return;
    const g = ++generation;
    clearSelection();
    items = [];
    nextCursor = null;
    loading = true;
    phase = "loading";
    message = "Loading your own posted messages\u2026";
    emit();
    const current = () => enabled() && generation === g;
    try {
      const result = await request(listPath + (after ? "?after=" + after : ""), { method: "GET", cache: "no-store", redirect: "error" }, current);
      if (!current()) return;
      const parsed = result.http === 200 ? parseMessageContributions(result.body) : null;
      let previous = after;
      if (!parsed || parsed.items.some((item) => {
        const id2 = item.message.id.toLowerCase(), invalid = previous !== null && id2 <= previous;
        previous = id2;
        return invalid;
      })) throw Error("Contribution page not verified");
      items = parsed.items;
      nextCursor = parsed.nextCursor?.toLowerCase() ?? null;
      loading = false;
      phase = "ready";
      message = items.length ? "Your posted messages are shown below. Select one to check its current author controls." : "No posted messages were returned on this page. Refresh to check your history again.";
      emit();
    } catch {
      if (!current()) return;
      loading = false;
      phase = "unavailable";
      message = "Your posted messages could not be verified. Refresh manually when ready.";
      emit();
    }
  }
  function consentAction(action) {
    if (!config.aiConsent || !authorReady() || !aiConsent || !action || typeof action !== "object") return null;
    const expected = aiConsent.model().action;
    return Object.keys(action).sort().join(",") === "circleId,contextRevision,interactionRevision,messageId" && action.circleId === expected.circleId && action.messageId === expected.messageId && action.contextRevision === expected.contextRevision && action.interactionRevision === expected.interactionRevision ? aiConsent : null;
  }
  async function withSafety(work) {
    if (actionTransition || !enabled() || loading || !safety || aiConsent?.model().busy) return;
    const action = safety, child = aiConsent, g = generation;
    actionTransition = true;
    try {
      if (child) {
        child.activity(false);
        if (enabled() && generation === g && aiConsent === child) child.activity(true);
      }
      return enabled() && generation === g && safety === action ? work(action) : void 0;
    } finally {
      actionTransition = false;
    }
  }
  function withConsent(action, work) {
    if (actionTransition) return;
    const child = consentAction(action);
    if (!child) return;
    actionTransition = true;
    try {
      safety?.confirm(false);
      return consentAction(action) === child ? work(child) : void 0;
    } finally {
      actionTransition = false;
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
      if (attached) return;
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
      offOwner = () => {
      };
      retire("Private contribution view closed. A previously sent action may still have completed.");
    },
    activity(value) {
      active = value;
      if (!value) retire("Private posted messages cleared while inactive. A previously sent action may still have completed.");
      else emit();
    },
    connectivity(value) {
      online = value;
      if (!value) retire("Private posted messages cleared while offline. Reconnect, then load them manually.");
      else emit();
    },
    refresh: () => load(null),
    next() {
      const cursor2 = model().canNext ? nextCursor : null;
      return cursor2 ? load(cursor2) : Promise.resolve();
    },
    async select(circleId, messageId) {
      if (!model().canSelect || !isUuid(circleId) || !isUuid(messageId) || !items.some((item) => same3(item.circleId, circleId) && same3(item.message.id, messageId))) return;
      const g = ++generation;
      items = [];
      nextCursor = null;
      clearSelection();
      selected = { circleId: circleId.toLowerCase(), messageId: messageId.toLowerCase() };
      const action = createMessageSafety(request, selected.circleId, newRequestId);
      safety = action;
      action.activity(enabled());
      const stop = action.subscribe(() => {
        syncConsent();
        emit();
      });
      if (!enabled() || generation !== g || safety !== action) {
        stop();
        return;
      }
      offSafety = stop;
      phase = "idle";
      message = "Checking current author controls for the selected contribution.";
      emit();
      if (enabled() && generation === g && safety === action) await action.open(messageId.toLowerCase());
    },
    back() {
      if (model().canBack) {
        generation++;
        clearSelection();
        phase = "idle";
        message = "Message details cleared. A decision already sent may still finish. Load your posted messages again when ready.";
        emit();
      }
    },
    check() {
      return withSafety((action) => action.refresh());
    },
    confirm(value) {
      void withSafety((action) => action.confirm(value));
    },
    withdraw() {
      return withSafety((action) => action.submit("withdraw"));
    },
    retry() {
      return withSafety((action) => action.retry());
    },
    checkAiConsent(action) {
      if (!consentAction(action)?.model().canCheck) return Promise.resolve();
      return withConsent(action, (child) => child.check(action)) ?? Promise.resolve();
    },
    confirmAiConsent(value, action) {
      if (typeof value !== "boolean" || !consentAction(action)?.model().canConfirm) return false;
      return withConsent(action, (child) => child.confirm(value, action)) ?? false;
    },
    setAiConsent(allowed, action) {
      const child = consentAction(action);
      if (typeof allowed !== "boolean" || !child || !(allowed ? child.model().canAllow : child.model().canKeepOff)) return Promise.resolve();
      return withConsent(action, (value) => value.change(allowed, action)) ?? Promise.resolve();
    },
    close() {
      retire("Private contribution view closed. A previously sent action may still have completed. Nothing retries automatically.");
    }
  };
}

// lib/books/catalog.ts
var GREAT_BOOKS = [
  {
    id: "republic",
    title: "The Republic",
    author: "Plato",
    year: "~380 BC",
    gutenberg_id: "1497",
    recommended_thinker: "plato",
    authorThinkerId: "plato",
    description: "The blueprint for every utopia and every tyranny. What is justice? Who should rule? Plato answers \u2014 and the answers are dangerous."
  },
  {
    id: "meditations",
    title: "Meditations",
    author: "Marcus Aurelius",
    year: "~170 AD",
    gutenberg_id: "2680",
    recommended_thinker: "aurelius",
    authorThinkerId: "aurelius",
    description: "Private journals of a Roman emperor at war. Not philosophy for the academy \u2014 philosophy for survival."
  },
  {
    id: "genealogy-of-morals",
    title: "On the Genealogy of Morals",
    author: "Friedrich Nietzsche",
    year: "1887",
    gutenberg_id: "52319",
    recommended_thinker: "nietzsche",
    authorThinkerId: "nietzsche",
    description: 'Where did "good" and "evil" come from? Nietzsche traces the bloodline and finds something disturbing.'
  },
  {
    id: "apology",
    title: "The Apology of Socrates",
    author: "Plato",
    year: "~399 BC",
    gutenberg_id: "1656",
    recommended_thinker: "socrates",
    authorThinkerId: "plato",
    description: "Socrates on trial for his life. His defense is not a defense \u2014 it is an attack on everyone in the room."
  },
  {
    id: "odyssey",
    title: "The Odyssey",
    author: "Homer",
    year: "~700 BC",
    gutenberg_id: "1727",
    recommended_thinker: "socrates",
    description: "The original homecoming story. Every detour is a test. Every monster is a mirror."
  },
  {
    id: "divine-comedy",
    title: "The Divine Comedy",
    author: "Dante Alighieri",
    year: "1320",
    gutenberg_id: "8800",
    recommended_thinker: "plato",
    description: "The descent into Hell, the climb through Purgatory, the blinding light of Paradise. The most ambitious poem ever written."
  },
  {
    id: "hamlet",
    title: "Hamlet",
    author: "William Shakespeare",
    year: "1601",
    gutenberg_id: "1524",
    recommended_thinker: "nietzsche",
    description: 'A man who thinks too much and acts too late. The question is not "to be or not to be" \u2014 it is why he cannot decide.'
  },
  {
    id: "relativity",
    title: "Relativity: The Special and General Theory",
    author: "Albert Einstein",
    year: "1916",
    gutenberg_id: "5001",
    recommended_thinker: "einstein",
    authorThinkerId: "einstein",
    description: "Einstein explains his own revolution \u2014 in plain language, for anyone willing to think carefully."
  }
];
function getBook(bookId) {
  return GREAT_BOOKS.find((b) => b.id === bookId);
}

// lib/books/bookmarks.ts
var isEditionId = (v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(v);
var record6 = (v) => Boolean(v && typeof v === "object" && !Array.isArray(v));
var text2 = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
var texts = (v, max) => Array.isArray(v) && v.length <= 100 && v.every((x) => text2(x, max));
function parseBookEditionResponse(value) {
  if (!record6(value) || typeof value.bookId !== "string") return null;
  const book = getBook(value.bookId);
  if (!book || value.title !== book.title || value.author !== book.author || !record6(value.edition)) return null;
  const e = value.edition;
  if (!isEditionId(e.editionId) || e.documentUrl !== `/api/great-books/edition/${book.id}?edition=${e.editionId}` || e.downloadUrl !== `/api/great-books/edition/${book.id}/download?edition=${e.editionId}` || e.sourceCatalogUrl !== `https://www.gutenberg.org/ebooks/${book.gutenberg_id}` || !text2(e.sourceArchiveUrl, 500) || !text2(e.sourceTitle, 1e3) || !text2(e.sourceAuthor, 500) || !text2(e.attribution, 4e3) || e.licenseUrl !== "https://www.gutenberg.org/policy/license.html" || !text2(e.licenseNotice, 4e3) || !texts(e.editors, 300) || !texts(e.illustrators, 300) || !texts(e.editionNotes, 3e3) || !Array.isArray(e.translators) || e.translators.length > 30 || !e.translators.every((t) => record6(t) && text2(t.name, 300) && text2(t.appliesTo, 1e3)) || !record6(e.rights) || e.rights.jurisdiction !== "US" || e.rights.status !== "public-domain" || e.rights.authority !== "Project Gutenberg" || e.rights.outsideUS !== "not-assessed" || !text2(e.rights.reviewedAt, 50) || !Number.isSafeInteger(e.blockCount) || Number(e.blockCount) < 1 || Number(e.blockCount) > 1e5 || !Array.isArray(e.contents) || e.contents.length > 5e3) return null;
  try {
    const u = new URL(e.sourceArchiveUrl);
    if (u.href !== `https://www.gutenberg.org/cache/epub/${book.gutenberg_id}/pg${book.gutenberg_id}-h.zip`) return null;
  } catch {
    return null;
  }
  if (!e.contents.every((c) => record6(c) && text2(c.id, 200) && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(c.id) && text2(c.label, 1e3) && Number.isInteger(c.level) && Number(c.level) >= 1 && Number(c.level) <= 6 && (c.readingIndex === null || Number.isSafeInteger(c.readingIndex) && Number(c.readingIndex) >= 0 && Number(c.readingIndex) < Number(e.blockCount)))) return null;
  if (new Set(e.contents.map((c) => c.id)).size !== e.contents.length) return null;
  return {
    bookId: book.id,
    title: book.title,
    author: book.author,
    edition: {
      editionId: e.editionId,
      documentUrl: e.documentUrl,
      downloadUrl: e.downloadUrl,
      sourceCatalogUrl: e.sourceCatalogUrl,
      sourceArchiveUrl: e.sourceArchiveUrl,
      sourceTitle: e.sourceTitle,
      sourceAuthor: e.sourceAuthor,
      attribution: e.attribution,
      translators: e.translators.map((t) => ({ name: t.name, appliesTo: t.appliesTo })),
      editors: [...e.editors],
      illustrators: [...e.illustrators],
      licenseUrl: e.licenseUrl,
      licenseNotice: e.licenseNotice,
      editionNotes: [...e.editionNotes],
      rights: { jurisdiction: "US", status: "public-domain", authority: "Project Gutenberg", outsideUS: "not-assessed", reviewedAt: e.rights.reviewedAt },
      blockCount: Number(e.blockCount),
      contents: e.contents.map((c) => ({ id: c.id, label: c.label, level: c.level, readingIndex: c.readingIndex }))
    }
  };
}

// content/root-kernel/philemon.web-classic.json
var philemon_web_classic_default = {
  edition: "World English Bible Classic",
  editionId: "eng-web",
  title: "Paul\u2019s Letter to Philemon",
  chapter: 1,
  publisherUrl: "https://ebible.org/eng-web/PHM01.htm",
  rightsUrl: "https://ebible.org/eng-web/webfaq.htm",
  sourceMemberSha256: "9c9148cf45eee6558410a74f58804de3793eb5d26c394e291634a47fb9b50a47",
  paragraphs: [
    [
      {
        verse: 1,
        text: "Paul, a prisoner of Christ Jesus, and Timothy our brother, to Philemon, our beloved fellow worker,"
      },
      {
        verse: 2,
        text: "to the beloved Apphia, to Archippus our fellow soldier, and to the assembly in your house:"
      },
      {
        verse: 3,
        text: "Grace to you and peace from God our Father and the Lord Jesus Christ."
      }
    ],
    [
      {
        verse: 4,
        text: "I thank my God always, making mention of you in my prayers,"
      },
      {
        verse: 5,
        text: "hearing of your love and of the faith which you have toward the Lord Jesus and toward all the saints,"
      },
      {
        verse: 6,
        text: "that the fellowship of your faith may become effective in the knowledge of every good thing which is in us in Christ Jesus."
      },
      {
        verse: 7,
        text: "For we have much joy and comfort in your love, because the hearts of the saints have been refreshed through you, brother."
      }
    ],
    [
      {
        verse: 8,
        text: "Therefore though I have all boldness in Christ to command you that which is appropriate,"
      },
      {
        verse: 9,
        text: "yet for love\u2019s sake I rather appeal to you, being such a one as Paul, the aged, but also a prisoner of Jesus Christ."
      },
      {
        verse: 10,
        text: "I appeal to you for my child Onesimus, whom I have become the father of in my chains,"
      },
      {
        verse: 11,
        text: "who once was useless to you, but now is useful to you and to me."
      },
      {
        verse: 12,
        text: "I am sending him back. Therefore receive him, that is, my own heart,"
      },
      {
        verse: 13,
        text: "whom I desired to keep with me, that on your behalf he might serve me in my chains for the Good News."
      },
      {
        verse: 14,
        text: "But I was willing to do nothing without your consent, that your goodness would not be as of necessity, but of free will."
      },
      {
        verse: 15,
        text: "For perhaps he was therefore separated from you for a while that you would have him forever,"
      },
      {
        verse: 16,
        text: "no longer as a slave, but more than a slave, a beloved brother\u2014especially to me, but how much rather to you, both in the flesh and in the Lord."
      }
    ],
    [
      {
        verse: 17,
        text: "If then you count me a partner, receive him as you would receive me."
      },
      {
        verse: 18,
        text: "But if he has wronged you at all or owes you anything, put that to my account."
      },
      {
        verse: 19,
        text: "I, Paul, write this with my own hand: I will repay it (not to mention to you that you owe to me even your own self besides)."
      },
      {
        verse: 20,
        text: "Yes, brother, let me have joy from you in the Lord. Refresh my heart in the Lord."
      }
    ],
    [
      {
        verse: 21,
        text: "Having confidence in your obedience, I write to you, knowing that you will do even beyond what I say."
      }
    ],
    [
      {
        verse: 22,
        text: "Also, prepare a guest room for me, for I hope that through your prayers I will be restored to you."
      }
    ],
    [
      {
        verse: 23,
        text: "Epaphras, my fellow prisoner in Christ Jesus, greets you,"
      },
      {
        verse: 24,
        text: "as do Mark, Aristarchus, Demas, and Luke, my fellow workers."
      }
    ],
    [
      {
        verse: 25,
        text: "The grace of our Lord Jesus Christ be with your spirit. Amen."
      }
    ]
  ],
  footnotes: [
    {
      verse: 1,
      text: "\u201CChrist\u201D means \u201CAnointed One\u201D."
    },
    {
      verse: 10,
      text: "Onesimus means \u201Cuseful\u201D."
    }
  ]
};

// lib/root-kernel/philemon-edition.ts
var PHILEMON_SOURCE_SHA256 = "b2bc6316f4217a8c97637d44786a4cd6b9b9a83b88cd4880b5aacdf67cae4e19";
var PHILEMON_READING = { bookId: "philemon", editionId: `web-classic-${PHILEMON_SOURCE_SHA256}`, from: 0, to: 0 };
var PHILEMON_WORK = { id: PHILEMON_READING.bookId, title: philemon_web_classic_default.title, author: "Paul" };
var PHILEMON_RIGHTS = "The World English Bible publisher dedicates this translation to the public domain.";
var PHILEMON_EDITION_METADATA = {
  bookId: PHILEMON_WORK.id,
  title: PHILEMON_WORK.title,
  author: PHILEMON_WORK.author,
  sourceSha256: PHILEMON_SOURCE_SHA256,
  edition: {
    editionId: PHILEMON_READING.editionId,
    sourceTitle: philemon_web_classic_default.title,
    sourceCatalogUrl: philemon_web_classic_default.publisherUrl,
    licenseUrl: philemon_web_classic_default.rightsUrl,
    attribution: `${philemon_web_classic_default.title} \xB7 ${philemon_web_classic_default.edition}`,
    licenseNotice: PHILEMON_RIGHTS,
    translators: [],
    editors: [],
    illustrators: [],
    editionNotes: ["Complete letter with both publisher footnotes."],
    blockCount: 1,
    contents: [{ id: "scripture", label: "Philemon 1", level: 2, readingIndex: 0 }]
  }
};
function isPhilemonReading(selection) {
  return selection?.bookId === PHILEMON_READING.bookId && selection.editionId === PHILEMON_READING.editionId && selection.from === PHILEMON_READING.from && selection.to === PHILEMON_READING.to;
}
function philemonReadingText() {
  const notes = new Map(philemon_web_classic_default.footnotes.map((note) => [note.verse, note.text]));
  const paragraphs = philemon_web_classic_default.paragraphs.map((paragraph) => paragraph.map(({ verse, text: text3 }) => `${verse}${notes.has(verse) ? "*" : ""} ${text3}`).join(" "));
  const footnotes = philemon_web_classic_default.footnotes.map(({ verse, text: text3 }) => `Verse ${verse} \xB7 ${text3}`);
  return [...paragraphs, "Publisher footnotes", ...footnotes].join("\n\n");
}

// lib/circles/reading-program-editions.json
var reading_program_editions_default = [
  {
    bookId: "apology",
    editionId: "pg-1656-c23a532ff45b46926abb91c193151af3f4aa8d27dc3bb76a3bb8971a427642c7",
    blockCount: 125,
    contents: [
      {
        id: "pg-header-heading",
        label: "The Project Gutenberg eBook of Apology",
        level: 2,
        readingIndex: 0
      },
      {
        id: "reading-heading-2",
        label: "Apology",
        level: 1,
        readingIndex: 8
      },
      {
        id: "reading-heading-3",
        label: "by Plato",
        level: 2,
        readingIndex: 9
      },
      {
        id: "reading-heading-4",
        label: "Translated by Benjamin Jowett",
        level: 3,
        readingIndex: 10
      },
      {
        id: "reading-heading-5",
        label: "Contents",
        level: 2,
        readingIndex: 11
      },
      {
        id: "reading-heading-6",
        label: "INTRODUCTION.",
        level: 2,
        readingIndex: 14
      },
      {
        id: "reading-heading-7",
        label: "APOLOGY",
        level: 2,
        readingIndex: 43
      }
    ],
    sourceTitle: "Apology",
    translators: [
      {
        name: "Benjamin Jowett",
        appliesTo: "Main work"
      }
    ],
    editors: [],
    illustrators: []
  },
  {
    bookId: "divine-comedy",
    editionId: "pg-8800-e77de137b64fe83297c694a797430e09510f31591e099272edd1d49bdc9b94bb",
    blockCount: 440,
    contents: [
      {
        id: "pg-header-heading",
        label: "The Project Gutenberg eBook of The divine comedy",
        level: 2,
        readingIndex: 0
      },
      {
        id: "reading-heading-2",
        label: "THE DIVINE COMEDY",
        level: 1,
        readingIndex: 9
      },
      {
        id: "reading-heading-3",
        label: "BY DANTE ALIGHIERI",
        level: 2,
        readingIndex: 10
      },
      {
        id: "reading-heading-4",
        label: "LIST OF CANTOS",
        level: 2,
        readingIndex: 11
      },
      {
        id: "reading-heading-5",
        label: "HELL OR THE INFERNO",
        level: 2,
        readingIndex: 115
      },
      {
        id: "reading-heading-6",
        label: "CANTO I",
        level: 2,
        readingIndex: 116
      },
      {
        id: "reading-heading-7",
        label: "CANTO II",
        level: 2,
        readingIndex: 121
      },
      {
        id: "reading-heading-8",
        label: "CANTO III",
        level: 2,
        readingIndex: 124
      },
      {
        id: "reading-heading-9",
        label: "CANTO IV",
        level: 2,
        readingIndex: 129
      },
      {
        id: "reading-heading-10",
        label: "CANTO V",
        level: 2,
        readingIndex: 133
      },
      {
        id: "reading-heading-11",
        label: "CANTO VI",
        level: 2,
        readingIndex: 139
      },
      {
        id: "reading-heading-12",
        label: "CANTO VII",
        level: 2,
        readingIndex: 143
      },
      {
        id: "reading-heading-13",
        label: "CANTO VIII",
        level: 2,
        readingIndex: 148
      },
      {
        id: "reading-heading-14",
        label: "CANTO IX",
        level: 2,
        readingIndex: 153
      },
      {
        id: "reading-heading-15",
        label: "CANTO X",
        level: 2,
        readingIndex: 158
      },
      {
        id: "reading-heading-16",
        label: "CANTO XI",
        level: 2,
        readingIndex: 161
      },
      {
        id: "reading-heading-17",
        label: "CANTO XII",
        level: 2,
        readingIndex: 164
      },
      {
        id: "reading-heading-18",
        label: "CANTO XIII",
        level: 2,
        readingIndex: 169
      },
      {
        id: "reading-heading-19",
        label: "CANTO XIV",
        level: 2,
        readingIndex: 174
      },
      {
        id: "reading-heading-20",
        label: "CANTO XV",
        level: 2,
        readingIndex: 177
      },
      {
        id: "reading-heading-21",
        label: "CANTO XVI",
        level: 2,
        readingIndex: 180
      },
      {
        id: "reading-heading-22",
        label: "CANTO XVII",
        level: 2,
        readingIndex: 182
      },
      {
        id: "reading-heading-23",
        label: "CANTO XVIII",
        level: 2,
        readingIndex: 186
      },
      {
        id: "reading-heading-24",
        label: "CANTO XIX",
        level: 2,
        readingIndex: 191
      },
      {
        id: "reading-heading-25",
        label: "CANTO XX",
        level: 2,
        readingIndex: 194
      },
      {
        id: "reading-heading-26",
        label: "CANTO XXI",
        level: 2,
        readingIndex: 196
      },
      {
        id: "reading-heading-27",
        label: "CANTO XXII",
        level: 2,
        readingIndex: 200
      },
      {
        id: "reading-heading-28",
        label: "CANTO XXIII",
        level: 2,
        readingIndex: 204
      },
      {
        id: "reading-heading-29",
        label: "CANTO XXIV",
        level: 2,
        readingIndex: 209
      },
      {
        id: "reading-heading-30",
        label: "CANTO XXV",
        level: 2,
        readingIndex: 212
      },
      {
        id: "reading-heading-31",
        label: "CANTO XXVI",
        level: 2,
        readingIndex: 215
      },
      {
        id: "reading-heading-32",
        label: "CANTO XXVII",
        level: 2,
        readingIndex: 218
      },
      {
        id: "reading-heading-33",
        label: "CANTO XXVIII",
        level: 2,
        readingIndex: 220
      },
      {
        id: "reading-heading-34",
        label: "CANTO XXIX",
        level: 2,
        readingIndex: 225
      },
      {
        id: "reading-heading-35",
        label: "CANTO XXX",
        level: 2,
        readingIndex: 230
      },
      {
        id: "reading-heading-36",
        label: "CANTO XXXI",
        level: 2,
        readingIndex: 234
      },
      {
        id: "reading-heading-37",
        label: "CANTO XXXII",
        level: 2,
        readingIndex: 238
      },
      {
        id: "reading-heading-38",
        label: "CANTO XXXIII",
        level: 2,
        readingIndex: 243
      },
      {
        id: "reading-heading-39",
        label: "CANTO XXXIV",
        level: 2,
        readingIndex: 248
      },
      {
        id: "reading-heading-40",
        label: "PURGATORY",
        level: 2,
        readingIndex: 251
      },
      {
        id: "reading-heading-41",
        label: "CANTO I",
        level: 2,
        readingIndex: 252
      },
      {
        id: "reading-heading-42",
        label: "CANTO II",
        level: 2,
        readingIndex: 256
      },
      {
        id: "reading-heading-43",
        label: "CANTO III",
        level: 2,
        readingIndex: 260
      },
      {
        id: "reading-heading-44",
        label: "CANTO IV",
        level: 2,
        readingIndex: 263
      },
      {
        id: "reading-heading-45",
        label: "CANTO V",
        level: 2,
        readingIndex: 267
      },
      {
        id: "reading-heading-46",
        label: "CANTO VI",
        level: 2,
        readingIndex: 271
      },
      {
        id: "reading-heading-47",
        label: "CANTO VII",
        level: 2,
        readingIndex: 273
      },
      {
        id: "reading-heading-48",
        label: "CANTO VIII",
        level: 2,
        readingIndex: 277
      },
      {
        id: "reading-heading-49",
        label: "CANTO IX",
        level: 2,
        readingIndex: 280
      },
      {
        id: "reading-heading-50",
        label: "CANTO X",
        level: 2,
        readingIndex: 284
      },
      {
        id: "reading-heading-51",
        label: "CANTO XI",
        level: 2,
        readingIndex: 287
      },
      {
        id: "reading-heading-52",
        label: "CANTO XII",
        level: 2,
        readingIndex: 289
      },
      {
        id: "reading-heading-53",
        label: "CANTO XIII",
        level: 2,
        readingIndex: 292
      },
      {
        id: "reading-heading-54",
        label: "CANTO XIV",
        level: 2,
        readingIndex: 296
      },
      {
        id: "reading-heading-55",
        label: "CANTO XV",
        level: 2,
        readingIndex: 298
      },
      {
        id: "reading-heading-56",
        label: "CANTO XVI",
        level: 2,
        readingIndex: 301
      },
      {
        id: "reading-heading-57",
        label: "CANTO XVII",
        level: 2,
        readingIndex: 305
      },
      {
        id: "reading-heading-58",
        label: "CANTO XVIII",
        level: 2,
        readingIndex: 307
      },
      {
        id: "reading-heading-59",
        label: "CANTO XIX",
        level: 2,
        readingIndex: 310
      },
      {
        id: "reading-heading-60",
        label: "CANTO XX",
        level: 2,
        readingIndex: 314
      },
      {
        id: "reading-heading-61",
        label: "CANTO XXI",
        level: 2,
        readingIndex: 317
      },
      {
        id: "reading-heading-62",
        label: "CANTO XXII",
        level: 2,
        readingIndex: 319
      },
      {
        id: "reading-heading-63",
        label: "CANTO XXIII",
        level: 2,
        readingIndex: 321
      },
      {
        id: "reading-heading-64",
        label: "CANTO XXIV",
        level: 2,
        readingIndex: 324
      },
      {
        id: "reading-heading-65",
        label: "CANTO XXV",
        level: 2,
        readingIndex: 328
      },
      {
        id: "reading-heading-66",
        label: "CANTO XXVI",
        level: 2,
        readingIndex: 332
      },
      {
        id: "reading-heading-67",
        label: "CANTO XXVII",
        level: 2,
        readingIndex: 334
      },
      {
        id: "reading-heading-68",
        label: "CANTO XXVIII",
        level: 2,
        readingIndex: 337
      },
      {
        id: "reading-heading-69",
        label: "CANTO XXIX",
        level: 2,
        readingIndex: 340
      },
      {
        id: "reading-heading-70",
        label: "CANTO XXX",
        level: 2,
        readingIndex: 344
      },
      {
        id: "reading-heading-71",
        label: "CANTO XXXI",
        level: 2,
        readingIndex: 347
      },
      {
        id: "reading-heading-72",
        label: "CANTO XXXII",
        level: 2,
        readingIndex: 350
      },
      {
        id: "reading-heading-73",
        label: "CANTO XXXIII",
        level: 2,
        readingIndex: 352
      },
      {
        id: "reading-heading-74",
        label: "PARADISE",
        level: 2,
        readingIndex: 354
      },
      {
        id: "reading-heading-75",
        label: "CANTO I",
        level: 2,
        readingIndex: 355
      },
      {
        id: "reading-heading-76",
        label: "CANTO II",
        level: 2,
        readingIndex: 357
      },
      {
        id: "reading-heading-77",
        label: "CANTO III",
        level: 2,
        readingIndex: 359
      },
      {
        id: "reading-heading-78",
        label: "CANTO IV",
        level: 2,
        readingIndex: 362
      },
      {
        id: "reading-heading-79",
        label: "CANTO V",
        level: 2,
        readingIndex: 364
      },
      {
        id: "reading-heading-80",
        label: "CANTO VI",
        level: 2,
        readingIndex: 367
      },
      {
        id: "reading-heading-81",
        label: "CANTO VII",
        level: 2,
        readingIndex: 369
      },
      {
        id: "reading-heading-82",
        label: "CANTO VIII",
        level: 2,
        readingIndex: 371
      },
      {
        id: "reading-heading-83",
        label: "CANTO IX",
        level: 2,
        readingIndex: 374
      },
      {
        id: "reading-heading-84",
        label: "CANTO X",
        level: 2,
        readingIndex: 376
      },
      {
        id: "reading-heading-85",
        label: "CANTO XI",
        level: 2,
        readingIndex: 378
      },
      {
        id: "reading-heading-86",
        label: "CANTO XII",
        level: 2,
        readingIndex: 380
      },
      {
        id: "reading-heading-87",
        label: "CANTO XIII",
        level: 2,
        readingIndex: 383
      },
      {
        id: "reading-heading-88",
        label: "CANTO XIV",
        level: 2,
        readingIndex: 385
      },
      {
        id: "reading-heading-89",
        label: "CANTO XV",
        level: 2,
        readingIndex: 389
      },
      {
        id: "reading-heading-90",
        label: "CANTO XVI",
        level: 2,
        readingIndex: 391
      },
      {
        id: "reading-heading-91",
        label: "CANTO XVII",
        level: 2,
        readingIndex: 393
      },
      {
        id: "reading-heading-92",
        label: "CANTO XVIII",
        level: 2,
        readingIndex: 395
      },
      {
        id: "reading-heading-93",
        label: "CANTO XIX",
        level: 2,
        readingIndex: 399
      },
      {
        id: "reading-heading-94",
        label: "CANTO XX",
        level: 2,
        readingIndex: 401
      },
      {
        id: "reading-heading-95",
        label: "CANTO XXI",
        level: 2,
        readingIndex: 404
      },
      {
        id: "reading-heading-96",
        label: "CANTO XXII",
        level: 2,
        readingIndex: 407
      },
      {
        id: "reading-heading-97",
        label: "CANTO XXIII",
        level: 2,
        readingIndex: 409
      },
      {
        id: "reading-heading-98",
        label: "CANTO XXIV",
        level: 2,
        readingIndex: 411
      },
      {
        id: "reading-heading-99",
        label: "CANTO XXV",
        level: 2,
        readingIndex: 413
      },
      {
        id: "reading-heading-100",
        label: "CANTO XXVI",
        level: 2,
        readingIndex: 415
      },
      {
        id: "reading-heading-101",
        label: "CANTO XXVII",
        level: 2,
        readingIndex: 418
      },
      {
        id: "reading-heading-102",
        label: "CANTO XXVIII",
        level: 2,
        readingIndex: 420
      },
      {
        id: "reading-heading-103",
        label: "CANTO XXIX",
        level: 2,
        readingIndex: 423
      },
      {
        id: "reading-heading-104",
        label: "CANTO XXX",
        level: 2,
        readingIndex: 425
      },
      {
        id: "reading-heading-105",
        label: "CANTO XXXI",
        level: 2,
        readingIndex: 427
      },
      {
        id: "reading-heading-106",
        label: "CANTO XXXII",
        level: 2,
        readingIndex: 430
      },
      {
        id: "reading-heading-107",
        label: "CANTO XXXIII",
        level: 2,
        readingIndex: 432
      }
    ],
    sourceTitle: "The divine comedy",
    translators: [
      {
        name: "Henry Francis Cary",
        appliesTo: "Main work"
      }
    ],
    editors: [],
    illustrators: [
      "Gustave Dor\xE9"
    ]
  },
  {
    bookId: "genealogy-of-morals",
    editionId: "pg-52319-50880f01d2e0afb107d49cb939f69086d3c1e6fccd2aad4ee68c329a1091e50c",
    blockCount: 347,
    contents: [
      {
        id: "pg-header-heading",
        label: "The Project Gutenberg eBook of The Genealogy of Morals",
        level: 2,
        readingIndex: 0
      },
      {
        id: "reading-heading-2",
        label: "THE GENEALOGY OF MORALS",
        level: 1,
        readingIndex: 10
      },
      {
        id: "reading-heading-3",
        label: "A POLEMIC",
        level: 3,
        readingIndex: 11
      },
      {
        id: "reading-heading-4",
        label: "BY",
        level: 3,
        readingIndex: 12
      },
      {
        id: "reading-heading-5",
        label: "FRIEDRICH NIETZSCHE",
        level: 2,
        readingIndex: 13
      },
      {
        id: "reading-heading-6",
        label: "TRANSLATED BY",
        level: 4,
        readingIndex: 14
      },
      {
        id: "reading-heading-7",
        label: "HORACE B. SAMUEL, M.A.",
        level: 4,
        readingIndex: 15
      },
      {
        id: "reading-heading-8",
        label: "PEOPLES AND COUNTRIES (FRAGMENT)",
        level: 4,
        readingIndex: 16
      },
      {
        id: "reading-heading-9",
        label: "TRANSLATED BY J. M. KENNEDY",
        level: 4,
        readingIndex: 17
      },
      {
        id: "reading-heading-10",
        label: "The Complete Works of Friedrich Nietzsche",
        level: 4,
        readingIndex: 18
      },
      {
        id: "reading-heading-11",
        label: "The First Complete and Authorised English Translation",
        level: 5,
        readingIndex: 19
      },
      {
        id: "reading-heading-12",
        label: "Edited by Dr Oscar Levy",
        level: 4,
        readingIndex: 20
      },
      {
        id: "reading-heading-13",
        label: "Volume Eight",
        level: 4,
        readingIndex: 21
      },
      {
        id: "reading-heading-14",
        label: "T.N. FOULIS",
        level: 5,
        readingIndex: 22
      },
      {
        id: "reading-heading-15",
        label: "13 & 15 FREDERICK STREET",
        level: 5,
        readingIndex: 23
      },
      {
        id: "reading-heading-16",
        label: "EDINBURGH: AND LONDON",
        level: 5,
        readingIndex: 24
      },
      {
        id: "reading-heading-17",
        label: "1913",
        level: 5,
        readingIndex: 25
      },
      {
        id: "reading-heading-18",
        label: "EDITOR'S NOTE.",
        level: 4,
        readingIndex: 27
      },
      {
        id: "reading-heading-19",
        label: "PREFACE.",
        level: 4,
        readingIndex: 30
      },
      {
        id: "reading-heading-20",
        label: "FIRST ESSAY.",
        level: 5,
        readingIndex: 53
      },
      {
        id: "reading-heading-21",
        label: '"GOOD AND EVIL," "GOOD AND BAD."',
        level: 4,
        readingIndex: 54
      },
      {
        id: "reading-heading-22",
        label: "SECOND ESSAY.",
        level: 5,
        readingIndex: 115
      },
      {
        id: "reading-heading-23",
        label: '"GUILT," "BAD CONSCIENCE," AND THE LIKE.',
        level: 4,
        readingIndex: 116
      },
      {
        id: "reading-heading-24",
        label: "THIRD ESSAY.",
        level: 5,
        readingIndex: 181
      },
      {
        id: "reading-heading-25",
        label: "WHAT IS THE MEANING OF ASCETIC IDEALS?",
        level: 4,
        readingIndex: 182
      },
      {
        id: "reading-heading-26",
        label: "PEOPLES AND COUNTRIES.",
        level: 4,
        readingIndex: 263
      },
      {
        id: "reading-heading-27",
        label: "Translated by J. M. KENNEDY.",
        level: 5,
        readingIndex: 264
      }
    ],
    sourceTitle: "The Genealogy of Morals",
    translators: [
      {
        name: "Horace Barnett Samuel",
        appliesTo: "The Genealogy of Morals"
      },
      {
        name: "J. M. Kennedy",
        appliesTo: "Appended Peoples and Countries fragment"
      }
    ],
    editors: [
      "Oscar Levy"
    ],
    illustrators: []
  },
  {
    bookId: "hamlet",
    editionId: "pg-1524-6bcc78cc0b21d3130b1a267990dd41b78f17785eeb089da3c5c9aa4eaac82825",
    blockCount: 1446,
    contents: [
      {
        id: "pg-header-heading",
        label: "The Project Gutenberg eBook of Hamlet",
        level: 2,
        readingIndex: 0
      },
      {
        id: "reading-heading-2",
        label: "THE TRAGEDY OF HAMLET, PRINCE OF DENMARK",
        level: 1,
        readingIndex: 7
      },
      {
        id: "reading-heading-3",
        label: "by William Shakespeare",
        level: 2,
        readingIndex: 8
      },
      {
        id: "reading-heading-4",
        label: "Contents",
        level: 2,
        readingIndex: 9
      },
      {
        id: "reading-heading-5",
        label: "Dramatis Person\xE6",
        level: 3,
        readingIndex: 35
      },
      {
        id: "reading-heading-6",
        label: "SCENE. Elsinore.",
        level: 3,
        readingIndex: 37
      },
      {
        id: "reading-heading-7",
        label: "ACT I",
        level: 2,
        readingIndex: 38
      },
      {
        id: "reading-heading-8",
        label: "SCENE I. Elsinore. A platform before the Castle.",
        level: 3,
        readingIndex: 39
      },
      {
        id: "reading-heading-9",
        label: "SCENE II. Elsinore. A room of state in the Castle.",
        level: 3,
        readingIndex: 111
      },
      {
        id: "reading-heading-10",
        label: "SCENE III. A room in Polonius\u2019s house.",
        level: 3,
        readingIndex: 195
      },
      {
        id: "reading-heading-11",
        label: "SCENE IV. The platform.",
        level: 3,
        readingIndex: 228
      },
      {
        id: "reading-heading-12",
        label: "SCENE V. A more remote part of the Castle.",
        level: 3,
        readingIndex: 269
      },
      {
        id: "reading-heading-13",
        label: "ACT II",
        level: 2,
        readingIndex: 338
      },
      {
        id: "reading-heading-14",
        label: "SCENE I. A room in Polonius\u2019s house.",
        level: 3,
        readingIndex: 339
      },
      {
        id: "reading-heading-15",
        label: "SCENE II. A room in the Castle.",
        level: 3,
        readingIndex: 382
      },
      {
        id: "reading-heading-16",
        label: "ACT III",
        level: 2,
        readingIndex: 570
      },
      {
        id: "reading-heading-17",
        label: "SCENE I. A room in the Castle.",
        level: 3,
        readingIndex: 571
      },
      {
        id: "reading-heading-18",
        label: "SCENE II. A hall in the Castle.",
        level: 3,
        readingIndex: 625
      },
      {
        id: "reading-heading-19",
        label: "SCENE III. A room in the Castle.",
        level: 3,
        readingIndex: 795
      },
      {
        id: "reading-heading-20",
        label: "SCENE IV. Another room in the Castle.",
        level: 3,
        readingIndex: 815
      },
      {
        id: "reading-heading-21",
        label: "ACT IV",
        level: 2,
        readingIndex: 882
      },
      {
        id: "reading-heading-22",
        label: "SCENE I. A room in the Castle.",
        level: 3,
        readingIndex: 883
      },
      {
        id: "reading-heading-23",
        label: "SCENE II. Another room in the Castle.",
        level: 3,
        readingIndex: 899
      },
      {
        id: "reading-heading-24",
        label: "SCENE III. Another room in the Castle.",
        level: 3,
        readingIndex: 920
      },
      {
        id: "reading-heading-25",
        label: "SCENE IV. A plain in Denmark.",
        level: 3,
        readingIndex: 957
      },
      {
        id: "reading-heading-26",
        label: "SCENE V. Elsinore. A room in the Castle.",
        level: 3,
        readingIndex: 982
      },
      {
        id: "reading-heading-27",
        label: "SCENE VI. Another room in the Castle.",
        level: 3,
        readingIndex: 1068
      },
      {
        id: "reading-heading-28",
        label: "SCENE VII. Another room in the Castle.",
        level: 3,
        readingIndex: 1082
      },
      {
        id: "reading-heading-29",
        label: "ACT V",
        level: 2,
        readingIndex: 1133
      },
      {
        id: "reading-heading-30",
        label: "SCENE I. A churchyard.",
        level: 3,
        readingIndex: 1134
      },
      {
        id: "reading-heading-31",
        label: "SCENE II. A hall in the Castle.",
        level: 3,
        readingIndex: 1261
      }
    ],
    sourceTitle: "Hamlet",
    translators: [],
    editors: [],
    illustrators: []
  },
  {
    bookId: "meditations",
    editionId: "pg-2680-299ccec053a7da0dc33b3f1e32812fc1f33852ab962390f7680d925f015624d1",
    blockCount: 1186,
    contents: [
      {
        id: "pg-header-heading",
        label: "The Project Gutenberg eBook of Meditations",
        level: 2,
        readingIndex: 0
      },
      {
        id: "reading-heading-2",
        label: "MEDITATIONS",
        level: 1,
        readingIndex: 7
      },
      {
        id: "reading-heading-3",
        label: "By Marcus Aurelius",
        level: 2,
        readingIndex: 8
      },
      {
        id: "reading-heading-4",
        label: "MARCUS AURELIUS ANTONINUS THE ROMAN EMPEROR",
        level: 3,
        readingIndex: 9
      },
      {
        id: "reading-heading-5",
        label: "BOOKS",
        level: 2,
        readingIndex: 10
      },
      {
        id: "reading-heading-6",
        label: "INTRODUCTION",
        level: 2,
        readingIndex: 27
      },
      {
        id: "reading-heading-7",
        label: "HIS FIRST BOOK",
        level: 2,
        readingIndex: 54
      },
      {
        id: "reading-heading-8",
        label: "concerning HIMSELF:",
        level: 3,
        readingIndex: 55
      },
      {
        id: "reading-heading-9",
        label: "THE FIRST BOOK",
        level: 2,
        readingIndex: 60
      },
      {
        id: "reading-heading-10",
        label: "THE SECOND BOOK",
        level: 2,
        readingIndex: 78
      },
      {
        id: "reading-heading-11",
        label: "THE THIRD BOOK",
        level: 2,
        readingIndex: 95
      },
      {
        id: "reading-heading-12",
        label: "THE FOURTH BOOK",
        level: 2,
        readingIndex: 113
      },
      {
        id: "reading-heading-13",
        label: "THE FIFTH BOOK",
        level: 2,
        readingIndex: 157
      },
      {
        id: "reading-heading-14",
        label: "THE SIXTH BOOK",
        level: 2,
        readingIndex: 189
      },
      {
        id: "reading-heading-15",
        label: "THE SEVENTH BOOK",
        level: 2,
        readingIndex: 242
      },
      {
        id: "reading-heading-16",
        label: "THE EIGHTH BOOK",
        level: 2,
        readingIndex: 288
      },
      {
        id: "reading-heading-17",
        label: "THE NINTH BOOK",
        level: 2,
        readingIndex: 346
      },
      {
        id: "reading-heading-18",
        label: "THE TENTH BOOK",
        level: 2,
        readingIndex: 390
      },
      {
        id: "reading-heading-19",
        label: "THE ELEVENTH BOOK",
        level: 2,
        readingIndex: 429
      },
      {
        id: "reading-heading-20",
        label: "THE TWELFTH BOOK",
        level: 2,
        readingIndex: 461
      },
      {
        id: "reading-heading-21",
        label: "APPENDIX",
        level: 2,
        readingIndex: 489
      },
      {
        id: "reading-heading-22",
        label: "NOTES",
        level: 2,
        readingIndex: 589
      },
      {
        id: "reading-heading-23",
        label: "GLOSSARY",
        level: 2,
        readingIndex: 635
      },
      {
        id: "reading-heading-24",
        label: "Paragraphs with First Lines",
        level: 3,
        readingIndex: 750
      }
    ],
    sourceTitle: "Meditations",
    translators: [
      {
        name: "Meric Casaubon",
        appliesTo: "Main work"
      }
    ],
    editors: [],
    illustrators: []
  },
  {
    bookId: "odyssey",
    editionId: "pg-1727-9328957b68516333c6c2f5618e8680f738c3f847756b777a94a5469231a9e569",
    blockCount: 1357,
    contents: [
      {
        id: "pg-header-heading",
        label: "The Project Gutenberg eBook of The Odyssey",
        level: 2,
        readingIndex: 0
      },
      {
        id: "reading-heading-2",
        label: "The Odyssey",
        level: 1,
        readingIndex: 8
      },
      {
        id: "reading-heading-3",
        label: "Contents",
        level: 2,
        readingIndex: 9
      },
      {
        id: "reading-heading-4",
        label: "PREFACE TO FIRST EDITION",
        level: 2,
        readingIndex: 39
      },
      {
        id: "reading-heading-5",
        label: "PREFACE TO SECOND EDITION",
        level: 2,
        readingIndex: 58
      },
      {
        id: "reading-heading-6",
        label: "THE ODYSSEY",
        level: 2,
        readingIndex: 70
      },
      {
        id: "reading-heading-7",
        label: "BOOK I",
        level: 2,
        readingIndex: 71
      },
      {
        id: "reading-heading-8",
        label: "BOOK II",
        level: 2,
        readingIndex: 105
      },
      {
        id: "reading-heading-9",
        label: "BOOK III",
        level: 2,
        readingIndex: 142
      },
      {
        id: "reading-heading-10",
        label: "BOOK IV",
        level: 2,
        readingIndex: 182
      },
      {
        id: "reading-heading-11",
        label: "BOOK V",
        level: 2,
        readingIndex: 265
      },
      {
        id: "reading-heading-12",
        label: "BOOK VI",
        level: 2,
        readingIndex: 304
      },
      {
        id: "reading-heading-13",
        label: "BOOK VII",
        level: 2,
        readingIndex: 332
      },
      {
        id: "reading-heading-14",
        label: "BOOK VIII",
        level: 2,
        readingIndex: 363
      },
      {
        id: "reading-heading-15",
        label: "BOOK IX",
        level: 2,
        readingIndex: 415
      },
      {
        id: "reading-heading-16",
        label: "BOOK X",
        level: 2,
        readingIndex: 461
      },
      {
        id: "reading-heading-17",
        label: "BOOK XI",
        level: 2,
        readingIndex: 512
      },
      {
        id: "reading-heading-18",
        label: "BOOK XII",
        level: 2,
        readingIndex: 568
      },
      {
        id: "reading-heading-19",
        label: "BOOK XIII",
        level: 2,
        readingIndex: 609
      },
      {
        id: "reading-heading-20",
        label: "BOOK XIV",
        level: 2,
        readingIndex: 649
      },
      {
        id: "reading-heading-21",
        label: "BOOK XV",
        level: 2,
        readingIndex: 686
      },
      {
        id: "reading-heading-22",
        label: "BOOK XVI",
        level: 2,
        readingIndex: 736
      },
      {
        id: "reading-heading-23",
        label: "BOOK XVII",
        level: 2,
        readingIndex: 783
      },
      {
        id: "reading-heading-24",
        label: "BOOK XVIII",
        level: 2,
        readingIndex: 848
      },
      {
        id: "reading-heading-25",
        label: "BOOK XIX",
        level: 2,
        readingIndex: 891
      },
      {
        id: "reading-heading-26",
        label: "BOOK XX",
        level: 2,
        readingIndex: 932
      },
      {
        id: "reading-heading-27",
        label: "BOOK XXI",
        level: 2,
        readingIndex: 970
      },
      {
        id: "reading-heading-28",
        label: "BOOK XXII",
        level: 2,
        readingIndex: 1014
      },
      {
        id: "reading-heading-29",
        label: "BOOK XXIII",
        level: 2,
        readingIndex: 1068
      },
      {
        id: "reading-heading-30",
        label: "BOOK XXIV",
        level: 2,
        readingIndex: 1099
      },
      {
        id: "reading-heading-31",
        label: "FOOTNOTES:",
        level: 2,
        readingIndex: 1146
      }
    ],
    sourceTitle: "The Odyssey",
    translators: [
      {
        name: "Samuel Butler",
        appliesTo: "Main work"
      }
    ],
    editors: [],
    illustrators: []
  },
  {
    bookId: "relativity",
    editionId: "pg-5001-14298e92fba1f6f40331a878b6fda08a79cd348e928388f7f27f61b37243981c",
    blockCount: 550,
    contents: [
      {
        id: "pg-header-heading",
        label: "The Project Gutenberg eBook of Relativity : the Special and General Theory",
        level: 2,
        readingIndex: 0
      },
      {
        id: "reading-heading-2",
        label: "Relativity The Special and General TheoryA Popular Exposition",
        level: 1,
        readingIndex: 10
      },
      {
        id: "reading-heading-3",
        label: "Table of Contents",
        level: 2,
        readingIndex: 11
      },
      {
        id: "reading-heading-4",
        label: "Preface",
        level: 2,
        readingIndex: 97
      },
      {
        id: "reading-heading-5",
        label: "PART I The Special Theory of Relativity",
        level: 2,
        readingIndex: 101
      },
      {
        id: "reading-heading-6",
        label: "I Physical Meaning of Geometrical Propositions",
        level: 3,
        readingIndex: 102
      },
      {
        id: "reading-heading-7",
        label: "II The System of Co-ordinates",
        level: 3,
        readingIndex: 109
      },
      {
        id: "reading-heading-8",
        label: "III Space and Time in Classical Mechanics",
        level: 3,
        readingIndex: 124
      },
      {
        id: "reading-heading-9",
        label: "IV The Galileian System of Co-ordinates",
        level: 3,
        readingIndex: 129
      },
      {
        id: "reading-heading-10",
        label: "V The Principle of Relativity in the Restricted Sense",
        level: 3,
        readingIndex: 131
      },
      {
        id: "reading-heading-11",
        label: "VI The Theorem of the Addition of Velocities Employed in Classical Mechanics",
        level: 3,
        readingIndex: 139
      },
      {
        id: "reading-heading-12",
        label: "VII The Apparent Incompatibility of the Law of Propagation of Light with the Principle of Relativity",
        level: 3,
        readingIndex: 141
      },
      {
        id: "reading-heading-13",
        label: "VIII On the Idea of Time in Physics",
        level: 3,
        readingIndex: 149
      },
      {
        id: "reading-heading-14",
        label: "IX The Relativity of Simultaneity",
        level: 3,
        readingIndex: 160
      },
      {
        id: "reading-heading-15",
        label: "X On the Relativity of the Conception of Distance",
        level: 3,
        readingIndex: 170
      },
      {
        id: "reading-heading-16",
        label: "XI The Lorentz Transformation",
        level: 3,
        readingIndex: 175
      },
      {
        id: "reading-heading-17",
        label: "XII The Behaviour of Measuring-Rods and Clocks in Motion",
        level: 3,
        readingIndex: 186
      },
      {
        id: "reading-heading-18",
        label: "XIII Theorem of the Addition of Velocities. The Experiment of Fizeau",
        level: 3,
        readingIndex: 194
      },
      {
        id: "reading-heading-19",
        label: "XIV The Heuristic Value of the Theory of Relativity",
        level: 3,
        readingIndex: 205
      },
      {
        id: "reading-heading-20",
        label: "XV General Results of the Theory",
        level: 3,
        readingIndex: 210
      },
      {
        id: "reading-heading-21",
        label: "XVI Experience and the Special Theory of Relativity",
        level: 3,
        readingIndex: 224
      },
      {
        id: "reading-heading-22",
        label: "XVII Minkowski\u2019s Four-Dimensional Space",
        level: 3,
        readingIndex: 233
      },
      {
        id: "reading-heading-23",
        label: "PART II The General Theory of Relativity",
        level: 2,
        readingIndex: 241
      },
      {
        id: "reading-heading-24",
        label: "XVIII Special and General Principle of Relativity",
        level: 3,
        readingIndex: 242
      },
      {
        id: "reading-heading-25",
        label: "XIX The Gravitational Field",
        level: 3,
        readingIndex: 256
      },
      {
        id: "reading-heading-26",
        label: "XX The Equality of Inertial and Gravitational Mass as an Argument for the General Postulate of Relativity",
        level: 3,
        readingIndex: 267
      },
      {
        id: "reading-heading-27",
        label: "XXI In What Respects Are the Foundations of Classical Mechanics and of the Special Theory of Relativity Unsatisfactory?",
        level: 3,
        readingIndex: 277
      },
      {
        id: "reading-heading-28",
        label: "XXII A Few Inferences from the General Principle of Relativity",
        level: 3,
        readingIndex: 283
      },
      {
        id: "reading-heading-29",
        label: "XXIII Behaviour of Clocks and Measuring-Rods on a Rotating Body of Reference",
        level: 3,
        readingIndex: 294
      },
      {
        id: "reading-heading-30",
        label: "XXIV Euclidean and Non-Euclidean Continuum",
        level: 3,
        readingIndex: 303
      },
      {
        id: "reading-heading-31",
        label: "XXV Gaussian Co-Ordinates",
        level: 3,
        readingIndex: 312
      },
      {
        id: "reading-heading-32",
        label: "XXVI The Space-Time Continuum of the Special Theory of Relativity Considered as a Euclidean Continuum",
        level: 3,
        readingIndex: 320
      },
      {
        id: "reading-heading-33",
        label: "XXVII The Space-Time Continuum of the General Theory of Relativity is Not a Euclidean Continuum",
        level: 3,
        readingIndex: 326
      },
      {
        id: "reading-heading-34",
        label: "XXVIII Exact Formulation of the General Principle of Relativity",
        level: 3,
        readingIndex: 333
      },
      {
        id: "reading-heading-35",
        label: "XXIX The Solution of the Problem of Gravitation on the Basis of the General Principle of Relativity",
        level: 3,
        readingIndex: 341
      },
      {
        id: "reading-heading-36",
        label: "PART III Considerations on the Universe as a Whole",
        level: 2,
        readingIndex: 358
      },
      {
        id: "reading-heading-37",
        label: "XXX Cosmological Difficulties of Newton\u2019s Theory",
        level: 3,
        readingIndex: 359
      },
      {
        id: "reading-heading-38",
        label: "XXXI The Possibility of a \u201CFinite\u201D and yet \u201CUnbounded\u201D Universe",
        level: 3,
        readingIndex: 365
      },
      {
        id: "reading-heading-39",
        label: "XXXII The Structure of Space According to the General Theory of Relativity",
        level: 3,
        readingIndex: 376
      },
      {
        id: "reading-heading-40",
        label: "APPENDIX I Simple Derivation of the Lorentz Transformation [Supplementary to Section XI]",
        level: 2,
        readingIndex: 382
      },
      {
        id: "reading-heading-41",
        label: "APPENDIX II Minkowski\u2019s Four-Dimensional Space (\u201CWorld\u201D) [Supplementary to Section XVII]",
        level: 2,
        readingIndex: 405
      },
      {
        id: "reading-heading-42",
        label: "APPENDIX III The Experimental Confirmation of the General Theory of Relativity",
        level: 2,
        readingIndex: 411
      },
      {
        id: "reading-heading-43",
        label: "(a) Motion of the Perihelion of Mercury",
        level: 3,
        readingIndex: 416
      },
      {
        id: "reading-heading-44",
        label: "(b) Deflection of Light by a Gravitational Field",
        level: 3,
        readingIndex: 421
      },
      {
        id: "reading-heading-45",
        label: "(c) Displacement of Spectral Lines Towards the Red",
        level: 3,
        readingIndex: 471
      },
      {
        id: "reading-heading-46",
        label: "APPENDIX IV The Structure of Space According to the General Theory of Relativity [Supplementary to Section XXXII]",
        level: 2,
        readingIndex: 485
      }
    ],
    sourceTitle: "Relativity : the Special and General Theory",
    translators: [
      {
        name: "Robert William Lawson",
        appliesTo: "Main work"
      }
    ],
    editors: [],
    illustrators: [
      "Hermann Struck (portrait, credited in the ebook metadata)"
    ]
  },
  {
    bookId: "republic",
    editionId: "pg-1497-c0bf2b223089459d9868aaeb69f295b307734ec9c232a9dabc8c1f9b496dcfb4",
    blockCount: 4747,
    contents: [
      {
        id: "pg-header-heading",
        label: "The Project Gutenberg eBook of The Republic",
        level: 2,
        readingIndex: 0
      },
      {
        id: "reading-heading-2",
        label: "THE REPUBLIC",
        level: 1,
        readingIndex: 8
      },
      {
        id: "reading-heading-3",
        label: "By Plato",
        level: 2,
        readingIndex: 9
      },
      {
        id: "reading-heading-4",
        label: "Translated by Benjamin Jowett",
        level: 3,
        readingIndex: 10
      },
      {
        id: "reading-heading-5",
        label: "Contents",
        level: 2,
        readingIndex: 12
      },
      {
        id: "reading-heading-6",
        label: "INTRODUCTION AND ANALYSIS.",
        level: 2,
        readingIndex: 26
      },
      {
        id: "reading-heading-7",
        label: "THE REPUBLIC.",
        level: 2,
        readingIndex: 411
      },
      {
        id: "reading-heading-8",
        label: "PERSONS OF THE DIALOGUE.",
        level: 2,
        readingIndex: 412
      },
      {
        id: "reading-heading-9",
        label: "BOOK I.",
        level: 2,
        readingIndex: 422
      },
      {
        id: "reading-heading-10",
        label: "BOOK II.",
        level: 2,
        readingIndex: 915
      },
      {
        id: "reading-heading-11",
        label: "BOOK III.",
        level: 2,
        readingIndex: 1265
      },
      {
        id: "reading-heading-12",
        label: "BOOK IV.",
        level: 2,
        readingIndex: 1763
      },
      {
        id: "reading-heading-13",
        label: "BOOK V.",
        level: 2,
        readingIndex: 2221
      },
      {
        id: "reading-heading-14",
        label: "BOOK VI.",
        level: 2,
        readingIndex: 2785
      },
      {
        id: "reading-heading-15",
        label: "BOOK VII.",
        level: 2,
        readingIndex: 3194
      },
      {
        id: "reading-heading-16",
        label: "BOOK VIII.",
        level: 2,
        readingIndex: 3567
      },
      {
        id: "reading-heading-17",
        label: "BOOK IX.",
        level: 2,
        readingIndex: 4015
      },
      {
        id: "reading-heading-18",
        label: "BOOK X.",
        level: 2,
        readingIndex: 4421
      }
    ],
    sourceTitle: "The Republic",
    translators: [
      {
        name: "Benjamin Jowett",
        appliesTo: "Main work"
      }
    ],
    editors: [],
    illustrators: []
  }
];

// lib/circles/reading-program.ts
var READING_PROGRAM_MAX_SESSIONS = 12;
var READING_EDITIONS = [
  ...reading_program_editions_default,
  { ...PHILEMON_EDITION_METADATA.edition, bookId: PHILEMON_READING.bookId }
];
var record7 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var exact2 = (v, keys) => Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
var position = (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function getReadingEdition(bookId, editionId) {
  return READING_EDITIONS.find((e) => e.bookId === bookId && (editionId === void 0 || e.editionId === editionId));
}
function parseReadingProgram(value) {
  if (!record7(value) || !exact2(value, ["version", "bookId", "editionId", "sessions"]) || value.version !== 1 || typeof value.bookId !== "string" || typeof value.editionId !== "string" || !Array.isArray(value.sessions) || value.sessions.length < 1 || value.sessions.length > READING_PROGRAM_MAX_SESSIONS) return null;
  const edition = getReadingEdition(value.bookId, value.editionId);
  if (!edition) return null;
  const sessions = [];
  for (const s of value.sessions) {
    if (!record7(s) || !exact2(s, ["from", "to"]) || !position(s.from) || !position(s.to) || s.from > s.to || s.to >= edition.blockCount) return null;
    sessions.push({ from: s.from, to: s.to });
  }
  return { version: 1, bookId: value.bookId, editionId: value.editionId, sessions };
}
function matchesReadingEdition(metadata, program) {
  const pinned = getReadingEdition(program.bookId, program.editionId);
  return Boolean(pinned && metadata.bookId === program.bookId && metadata.edition.editionId === program.editionId && metadata.edition.blockCount === pinned.blockCount && JSON.stringify(metadata.edition.contents) === JSON.stringify(pinned.contents));
}
function starterReadingContext(week) {
  const binding = week === 2 ? { bookId: "apology", start: "APOLOGY", before: null } : week === 5 ? { bookId: "meditations", start: "THE FIRST BOOK", before: "THE THIRD BOOK" } : null;
  if (!binding) return null;
  const edition = getReadingEdition(binding.bookId);
  const from = edition.contents.find((c) => c.label === binding.start)?.readingIndex;
  const end = binding.before ? edition.contents.find((c) => c.label === binding.before)?.readingIndex : edition.blockCount;
  if (from == null || end == null || end <= from) return null;
  return { bookId: binding.bookId, editionId: edition.editionId, from, to: end - 1 };
}

// lib/books/passage-indexes.json
var passage_indexes_default = [
  {
    bookId: "apology",
    editionId: "pg-1656-c23a532ff45b46926abb91c193151af3f4aa8d27dc3bb76a3bb8971a427642c7",
    blockCount: 125,
    documentSha256: "39935b8fd0710a044e2ccfc8af7543ba1070e206daf1bfc133eb1640d962a4fc",
    metadataSha256: "05c62c4966fb63dca1ad3bf72edd028e03ab403d363847f2bb83a7d5a8419bab",
    indexSha256: "9fdd28fb9c9e72a6f9992f7221e67d4c7d4af44b1b4cdb39cf57859e325a06bf",
    indexBytes: 95107
  },
  {
    bookId: "divine-comedy",
    editionId: "pg-8800-e77de137b64fe83297c694a797430e09510f31591e099272edd1d49bdc9b94bb",
    blockCount: 440,
    documentSha256: "54726c71c3134294ade661003557c192136ace1a02666b74790cd7dc415a82e8",
    metadataSha256: "8ca380fada7df8781feb6359be9778f0dcbae5f371884d04414bcb1f1e3d153c",
    indexSha256: "cad05e69828d4e6c78344eda73e38a3681c9047a4a08d4c0ec5e0b821c7177f1",
    indexBytes: 659614
  },
  {
    bookId: "genealogy-of-morals",
    editionId: "pg-52319-50880f01d2e0afb107d49cb939f69086d3c1e6fccd2aad4ee68c329a1091e50c",
    blockCount: 347,
    documentSha256: "548408ac3ea88ac0b556442d3bc0a327e02167a4681d1b3a939da5334fb07f90",
    metadataSha256: "8cd0065c0beead28eeea2b9dbb612eaf1264ec126dd0876cbad1c5d4d64ccca7",
    indexSha256: "a9aacd6442e190bb824f06012c03d33739b8984e4cfc9aac0598e56c9e7d22a6",
    indexBytes: 355464
  },
  {
    bookId: "hamlet",
    editionId: "pg-1524-6bcc78cc0b21d3130b1a267990dd41b78f17785eeb089da3c5c9aa4eaac82825",
    blockCount: 1446,
    documentSha256: "16a07e48f082e5eb760b30923c74c14932ea243799aebf7497b39a7d4f6b6fe7",
    metadataSha256: "dbf399e2811795653ad79e54d3299cf79a316c5f8b74e155d897bccfc7806e65",
    indexSha256: "41e4c6ce41de0fe04ca1bb37e18e05928a29df0f6cec9d3d93e55fc6e8adf648",
    indexBytes: 257379
  },
  {
    bookId: "meditations",
    editionId: "pg-2680-299ccec053a7da0dc33b3f1e32812fc1f33852ab962390f7680d925f015624d1",
    blockCount: 1186,
    documentSha256: "d729af988c62e47826523d30e35356e98f83175af7887e9d30f602403ead9c90",
    metadataSha256: "53ad5c074c3e0c2cdc99e9431f4d8766b1c8c77f9fe0e33fa2ba263f9d60cd0e",
    indexSha256: "1d4471993ee1579632cb1c6313d52f47ee104edee9cf5167fd948621da18b6fc",
    indexBytes: 490459
  },
  {
    bookId: "odyssey",
    editionId: "pg-1727-9328957b68516333c6c2f5618e8680f738c3f847756b777a94a5469231a9e569",
    blockCount: 1357,
    documentSha256: "49fc43595dca6722da7dccbaf62a101e68e3354ef597f2a82d12fbaec2e327d9",
    metadataSha256: "876db330aa71dd590bd0173cc919cfa946be16d6caa20a16df1fb130d77990d7",
    indexSha256: "5461f4453ab60d7afb58821de32c87d7301bb93010304d9412802c3acf1e94a3",
    indexBytes: 756587
  },
  {
    bookId: "relativity",
    editionId: "pg-5001-14298e92fba1f6f40331a878b6fda08a79cd348e928388f7f27f61b37243981c",
    blockCount: 550,
    documentSha256: "7f3a565f524e4df164ee2e5df8cd24a480ad566934f06974495b2bf1dd04141b",
    metadataSha256: "fe375adc9ca35b766cff450804a81a0a072abb2178be753c6560e9afd0e3b25f",
    indexSha256: "8dff1791dd3aac9bb3942c661934ab52eb358d018b67ecf7465c766e47774387",
    indexBytes: 156863
  },
  {
    bookId: "republic",
    editionId: "pg-1497-c0bf2b223089459d9868aaeb69f295b307734ec9c232a9dabc8c1f9b496dcfb4",
    blockCount: 4747,
    documentSha256: "ae02d803079893480ab4110e5d84f79a82ff2ba002137ec2217988cff1f18884",
    metadataSha256: "585862c5b69501dfcfe8f632fd66174339fbe6de6a32c9b91314a89ffa5d188b",
    indexSha256: "4e9440336bf6008aeaa61c338461783d73c09ef0e225db11bbe1535d45e1935e",
    indexBytes: 1439793
  }
];

// lib/books/passages.ts
var PASSAGE_QUOTE_LIMIT = 600;
var PASSAGE_MESSAGE_LIMIT = 2e3;
var record8 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var plain3 = (value, max) => typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
var integer2 = (value, max = 1e5) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;
var pins = passage_indexes_default;
function passageIndexPin(bookId) {
  const pin = pins.find((value) => value.bookId === bookId);
  return pin ? { ...pin } : null;
}
function parsePassageReference(value) {
  if (!record8(value) || Object.keys(value).sort().join(",") !== "blockIndex,bookId,editionId,end,start,version" || value.version !== 1 || typeof value.bookId !== "string" || !getBook(value.bookId) || !passageIndexPin(value.bookId) || !isEditionId(value.editionId) || !integer2(value.blockIndex)) return null;
  const linked = value.start === null && value.end === null;
  if (!linked && (!integer2(value.start) || !integer2(value.end) || value.end <= value.start || value.end - value.start > PASSAGE_QUOTE_LIMIT)) return null;
  return { version: 1, bookId: value.bookId, editionId: value.editionId, blockIndex: value.blockIndex, start: value.start, end: value.end };
}
function samePassageReference(a, b) {
  return a.version === b.version && a.bookId === b.bookId && a.editionId === b.editionId && a.blockIndex === b.blockIndex && a.start === b.start && a.end === b.end;
}
function passageReaderHref(reference) {
  const r = parsePassageReference(reference);
  if (!r) throw Error("Invalid passage reference");
  const query = new URLSearchParams({ edition: r.editionId, passageBlock: String(r.blockIndex) });
  if (r.start !== null) {
    query.set("passageStart", String(r.start));
    query.set("passageEnd", String(r.end));
  }
  return `/great-books/${r.bookId}?${query}`;
}
function passageContentSuffix(source) {
  const heading = source.quote === null ? "Referenced source block (no quotation):" : `Referenced passage (edition text; line breaks retained):
\u201C${source.quote}\u201D`;
  const credit = source.metadata.edition.attribution.replace(/\s+/gu, " ").trim();
  return `${heading}

Source edition: ${credit}
Reading block ${source.reference.blockIndex + 1}.
${passageReaderHref(source.reference)}`;
}
function parseBookPassage(value) {
  if (!record8(value)) return null;
  const reference = parsePassageReference(value.reference), metadata = parseBookEditionResponse(value.metadata);
  if (!reference || !metadata) return null;
  const pin = passageIndexPin(reference.bookId);
  if (!pin || reference.editionId !== pin.editionId || reference.blockIndex >= pin.blockCount || metadata.bookId !== reference.bookId || metadata.edition.editionId !== reference.editionId || metadata.edition.blockCount !== pin.blockCount || value.sourceHash !== pin.documentSha256 || ![null, "non_text", "table", "empty"].includes(value.reason) || value.blockText !== null && !plain3(value.blockText, 1e5) || value.quote !== null && !plain3(value.quote, PASSAGE_QUOTE_LIMIT)) return null;
  const quote = value.quote, blockText = value.blockText, reason2 = value.reason;
  if (reason2 !== null && (blockText !== null || quote !== null) || reason2 === null && !blockText || (reference.start === null ? quote !== null : !blockText || !quote || reason2 !== null || blockText.slice(reference.start, reference.end) !== quote || quote.length !== reference.end - reference.start || quote !== quote.trim() || reference.start > 0 && /[\uDC00-\uDFFF]/u.test(blockText[reference.start]) || reference.end < blockText.length && /[\uDC00-\uDFFF]/u.test(blockText[reference.end]))) return null;
  const projected = { reference, quote, blockText, reason: reason2, metadata, readerHref: passageReaderHref(reference), sourceHash: pin.documentSha256 };
  const contentSuffix = passageContentSuffix(projected), commentLimit = PASSAGE_MESSAGE_LIMIT - contentSuffix.length - 2;
  if (commentLimit < 1 || value.readerHref !== projected.readerHref || value.contentSuffix !== contentSuffix || value.commentLimit !== commentLimit) return null;
  return { ...projected, contentSuffix, commentLimit };
}

// platforms/shared/reading-metadata.json
var reading_metadata_default = {
  version: 1,
  editions: [
    {
      bookId: "apology",
      editionId: "pg-1656-c23a532ff45b46926abb91c193151af3f4aa8d27dc3bb76a3bb8971a427642c7",
      metadataSha256: "05c62c4966fb63dca1ad3bf72edd028e03ab403d363847f2bb83a7d5a8419bab",
      tuple: [
        "Apology",
        "Plato",
        [
          {
            name: "Benjamin Jowett",
            appliesTo: "Main work"
          }
        ],
        [],
        [],
        {
          jurisdiction: "US",
          status: "public-domain",
          authority: "Project Gutenberg",
          outsideUS: "not-assessed",
          reviewedAt: "2026-11-03"
        },
        "https://www.gutenberg.org/policy/license.html",
        "This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org. If you are not located in the United States, you will have to check the laws of the country where you are located before using this eBook.",
        [
          "The Apology of Socrates is the application display alias; Apology is the source title."
        ],
        "https://www.gutenberg.org/ebooks/1656",
        "https://www.gutenberg.org/cache/epub/1656/pg1656-h.zip"
      ],
      attribution: "Apology \xB7 Plato \xB7 Benjamin Jowett (translation: Main work) \xB7 Project Gutenberg ebook 1656"
    },
    {
      bookId: "divine-comedy",
      editionId: "pg-8800-e77de137b64fe83297c694a797430e09510f31591e099272edd1d49bdc9b94bb",
      metadataSha256: "8ca380fada7df8781feb6359be9778f0dcbae5f371884d04414bcb1f1e3d153c",
      tuple: [
        "The divine comedy",
        "Dante Alighieri",
        [
          {
            name: "Henry Francis Cary",
            appliesTo: "Main work"
          }
        ],
        [],
        [
          "Gustave Dor\xE9"
        ],
        {
          jurisdiction: "US",
          status: "public-domain",
          authority: "Project Gutenberg",
          outsideUS: "not-assessed",
          reviewedAt: "2026-11-03"
        },
        "https://www.gutenberg.org/policy/license.html",
        "This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org. If you are not located in the United States, you will have to check the laws of the country where you are located before using this eBook.",
        [
          "Cary translation with Dor\xE9 illustrations; not the Longfellow translation."
        ],
        "https://www.gutenberg.org/ebooks/8800",
        "https://www.gutenberg.org/cache/epub/8800/pg8800-h.zip"
      ],
      attribution: "The divine comedy \xB7 Dante Alighieri \xB7 Henry Francis Cary (translation: Main work) \xB7 Gustave Dor\xE9 (illustrator) \xB7 Project Gutenberg ebook 8800"
    },
    {
      bookId: "genealogy-of-morals",
      editionId: "pg-52319-50880f01d2e0afb107d49cb939f69086d3c1e6fccd2aad4ee68c329a1091e50c",
      metadataSha256: "8cd0065c0beead28eeea2b9dbb612eaf1264ec126dd0876cbad1c5d4d64ccca7",
      tuple: [
        "The Genealogy of Morals",
        "Friedrich Wilhelm Nietzsche",
        [
          {
            name: "Horace Barnett Samuel",
            appliesTo: "The Genealogy of Morals"
          },
          {
            name: "J. M. Kennedy",
            appliesTo: "Appended Peoples and Countries fragment"
          }
        ],
        [
          "Oscar Levy"
        ],
        [],
        {
          jurisdiction: "US",
          status: "public-domain",
          authority: "Project Gutenberg",
          outsideUS: "not-assessed",
          reviewedAt: "2026-11-03"
        },
        "https://www.gutenberg.org/policy/license.html",
        "This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org. If you are not located in the United States, you will have to check the laws of the country where you are located before using this eBook.",
        [
          "Includes the Peoples and Countries fragment.",
          "Catalog/RDF describes Volume Thirteen; the ebook front matter says Volume Eight, 1913. The discrepancy is retained rather than resolved by assumption."
        ],
        "https://www.gutenberg.org/ebooks/52319",
        "https://www.gutenberg.org/cache/epub/52319/pg52319-h.zip"
      ],
      attribution: "The Genealogy of Morals \xB7 Friedrich Wilhelm Nietzsche \xB7 Horace Barnett Samuel (translation: The Genealogy of Morals) \xB7 J. M. Kennedy (translation: Appended Peoples and Countries fragment) \xB7 Oscar Levy (editor) \xB7 Project Gutenberg ebook 52319"
    },
    {
      bookId: "hamlet",
      editionId: "pg-1524-6bcc78cc0b21d3130b1a267990dd41b78f17785eeb089da3c5c9aa4eaac82825",
      metadataSha256: "dbf399e2811795653ad79e54d3299cf79a316c5f8b74e155d897bccfc7806e65",
      tuple: [
        "Hamlet",
        "William Shakespeare",
        [],
        [],
        [],
        {
          jurisdiction: "US",
          status: "public-domain",
          authority: "Project Gutenberg",
          outsideUS: "not-assessed",
          reviewedAt: "2026-11-03"
        },
        "https://www.gutenberg.org/policy/license.html",
        "This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org. If you are not located in the United States, you will have to check the laws of the country where you are located before using this eBook.",
        [
          "Original English; no translator is listed. Speaker labels, stage directions and verse line breaks are retained."
        ],
        "https://www.gutenberg.org/ebooks/1524",
        "https://www.gutenberg.org/cache/epub/1524/pg1524-h.zip"
      ],
      attribution: "Hamlet \xB7 William Shakespeare \xB7 Project Gutenberg ebook 1524"
    },
    {
      bookId: "meditations",
      editionId: "pg-2680-299ccec053a7da0dc33b3f1e32812fc1f33852ab962390f7680d925f015624d1",
      metadataSha256: "53ad5c074c3e0c2cdc99e9431f4d8766b1c8c77f9fe0e33fa2ba263f9d60cd0e",
      tuple: [
        "Meditations",
        "Marcus Aurelius",
        [
          {
            name: "Meric Casaubon",
            appliesTo: "Main work"
          }
        ],
        [],
        [],
        {
          jurisdiction: "US",
          status: "public-domain",
          authority: "Project Gutenberg",
          outsideUS: "not-assessed",
          reviewedAt: "2026-11-03"
        },
        "https://www.gutenberg.org/policy/license.html",
        "This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org. If you are not located in the United States, you will have to check the laws of the country where you are located before using this eBook.",
        [
          "Translator is not listed in the Gutenberg catalog/RDF. The edition notes identify Casaubon and comparison of the 1634 and 1635 editions. This is not the George Long translation."
        ],
        "https://www.gutenberg.org/ebooks/2680",
        "https://www.gutenberg.org/cache/epub/2680/pg2680-h.zip"
      ],
      attribution: "Meditations \xB7 Marcus Aurelius \xB7 Meric Casaubon (translation: Main work) \xB7 Project Gutenberg ebook 2680"
    },
    {
      bookId: "odyssey",
      editionId: "pg-1727-9328957b68516333c6c2f5618e8680f738c3f847756b777a94a5469231a9e569",
      metadataSha256: "876db330aa71dd590bd0173cc919cfa946be16d6caa20a16df1fb130d77990d7",
      tuple: [
        "The Odyssey",
        "Homer",
        [
          {
            name: "Samuel Butler",
            appliesTo: "Main work"
          }
        ],
        [],
        [],
        {
          jurisdiction: "US",
          status: "public-domain",
          authority: "Project Gutenberg",
          outsideUS: "not-assessed",
          reviewedAt: "2026-11-03"
        },
        "https://www.gutenberg.org/policy/license.html",
        "This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org. If you are not located in the United States, you will have to check the laws of the country where you are located before using this eBook.",
        [
          "English prose translation. Source subtitle: Rendered into English prose for the use of those who cannot read the original."
        ],
        "https://www.gutenberg.org/ebooks/1727",
        "https://www.gutenberg.org/cache/epub/1727/pg1727-h.zip"
      ],
      attribution: "The Odyssey \xB7 Homer \xB7 Samuel Butler (translation: Main work) \xB7 Project Gutenberg ebook 1727"
    },
    {
      bookId: "relativity",
      editionId: "pg-5001-14298e92fba1f6f40331a878b6fda08a79cd348e928388f7f27f61b37243981c",
      metadataSha256: "fe375adc9ca35b766cff450804a81a0a072abb2178be753c6560e9afd0e3b25f",
      tuple: [
        "Relativity : the Special and General Theory",
        "Albert Einstein",
        [
          {
            name: "Robert William Lawson",
            appliesTo: "Main work"
          }
        ],
        [],
        [
          "Hermann Struck (portrait, credited in the ebook metadata)"
        ],
        {
          jurisdiction: "US",
          status: "public-domain",
          authority: "Project Gutenberg",
          outsideUS: "not-assessed",
          reviewedAt: "2026-11-03"
        },
        "https://www.gutenberg.org/policy/license.html",
        "This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org. If you are not located in the United States, you will have to check the laws of the country where you are located before using this eBook.",
        [
          "Gutenberg identifies the English source publication as Methuen & Co Ltd, 1920; 1916 is the original-work year.",
          "HTML-only source package: equations and illustrations must remain local images. Gutenberg warns that some generated formats lose equations or images."
        ],
        "https://www.gutenberg.org/ebooks/5001",
        "https://www.gutenberg.org/cache/epub/5001/pg5001-h.zip"
      ],
      attribution: "Relativity : the Special and General Theory \xB7 Albert Einstein \xB7 Robert William Lawson (translation: Main work) \xB7 Hermann Struck (portrait, credited in the ebook metadata) (illustrator) \xB7 Project Gutenberg ebook 5001"
    },
    {
      bookId: "republic",
      editionId: "pg-1497-c0bf2b223089459d9868aaeb69f295b307734ec9c232a9dabc8c1f9b496dcfb4",
      metadataSha256: "585862c5b69501dfcfe8f632fd66174339fbe6de6a32c9b91314a89ffa5d188b",
      tuple: [
        "The Republic",
        "Plato",
        [
          {
            name: "Benjamin Jowett",
            appliesTo: "Main work"
          }
        ],
        [],
        [],
        {
          jurisdiction: "US",
          status: "public-domain",
          authority: "Project Gutenberg",
          outsideUS: "not-assessed",
          reviewedAt: "2026-11-03"
        },
        "https://www.gutenberg.org/policy/license.html",
        "This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org. If you are not located in the United States, you will have to check the laws of the country where you are located before using this eBook.",
        [
          "Gutenberg points to an improved edition, 55201. This reviewed copy intentionally retains edition 1497."
        ],
        "https://www.gutenberg.org/ebooks/1497",
        "https://www.gutenberg.org/cache/epub/1497/pg1497-h.zip"
      ],
      attribution: "The Republic \xB7 Plato \xB7 Benjamin Jowett (translation: Main work) \xB7 Project Gutenberg ebook 1497"
    }
  ]
};

// platforms/shared/circle-reading.ts
var copy6 = (value) => JSON.parse(JSON.stringify(value));
function metadataMatches(passage) {
  const pin = passageIndexPin(passage.reference.bookId), e = passage.metadata.edition;
  const snapshot = reading_metadata_default.editions.find((item) => item.bookId === passage.reference.bookId && item.editionId === passage.reference.editionId);
  const tuple = [
    e.sourceTitle,
    e.sourceAuthor,
    e.translators,
    e.editors,
    e.illustrators,
    e.rights,
    e.licenseUrl,
    e.licenseNotice,
    e.editionNotes,
    e.sourceCatalogUrl,
    e.sourceArchiveUrl
  ];
  return Boolean(pin && reading_metadata_default.version === 1 && snapshot && snapshot.metadataSha256 === pin.metadataSha256 && JSON.stringify(tuple) === JSON.stringify(snapshot.tuple) && e.attribution === snapshot.attribution);
}
function createCircleReading(config) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15e3, raw = config.context;
  const program = raw && parseReadingProgram({ version: 1, bookId: raw.bookId, editionId: raw.editionId, sessions: [{ from: raw.from, to: raw.to }] });
  const edition = program && getReadingEdition(program.bookId, program.editionId), pin = program && passageIndexPin(program.bookId);
  if (!program || !edition || !pin || pin.editionId !== program.editionId || pin.blockCount !== edition.blockCount || !raw || Object.keys(raw).sort().join(",") !== "bookId,editionId,from,to" || !config.owner || typeof config.owner.scope !== "function" || typeof config.owner.subscribe !== "function" || config.passageTransport !== void 0 && typeof config.passageTransport !== "function" || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 6e4 || config.initialOnline !== void 0 && typeof config.initialOnline !== "boolean") throw Error("An exact supported reading selection is required");
  const context = { bookId: program.bookId, editionId: program.editionId, ...program.sessions[0] };
  const initialBlockIndex = config.initialBlockIndex ?? context.from;
  if (!Number.isSafeInteger(initialBlockIndex) || initialBlockIndex < context.from || initialBlockIndex > context.to) throw Error("Initial reading position must be within the selected range");
  let attached = false, closed = false, active = true, online = config.initialOnline ?? false, scope = null;
  let generation = 0, attachment = 0, blockIndex = initialBlockIndex, busy = false;
  let phase = "closed", passage = null, offOwner = () => {
  };
  let message = config.passageTransport ? "Load this exact reading selection when ready." : "Text reading is unavailable in this connection.";
  const listeners = /* @__PURE__ */ new Set(), requests = /* @__PURE__ */ new Set();
  const enabled = () => !closed && attached && active && online && scope !== null && scope === config.owner.scope() && Boolean(config.passageTransport);
  const model = () => {
    const usable = enabled() && !busy, validated = phase === "ready" || phase === "unsupported";
    return {
      connected: attached && scope !== null,
      active,
      online,
      busy,
      phase,
      context: { ...context },
      blockIndex,
      passage: copy6(passage),
      message,
      canLoad: usable,
      canNext: usable && validated && blockIndex < context.to,
      canPrevious: usable && validated && blockIndex > context.from,
      canRetry: usable && phase === "unavailable",
      canNavigate: !busy
    };
  };
  const emit = () => {
    for (const listener of listeners) {
      try {
        listener(model());
      } catch {
      }
    }
  };
  function retire(notice) {
    generation++;
    for (const controller of requests) controller.abort();
    passage = null;
    blockIndex = initialBlockIndex;
    busy = false;
    phase = attached ? "idle" : "closed";
    message = notice;
    emit();
  }
  function closeView(notice) {
    if (closed) return;
    closed = true;
    attachment++;
    attached = false;
    scope = null;
    offOwner();
    offOwner = () => {
    };
    retire(notice);
  }
  async function load(index = blockIndex) {
    if (!model().canLoad || !Number.isSafeInteger(index) || index < context.from || index > context.to) return;
    const g = ++generation, expected = scope, abort = new AbortController();
    let timer;
    const current = () => enabled() && generation === g && scope === expected && !abort.signal.aborted;
    const reference = { version: 1, bookId: context.bookId, editionId: context.editionId, blockIndex: index, start: null, end: null };
    const params = new URLSearchParams({ book: reference.bookId, edition: reference.editionId, block: String(index) });
    const url = origin + "/api/great-books/passage?" + params;
    blockIndex = index;
    passage = null;
    busy = true;
    phase = "loading";
    message = "Checking this source block and its exact edition\u2026";
    requests.add(abort);
    emit();
    try {
      const result = await Promise.race([(async () => {
        if (!current()) throw Error("Reading lifetime ended");
        const response = await config.passageTransport(url, { method: "GET", headers: {}, cache: "no-store", redirect: "error", credentials: "omit", signal: abort.signal });
        if (!current() || response.status !== 200 || response.redirected || response.url !== url) throw Error("Reading response unavailable");
        const parsed = parseBookPassage(await response.json());
        if (!current() || !parsed || !samePassageReference(parsed.reference, reference) || !matchesReadingEdition(parsed.metadata, context) || !metadataMatches(parsed)) throw Error("Reading source not verified");
        return parsed;
      })(), new Promise((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(Error("Reading deadline exceeded"));
        }, timeout);
      })]);
      if (!current()) return;
      passage = result;
      busy = false;
      phase = result.reason === null ? "ready" : "unsupported";
      message = result.reason === null ? "Verified text from the selected source edition. Line breaks are preserved." : result.reason === "table" ? "This source block contains a table. Its text is not available in this reader; nothing has been skipped." : result.reason === "non_text" ? "This source block contains an image, equation or other nontext content. It is not available in this reader; nothing has been skipped." : "This source block has no text to display. Nothing has been skipped.";
      emit();
    } catch {
      if (!closed && attached && active && online && generation === g && scope === expected && config.owner.scope() === expected) {
        passage = null;
        busy = false;
        phase = "unavailable";
        message = "This exact source block could not be verified. Retry it manually; no text or reading progress is being assumed.";
        emit();
      }
    } finally {
      clearTimeout(timer);
      requests.delete(abort);
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
      if (attached || closed) return;
      attached = true;
      const connectedAt = ++attachment;
      const stop = config.owner.subscribe(() => {
        if (!attached || closed || connectedAt !== attachment) return;
        closeView("Account changed. The reading view was closed. Check the Circle and choose its reading again.");
      });
      if (!attached || closed || connectedAt !== attachment) {
        stop();
        return;
      }
      offOwner = stop;
      scope = config.owner.scope();
      retire(!active ? "The reading view is inactive." : !online ? "Network access is unavailable. Reconnect, then load the reading manually." : config.passageTransport ? "Load this exact reading selection when ready." : "Text reading is unavailable in this connection.");
    },
    disconnect() {
      attachment++;
      attached = false;
      scope = null;
      offOwner();
      offOwner = () => {
      };
      retire("Reading view closed.");
    },
    activity(value) {
      active = value;
      if (!value) retire("Reading view cleared while inactive. Load again when ready.");
      else emit();
    },
    connectivity(value) {
      online = value;
      if (!value) retire("Reading view cleared while offline. Reconnect, then load it manually.");
      else emit();
    },
    load: () => load(),
    next: () => model().canNext ? load(blockIndex + 1) : Promise.resolve(),
    previous: () => model().canPrevious ? load(blockIndex - 1) : Promise.resolve(),
    retry: () => model().canRetry ? load() : Promise.resolve(),
    close() {
      closeView("Reading view closed. Nothing loads automatically.");
    }
  };
}

// lib/circles/membership.ts
var membershipRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var membershipText = (value, max) => typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
var membershipInteger = (value, max = Number.MAX_SAFE_INTEGER) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
function membershipDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
var nullableText = (value, max) => value === null || membershipText(value, max);
function capabilities(value) {
  if (!membershipRecord(value) || !["canJoin", "canLeave", "canRsvp", "canComplete", "canReadConversation"].every((key) => typeof value[key] === "boolean")) return null;
  return { canJoin: value.canJoin, canLeave: value.canLeave, canRsvp: value.canRsvp, canComplete: value.canComplete, canReadConversation: value.canReadConversation };
}
function viewer(value) {
  if (!membershipRecord(value) || !["signed_in", "is_member", "is_host"].every((key) => typeof value[key] === "boolean") || !value.signed_in && (value.is_member || value.is_host)) return null;
  return { signed_in: value.signed_in, is_member: value.is_member, is_host: value.is_host };
}
function publicCircle(value) {
  if (!membershipRecord(value) || !isUuid(value.id) || !membershipText(value.title, 200) || !value.title.trim() || !nullableText(value.description, 2e3) || !["in_person", "online", "hybrid"].includes(String(value.format)) || !["format_label", "venue_label", "meeting_label", "status", "host_name", "timezone"].every((key) => membershipText(value[key], 200)) || !["forming", "active", "completed"].includes(String(value.status)) || !["city", "region", "venue_name"].every((key) => nullableText(value[key], 200)) || !membershipInteger(value.weekday, 6) || !membershipText(value.time, 5) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) || !membershipDay(value.start_date) || !membershipDay(value.first_meeting) || value.next_meeting !== null && !membershipDay(value.next_meeting) || !membershipInteger(value.week) || value.week < 1 || !membershipInteger(value.member_count, 1e5) || !membershipInteger(value.max_members, 12) || value.max_members < 3 || !membershipInteger(value.spots_left, 12) || value.going_next !== null && !membershipInteger(value.going_next, 1e5) || typeof value.hidden !== "boolean") return null;
  const publicProfileId = parsePublicProfileReference(value.publicProfileId);
  if (publicProfileId === void 0 || value.hidden && publicProfileId !== null) return null;
  let reading = null;
  const program = value.reading_program == null ? null : parseReadingProgram(value.reading_program);
  if (value.reading_program != null && !program) return null;
  const programLength = program?.sessions.length ?? 12;
  if (value.program_length !== void 0 && value.program_length !== programLength || value.week > programLength + 1 || program && value.reading !== null) return null;
  if (value.reading !== null) {
    const r = value.reading;
    if (!membershipRecord(r) || !membershipInteger(r.week, 12) || r.week < 1 || r.week !== value.week || !["title", "slug", "author", "selection"].every((key) => membershipText(r[key], 1e3))) return null;
    reading = { week: r.week, title: r.title, slug: r.slug, author: r.author, selection: r.selection };
  }
  return {
    id: value.id.toLowerCase(),
    title: value.title,
    description: value.description,
    format: value.format,
    format_label: value.format_label,
    city: value.city,
    region: value.region,
    venue_name: value.venue_name,
    venue_label: value.venue_label,
    meeting_label: value.meeting_label,
    weekday: value.weekday,
    time: value.time,
    timezone: value.timezone,
    start_date: value.start_date,
    first_meeting: value.first_meeting,
    next_meeting: value.next_meeting,
    week: value.week,
    reading,
    reading_program: program,
    program_length: programLength,
    member_count: value.member_count,
    max_members: value.max_members,
    spots_left: value.spots_left,
    status: value.status,
    host_name: value.host_name,
    publicProfileId,
    going_next: value.going_next,
    hidden: value.hidden
  };
}
function summary(value) {
  if (!membershipRecord(value) || !membershipInteger(value.revision) || typeof value.ended !== "boolean") return null;
  const circle = publicCircle(value.circle), who = viewer(value.viewer), can = capabilities(value.capabilities);
  if (!circle || !who || !can || (value.ended || circle.hidden) && circle.next_meeting !== null || circle.spots_left !== (value.ended ? 0 : Math.max(0, circle.max_members - circle.member_count)) || circle.status === "completed" && !value.ended || circle.hidden && !who.is_member && !who.is_host || can.canJoin && (!who.signed_in || who.is_member || circle.hidden || value.ended || circle.spots_left === 0) || can.canLeave && !who.is_member || can.canRsvp && (!who.is_member || circle.hidden || value.ended) || can.canComplete && (!who.is_host || circle.status === "completed") || can.canReadConversation && (!who.is_member || circle.hidden)) return null;
  return { circle, revision: value.revision, viewer: who, ended: value.ended, capabilities: can };
}
function parseCircleDetail(value, circleId) {
  if (!membershipRecord(value) || value.ready !== true || !Array.isArray(value.meetings) || value.meetings.length > 4) return null;
  const base = summary(value);
  if (!base || circleId !== void 0 && base.circle.id !== circleId.toLowerCase() || (base.ended || base.circle.hidden) && value.meetings.length !== 0) return null;
  const start = /* @__PURE__ */ new Date(`${base.circle.start_date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + (base.circle.weekday - start.getUTCDay() + 7) % 7);
  if (start.toISOString().slice(0, 10) !== base.circle.first_meeting) return null;
  const first = start.getTime(), weekMs = 7 * 24 * 60 * 60 * 1e3;
  const meetings = [];
  for (const meeting of value.meetings) {
    if (!membershipRecord(meeting) || !membershipDay(meeting.date) || !membershipInteger(meeting.going, 1e5) || ![null, "going", "not_going"].includes(meeting.my_status) || meetings.length > 0 && meetings.at(-1).date >= meeting.date || !base.viewer.is_member && meeting.my_status !== null) return null;
    const index = (Date.parse(`${meeting.date}T00:00:00Z`) - first) / weekMs;
    if (!Number.isInteger(index) || index < 0 || index >= base.circle.program_length) return null;
    meetings.push({ date: meeting.date, going: meeting.going, my_status: meeting.my_status });
  }
  if (base.circle.next_meeting !== (meetings[0]?.date ?? null)) return null;
  if (base.viewer.is_member && !base.ended && !base.circle.hidden && base.circle.format !== "in_person" && value.online_url === null) return null;
  let online_url = null;
  if (value.online_url !== null) {
    if (!base.viewer.is_member || base.circle.hidden || base.circle.format === "in_person" || typeof value.online_url !== "string" || value.online_url.length > 2048) return null;
    try {
      const url = new URL(value.online_url);
      if (url.protocol !== "https:" || url.username || url.password) return null;
      online_url = base.ended ? null : url.href;
    } catch {
      return null;
    }
  }
  return { ...base, ready: true, meetings, online_url };
}
export {
  MESSAGE_AI_DISCLOSURE,
  MESSAGE_AI_POLICY,
  MESSAGE_AI_POLICY_HREF,
  MESSAGE_BLOCK_CONFIRMATION,
  MESSAGE_BLOCK_PRIVACY,
  MESSAGE_REPORT_OPTIONS,
  MESSAGE_WITHDRAWAL_PRIVACY,
  PHILEMON_EDITION_METADATA,
  approvedOrigin,
  circleAuthorizationHeaders,
  createCircleHost,
  createCircleReading,
  createMemberContributions,
  createVerifiedSupabaseCircleOwner,
  discussionContentSuffix,
  hasCircleAuthority,
  isPhilemonReading,
  memberCircleConfig,
  parseCircleDetail,
  philemonReadingText,
  safePrivateMeetingUrl,
  starterReadingContext
};
