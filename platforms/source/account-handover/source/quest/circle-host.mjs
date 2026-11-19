// candidate/corrected-backend/mobile/src/circles/path.ts
var CIRCLE_BOOK_ID = "soe-circles-path";

// candidate/corrected-backend/mobile/src/circles/discussion-reader.ts
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

// candidate/corrected-backend/mobile/src/circles/discussion-composer.ts
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

// candidate/corrected-backend/mobile/src/circles/participation-session.ts
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

// candidate/corrected-backend/mobile/src/circles/host.ts
function approvedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw Error("Explicit HTTPS application origin required");
  return url.origin;
}
function createCircleHost(config) {
  if (typeof config?.owner?.scope !== "function" || typeof config.owner.bearer !== "function" || typeof config.owner.subscribe !== "function" || typeof config.transport !== "function")
    throw Error("Existing session owner and approved transport required");
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
    if (path !== `/api/book-salons/${encodeURIComponent(config.circleId)}` || !["GET", "POST"].includes(options.method))
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
        if (options.method === "POST" && [401, 403, 404].includes(response.status))
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
  const participation = createCircleParticipationSession(request, config.circleId);
  const model = () => ({
    configured: true,
    connected: attached && scope !== null,
    active,
    online,
    status: !attached || !scope ? "Connect the existing member session to read this circle." : !active ? "Private circle views cleared while inactive." : !online ? "Offline. Private views and draft cleared. Requests already sent may still complete." : "Refresh to check current circle membership.",
    participation: participation.model()
  });
  const emit = () => {
    for (const listener of listeners)
      listener(model());
  };
  participation.subscribe(emit);
  const sync = () => {
    abortPending();
    scope = config.owner.scope();
    participation.retire();
    participation.activity(attached && active && online && scope !== null);
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
      participation.activity(false);
      emit();
    },
    activity(value) {
      if (!value)
        abortPending();
      active = value;
      participation.activity(attached && active && online && scope !== null);
      emit();
    },
    connectivity(value) {
      if (!value)
        abortPending();
      online = value;
      participation.activity(attached && active && online && scope !== null);
      emit();
    },
    async refresh() {
      if (scope && current(scope))
        await participation.open();
    },
    edit: participation.edit,
    clearDraft: participation.clearDraft,
    post: participation.post,
    startNewAfterReview: participation.startNewAfterReview,
    close() {
      abortPending();
      participation.close();
    }
  };
}
// candidate/corrected-backend/mobile/src/circles/supabase-owner.ts
function createExistingSupabaseCircleOwner(auth) {
  let generation = 0, lifetime = 0, started = false, subject = null, scope = null, off = () => {};
  const listeners = new Set;
  const emit = () => {
    for (const listener of listeners)
      listener();
  };
  function adopt(session) {
    generation++;
    subject = session?.user.id || null;
    scope = subject ? `existing-owner-${generation}` : null;
    emit();
  }
  const owner = {
    scope: () => scope,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async bearer(expected) {
      const operation = generation, expectedSubject = subject;
      if (!started || !scope || scope !== expected)
        return null;
      try {
        const result = await auth.getSession();
        if (result.error || !started || generation !== operation || scope !== expected || result.data.session?.user.id !== expectedSubject) {
          if (generation === operation)
            adopt(null);
          return null;
        }
        return result.data.session.access_token;
      } catch {
        if (generation === operation)
          adopt(null);
        return null;
      }
    }
  };
  return {
    owner,
    async start() {
      if (started)
        return;
      started = true;
      const run = ++lifetime;
      const subscription = auth.onAuthStateChange((_event, session) => {
        if (started && run === lifetime)
          adopt(session);
      });
      off = () => subscription.data.subscription.unsubscribe();
      const operation = generation;
      try {
        const result = await auth.getSession();
        if (started && run === lifetime && operation === generation)
          adopt(result.error ? null : result.data.session);
      } catch {
        if (started && run === lifetime && operation === generation)
          adopt(null);
      }
    },
    stop() {
      lifetime++;
      started = false;
      const detach = off;
      off = () => {};
      adopt(null);
      try {
        detach();
      } catch {}
    }
  };
}
// candidate/corrected-backend/mobile/src/circles/verified-member-session.ts
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
// candidate/corrected-backend/mobile/src/circles/native-ports.ts
var fail = () => Error("Native member service unavailable");
var size = (s) => {
  let n = 0;
  for (let i = 0;i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 128)
      n++;
    else if (c < 2048)
      n += 2;
    else if (c >= 55296 && c <= 56319 && i + 1 < s.length && s.charCodeAt(i + 1) >= 56320 && s.charCodeAt(i + 1) <= 57343) {
      n += 4;
      i++;
    } else
      n += 3;
  }
  return n;
};
var lanes = new WeakMap;
function timed(p, ms) {
  let timer;
  return Promise.race([p, new Promise((_, reject) => {
    timer = setTimeout(() => reject(fail()), ms);
  })]).finally(() => clearTimeout(timer));
}
async function createNativeMemberPorts(bridge, config) {
  const origin = approvedOrigin(config.origin), key = config.storageKey, timeout = config.timeoutMs ?? 15000;
  if (!bridge || !/^[A-Za-z0-9._-]{1,160}$/.test(key) || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000)
    throw fail();
  if (!["capabilities", "begin", "send", "cancel", "read", "write", "remove"].every((name) => typeof bridge[name] === "function"))
    throw fail();
  let caps;
  try {
    caps = await timed(bridge.capabilities(), timeout);
  } catch {
    throw fail();
  }
  if (caps?.version !== 1 || caps.origin !== origin || caps.storageKey !== key || caps.redirectPolicy !== "reject-before-send" || caps.storagePolicy !== "os-protected")
    throw fail();
  let map = lanes.get(bridge);
  if (!map) {
    map = new Map;
    lanes.set(bridge, map);
  }
  let lane = map.get(key);
  if (!lane) {
    lane = { tail: Promise.resolve(), generation: 0, quarantined: false, requests: new Set, retirements: new Set };
    map.set(key, lane);
  }
  const queue = lane, generation = lane.generation;
  let retired = false;
  const current = () => queue.generation === generation && !queue.quarantined;
  const slot = (value) => {
    if (value === key)
      return "session";
    if (value === key + "-code-verifier")
      return "pkce";
    if (value === key + "-user")
      return "user";
    throw fail();
  };
  const enqueue = (work, keepAfterTimeout = false) => {
    if (!current())
      return Promise.reject(fail());
    let expired = false;
    const pending = queue.tail.then(() => {
      if (!current() || expired && !keepAfterTimeout)
        throw fail();
      return work();
    });
    queue.tail = pending.then(() => {}, () => {});
    return timed(pending, timeout).catch(() => {
      expired = true;
      throw fail();
    });
  };
  const storage = {
    getItem(name) {
      const s = slot(name);
      return enqueue(async () => {
        if (retired)
          throw fail();
        const value = await bridge.read(s);
        if (retired || !current() || value !== null && (typeof value !== "string" || size(value) > 65536))
          throw fail();
        return value;
      });
    },
    setItem(name, value) {
      const s = slot(name);
      if (typeof value !== "string" || size(value) > 65536)
        throw fail();
      return enqueue(async () => {
        if (retired)
          throw fail();
        await bridge.write(s, value);
        if (!current())
          throw fail();
      });
    },
    removeItem(name) {
      const s = slot(name);
      return enqueue(() => {
        if (retired)
          throw fail();
        return bridge.remove(s);
      });
    }
  };
  const transport = async (url, init) => {
    let id;
    const lifetime = new AbortController, signal = lifetime.signal, abortLifetime = () => lifetime.abort();
    if (init.signal.aborted)
      lifetime.abort();
    else
      init.signal.addEventListener("abort", abortLifetime, { once: true });
    queue.requests.add(lifetime);
    try {
      const u = new URL(url), headers = Object.entries(init.headers), allowed = headers.every(([name]) => ["authorization", "content-type"].includes(name.toLowerCase()));
      const auth = headers.filter(([name]) => name.toLowerCase() === "authorization");
      const ct = headers.filter(([name]) => name.toLowerCase() === "content-type");
      const match = auth.length === 1 && /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(auth[0][1]);
      if (!current() || u.origin !== origin || u.username || u.password || u.search || u.hash || !/^\/api\/book-salons\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(u.pathname) || !allowed || !match || match[1].length > 16384 || init.redirect !== "error" || init.credentials !== "omit" || init.cache !== "no-store" || signal.aborted || !["GET", "POST"].includes(init.method) || ct.length > 1 || init.method === "GET" && (init.body !== undefined || ct.length !== 0) || init.method === "POST" && (ct.length !== 1 || ct[0][1] !== "application/json" || typeof init.body !== "string" || size(init.body) > 16384))
        throw fail();
      id = await timed(bridge.begin(), timeout);
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || signal.aborted || !current())
        throw fail();
      const requestId = id;
      let rejectAbort = () => {};
      const aborted = new Promise((_, reject) => {
        rejectAbort = reject;
      });
      const abort = () => {
        Promise.resolve().then(() => bridge.cancel(requestId)).catch(() => {});
        rejectAbort(fail());
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        if (signal.aborted || !current())
          throw fail();
        const response = await timed(Promise.race([bridge.send(requestId, { url, method: init.method, bearer: match[1], ...init.body === undefined ? {} : { body: init.body } }), aborted]), timeout);
        if (signal.aborted || !current() || !Number.isInteger(response.status) || response.status < 100 || response.status > 599 || response.status >= 300 && response.status < 400 || response.redirected !== false || response.url !== url || typeof response.body !== "string" || size(response.body) > 1048576)
          throw fail();
        return { status: response.status, url: response.url, redirected: false, json: async () => JSON.parse(response.body) };
      } finally {
        signal.removeEventListener("abort", abort);
      }
    } catch {
      if (id)
        Promise.resolve().then(() => bridge.cancel(id)).catch(() => {});
      throw fail();
    } finally {
      queue.requests.delete(lifetime);
      init.signal.removeEventListener("abort", abortLifetime);
    }
  };
  return {
    transport,
    storage,
    retireStorage() {
      retired = true;
    },
    onAccountRetired(listener) {
      if (!current()) {
        listener();
        return () => {};
      }
      queue.retirements.add(listener);
      return () => {
        queue.retirements.delete(listener);
      };
    },
    async resetAccountStorage() {
      if (retired || queue.generation !== generation)
        throw fail();
      const transition = ++queue.generation;
      queue.quarantined = true;
      for (const request of queue.requests)
        request.abort();
      for (const listener of Array.from(queue.retirements)) {
        try {
          listener();
        } catch {}
      }
      queue.retirements.clear();
      let expired = false;
      const pending = queue.tail.then(async () => {
        for (const s of ["session", "pkce", "user"])
          await bridge.remove(s);
        if (expired || queue.generation !== transition)
          throw fail();
        queue.quarantined = false;
      });
      queue.tail = pending.then(() => {}, () => {});
      try {
        await timed(pending, timeout);
      } catch {
        expired = true;
        throw fail();
      }
    }
  };
}
// candidate/corrected-backend/mobile/src/circles/native-member-binding.ts
var unavailable = () => Error("Native member session unavailable");
async function prepareNativeMemberBinding(options) {
  const origin = approvedOrigin(options.origin);
  const ports = await createNativeMemberPorts(options.bridge, options);
  let closed = false, bound = false;
  let offAccountRetirement = () => {};
  const requests = new Set;
  const subscriptions = new Set;
  const assertOpen = () => {
    if (closed)
      throw unavailable();
  };
  const transport = async (url, init) => {
    assertOpen();
    const controller = new AbortController;
    const abort = () => controller.abort();
    if (init.signal.aborted)
      throw unavailable();
    init.signal.addEventListener("abort", abort, { once: true });
    requests.add(controller);
    try {
      if (closed || init.signal.aborted)
        throw unavailable();
      const result = await ports.transport(url, { ...init, signal: controller.signal });
      assertOpen();
      return result;
    } catch {
      throw unavailable();
    } finally {
      requests.delete(controller);
      init.signal.removeEventListener("abort", abort);
    }
  };
  function bind(auth, circleId, verificationTimeoutMs) {
    assertOpen();
    if (bound || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(circleId) || !auth || typeof auth.getSession !== "function" || typeof auth.getUser !== "function" || typeof auth.onAuthStateChange !== "function" || verificationTimeoutMs !== undefined && (!Number.isSafeInteger(verificationTimeoutMs) || verificationTimeoutMs < 1 || verificationTimeoutMs > 60000))
      throw unavailable();
    bound = true;
    const guardedAuth = {
      async getSession() {
        assertOpen();
        try {
          const result = await auth.getSession();
          assertOpen();
          return result;
        } catch {
          throw unavailable();
        }
      },
      async getUser(jwt) {
        assertOpen();
        try {
          const result = await auth.getUser(jwt);
          assertOpen();
          return result;
        } catch {
          throw unavailable();
        }
      },
      onAuthStateChange(listener) {
        assertOpen();
        let detached = false;
        const entry = { retire() {
          if (!detached) {
            try {
              listener("SOE_BINDING_CLOSED", null);
            } catch {}
            detach();
          }
        } };
        let unsubscribe = () => {};
        function detach() {
          if (detached)
            return;
          detached = true;
          subscriptions.delete(entry);
          try {
            unsubscribe();
          } catch {}
        }
        try {
          const sub = auth.onAuthStateChange((event) => {
            if (!closed && !detached)
              listener(event, null);
          });
          if (typeof sub?.data?.subscription?.unsubscribe !== "function")
            throw unavailable();
          unsubscribe = () => sub.data.subscription.unsubscribe();
          subscriptions.add(entry);
          if (closed)
            entry.retire();
          return { data: { subscription: { unsubscribe: detach } } };
        } catch {
          detach();
          throw unavailable();
        }
      }
    };
    return { origin, circleId, auth: guardedAuth, transport, ...verificationTimeoutMs === undefined ? {} : { verificationTimeoutMs } };
  }
  function close() {
    if (closed)
      return;
    closed = true;
    offAccountRetirement();
    for (const controller of requests)
      controller.abort();
    ports.retireStorage();
    for (const sub of Array.from(subscriptions))
      sub.retire();
  }
  offAccountRetirement = ports.onAccountRetired(close);
  return { storage: ports.storage, bind, close, async resetAccountStorage() {
    await ports.resetAccountStorage();
  } };
}
export {
  approvedOrigin,
  createCircleHost,
  createCircleParticipationSession,
  createExistingSupabaseCircleOwner,
  createNativeMemberPorts,
  createVerifiedSupabaseCircleOwner,
  prepareNativeMemberBinding
};
