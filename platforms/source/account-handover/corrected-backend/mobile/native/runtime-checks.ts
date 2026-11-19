import { NativeModules, Platform } from "react-native";
import { createNativeSession } from "../src/native-session.ts";
import { payloadHash } from "../src/hash.ts";
import { localPrototypeOrigin } from "../../prototypes/soe-join-revoke/integration/mobile-local-port.ts";

const PLAN = "plan-riverside";
type Session = ReturnType<typeof createNativeSession>;
type Row = { name: string; passed: boolean; durationMs: number; error?: string };
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function hidden(session: Session) {
  expect(session.client.heldRelay() === null && session.client.screen().relay.value === null, "Contact must stay hidden");
  const owned = session.client as unknown as { plan: unknown; memory: unknown };
  expect(!/relay:ada\.linden|relay:jules\.okonkwo/.test(JSON.stringify({plan: owned.plan, memory: owned.memory})), "Controller-owned plan/memory must drop contact references");
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

export async function recordAndroidAudit(url: string, event: Record<string, unknown>) {
  if (!__DEV__ || Platform.OS !== "android") return;
  await fetch(localPrototypeOrigin(url).origin + "/__runtime/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
}

export async function prepareAndroidLifecycleJourney(url: string, session: Session, update: () => void) {
  expect(__DEV__ && Platform.OS === "android", "Development Android only");
  const origin = localPrototypeOrigin(url).origin;
  const post = async (path: string, body: unknown, token?: string) => {
    const r = await fetch(origin + path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const value = await r.json(); expect(r.ok, "Synthetic lifecycle request"); return value;
  };
  const stage = async (name: string) => { update(); await recordAndroidAudit(origin, { tag: name, phase: session.client.screen().phase, heldRelay: session.client.heldRelay() !== null, at: new Date().toISOString() }); };
  const host = await post("/api/session", { magicName: "ada", passcode: "synthetic-ada" });
  const write = (endpoint: string, body: unknown) => post(`/api/writes/${endpoint}`, { personId: "ada", idempotencyKey: `lifecycle-host-${endpoint}`, payloadHash: payloadHash(body), body }, host.token);
  await session.client.reviewPlan(PLAN); await stage("visibility");
  await session.shell.requestJoin(PLAN); await stage("joined-withheld");
  await write("accept", { planId: PLAN, requesterId: "jules" }); await session.client.refresh(); await stage("accepted-withheld");
  await session.shell.acceptDisclosure(); hidden(session); await stage("one-sided-withheld");
  await write("grant", { planId: PLAN, otherId: "jules" }); await session.client.refresh();
  expect(session.client.heldRelay() === "relay:ada.linden", "Mutual native journey must reveal fixture contact");
  await stage("mutual-visible");
}

/** Explicit development-only test runner, never a product sign-in or host UI. */
export async function runAndroidRuntimeChecks(url: string, update: (rows: Row[]) => void, embeddedSynthetic = false) {
  expect(__DEV__ && Platform.OS === "android", "Requires Android development runtime");
  const origin = localPrototypeOrigin(url).origin;
  const rows: Row[] = [];
  const redirectCases: {code: number; destination: string; method: string; originHits: number; destinationHits: number}[] = [];
  const json = async (path: string, input?: unknown, token?: string) => {
    const response = await fetch(origin + path, { method: input === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: input === undefined ? undefined : JSON.stringify(input) });
    expect(response.ok, `Test request failed at ${path}`); return response.json();
  };
  let serial = 0;
  const hostWrite = (token: string, endpoint: string, body: unknown) => json(`/api/writes/${endpoint}`, { personId: "ada", idempotencyKey: `android-host-${++serial}`, payloadHash: payloadHash(body), body }, token);
  async function pair(fetcher: typeof fetch = fetch, visible = true) {
    const session = createNativeSession({ development: true, mode: "local-http", origin, fetcher });
    await session.client.boot(); await session.client.reviewPlan(PLAN); await session.shell.requestJoin(PLAN);
    const ada = await json("/api/session", { magicName: "ada", passcode: "synthetic-ada" });
    expect(ada.status === "ok", "Synthetic Ada sign-in");
    expect((await hostWrite(ada.token, "accept", { planId: PLAN, requesterId: "jules" })).status === "committed", "Host acceptance");
    await session.client.refresh(); hidden(session);
    if (visible) {
      await session.shell.acceptDisclosure(); hidden(session);
      await hostWrite(ada.token, "grant", { planId: PLAN, otherId: "jules" });
      await session.client.refresh(); expect(session.client.heldRelay() === "relay:ada.linden", "Reciprocal consent reveals fixture relay");
    }
    return { session, ada };
  }
  async function check(name: string, run: () => Promise<void>) {
    await json("/__runtime/reset", {});
    const start = Date.now();
    try { await run(); rows.push({ name, passed: true, durationMs: Date.now() - start }); }
    catch (error) { rows.push({ name, passed: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : "Unknown test failure" }); }
    update([...rows]);
  }

  await check("reciprocal consent, separate host revoke and next-read denial", async () => {
    const { session, ada } = await pair();
    const hostPlan = await json(`/api/plans/${PLAN}`, undefined, ada.token);
    await hostWrite(ada.token, "revoke", { permissionId: hostPlan.data.other.myGrantId });
    await session.client.refresh(); hidden(session);
  });
  for (const reconcile of [false, true]) {
    await check(`known revoke rejects stale native-fetch response (${reconcile ? "lookup" : "direct"})`, async () => {
      let replay: unknown; let useReplay = false; let lose = false;
      const fetcher: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        if (String(input).endsWith(`/api/plans/${PLAN}`)) {
          if (useReplay) return new Response(JSON.stringify(replay), { headers: { "content-type": "application/json" } });
          replay = await response.clone().json();
        }
        if (lose && String(input).endsWith("/api/writes/revoke")) throw new Error("Deliberate loss after real server commit");
        return response;
      };
      const { session } = await pair(fetcher);
      useReplay = true; lose = reconcile;
      await session.shell.revokeContact(); hidden(session);
      if (reconcile) {
        expect(session.client.screen().truthful === "unknown", "Lost receipt must remain unknown");
        const entry = session.client.ledgerEntries().find(row => row.endpoint === "revoke"); expect(entry, "Stored revoke key");
        await session.client.reconcile(entry.endpoint, entry.key); hidden(session);
      }
      expect(session.client.screen().phase === "failed-refresh", "Older contact response rejected after confirmed revoke");
    });
  }
  await check("recognized expiry cannot be revived or retried by foreground", async () => {
    let signs = 0; let reads = 0; let replay: unknown; let useReplay = false;
    const fetcher: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/api/session")) signs++;
      const response = await fetch(input, init);
      if (String(input).endsWith(`/api/plans/${PLAN}`)) {
        reads++;
        if (useReplay) return new Response(JSON.stringify(replay));
        const result = await response.clone().json(); if (result.status === "ok") replay = result;
      }
      return response;
    };
    const { session } = await pair(fetcher);
    await json("/__runtime/expire", {}); await session.client.refresh(); hidden(session);
    expect(session.client.screen().phase === "expired-session", "Expiry recognized");
    const prior = reads; useReplay = true;
    await session.client.boot(); await session.client.foregroundRefresh();
    hidden(session); expect(session.client.screen().phase === "expired-session" && reads === prior && signs === 1, "Terminal expiry without re-sign-in or stale read");
  });
  await check("queued revoke immediately invalidates a delayed native-fetch read", async () => {
    let hold = false; const started = deferred(); const deliver = deferred();
    const writeStarted = deferred(); const releaseWrite = deferred();
    const fetcher: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (hold && String(input).endsWith(`/api/plans/${PLAN}`)) { hold = false; started.resolve(); await deliver.promise; }
      if (String(input).endsWith("/api/writes/revoke")) { writeStarted.resolve(); await releaseWrite.promise; }
      return response;
    };
    const { session } = await pair(fetcher); hold = true;
    const refresh = session.client.refresh(); await started.promise;
    const revoke = session.shell.revokeContact(); hidden(session);
    try {
      deliver.resolve(); const returned = await refresh;
      expect(returned.relay.value === null, "Delayed returned screen must stay hidden before revoke completes");
      await writeStarted.promise; hidden(session);
    } finally { deliver.resolve(); releaseWrite.resolve(); await revoke; }
    hidden(session);
  });
  await check("fresh Android session creates new consent intent after previous grant was revoked", async () => {
    const { session: first } = await pair(); await first.shell.revokeContact(); hidden(first);
    const second = createNativeSession({ development: true, mode: "local-http", origin });
    await second.client.boot(); await second.client.reviewPlan(PLAN); await second.client.refresh();
    await second.shell.acceptDisclosure(); expect(second.client.heldRelay() === "relay:ada.linden", "Fresh consent not replayed as an old revoked grant");
    await first.client.refresh(); hidden(first); expect(first.client.screen().phase === "expired-session", "Previous token isolated");
  });
  await check("late reads and queued foreground authorization stay hidden after a later background", async () => {
    let hold = false; const started = deferred(); const deliver = deferred();
    const fetcher: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (hold && String(input).endsWith(`/api/plans/${PLAN}`)) { hold = false; started.resolve(); await deliver.promise; }
      return response;
    };
    const { session } = await pair(fetcher); hold = true;
    const pending = session.client.refresh(); await started.promise;
    session.activity("background"); hidden(session);
    const decision = session.activity("active"); const queued = decision?.kind === "refresh" ? decision.run() : Promise.resolve();
    session.activity("inactive"); deliver.resolve(); await pending; await queued; hidden(session);
    const next = session.activity("active"); if (next?.kind === "refresh") await next.run();
    expect(session.client.heldRelay() === "relay:ada.linden", "Valid later foreground can refresh");
  });
  for (const receipt of ["direct", "lookup"]) {
    await check(`missing read version cannot bypass confirmed revoke (${receipt})`, async () => {
      let old: any; let replay = false;
      const fetcher: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        if (String(input).endsWith(`/api/plans/${PLAN}`)) {
          if (replay) { const invalid = JSON.parse(JSON.stringify(old)); delete invalid.version; return new Response(JSON.stringify(invalid)); }
          old = await response.clone().json();
        }
        if (receipt === "lookup" && replay && String(input).endsWith("/api/writes/revoke")) throw new Error("Deliberate receipt loss after commit");
        return response;
      };
      const { session } = await pair(fetcher); replay = true;
      await session.shell.revokeContact();
      if (receipt === "lookup") {
        const entry = session.client.ledgerEntries().find(row => row.endpoint === "revoke"); expect(entry, "Revoke key");
        await session.client.reconcile(entry.endpoint, entry.key);
        expect(entry.status === "committed", "Well-formed lookup receipt commits the revoke");
      }
      await session.client.foregroundRefresh(); hidden(session);
      expect(session.client.screen().truthful !== "committed", "Malformed read must fail closed");
    });
    await check(`malformed revoke ${receipt} receipt stays unknown`, async () => {
      let corrupt = false;
      const fetcher: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        if (corrupt && String(input).endsWith("/api/writes/revoke")) {
          if (receipt === "lookup") throw new Error("Deliberate receipt loss after commit");
          const invalid = await response.json(); delete invalid.version; return new Response(JSON.stringify(invalid));
        }
        if (corrupt && String(input).endsWith("/api/lookup")) {
          const invalid = await response.json(); delete invalid.result.version; return new Response(JSON.stringify(invalid));
        }
        return response;
      };
      const { session } = await pair(fetcher); corrupt = true;
      await session.shell.revokeContact();
      const entry = session.client.ledgerEntries().find(row => row.endpoint === "revoke"); expect(entry, "Revoke key");
      if (receipt === "lookup") await session.client.reconcile(entry.endpoint, entry.key);
      hidden(session); expect(entry.status === "ambiguous" && session.client.screen().truthful === "unknown", "Malformed receipt cannot become committed");
    });
  }
  if (embeddedSynthetic) {
    for (const code of [301, 302, 303, 307, 308]) {
      await check(`native transport rejects ${code} redirects without forwarding session-shaped headers`, async () => {
        await json("/__runtime/redirect-reset", {});
        for (const destination of ["cross", "same"]) {
          for (const method of ["GET", "POST"]) {
            const before = await json("/__runtime/redirect-stats");
            const path = `/__runtime/redirect/${code}/${destination}`;
            const priorHits = before.originHits.filter((hit: {path: string; method: string}) => hit.path === path && hit.method === method).length;
            let rejected = false;
            try {
              await fetch(`${origin}/__runtime/redirect/${code}/${destination}`, {
                method, headers: { authorization: "Bearer synthetic-noncredential-canary", cookie: "soe_synthetic_canary=1", "content-type": "application/json" },
                body: method === "POST" ? JSON.stringify({ synthetic: true }) : undefined,
              });
            } catch { rejected = true; }
            const after = await json("/__runtime/redirect-stats");
            const reached = after.originHits.filter((hit: {path: string; method: string}) => hit.path === path && hit.method === method).length;
            expect(reached === priorHits + 1, "Each rejected request must actually reach its redirect fixture");
            expect(after.redirectHits.length === 0 && after.landingHits.length === 0, "Each redirect destination stays untouched");
            redirectCases.push({code, destination, method, originHits: reached - priorHits, destinationHits: after.redirectHits.length + after.landingHits.length});
            expect(rejected, "Native transport must reject the redirect before following it");
          }
        }
        const stats = await json("/__runtime/redirect-stats");
        expect(stats.redirectHits.length === 0 && stats.landingHits.length === 0, "No redirect destination may receive a request, authorization, cookie or body");
      });
    }
    await check("native transport rejects a direct nonapproved origin before transmission", async () => {
      await json("/__runtime/redirect-reset", {});
      let rejected = false;
      try { await fetch("http://127.0.0.1:8788/capture", { headers: { authorization: "Bearer synthetic-noncredential-canary" } }); }
      catch { rejected = true; }
      const stats = await json("/__runtime/redirect-stats");
      expect(rejected && stats.redirectHits.length === 0, "Nonapproved origin must be refused before the request is sent");
    });
    await check("embedded local HTTP demo still requires its backend and never silently selects fixture", async () => {
      const before = await json("/__runtime/counts");
      const signs = before.requests.filter((row: { path: string }) => row.path === "/api/session").length;
      await json("/__runtime/backend-state", { available: false });
      try {
        const session = createNativeSession({ development: true, mode: "local-http", origin });
        await session.client.boot(); hidden(session);
        expect(session.fixture === null && session.client.screen().phase === "live-blocked", "Backend outage must block access without fixture fallback");
        const after = await json("/__runtime/counts");
        expect(after.requests.filter((row: { path: string }) => row.path === "/api/session").length === signs, "Failed prototype proof must not send sign-in material");
      } finally { await json("/__runtime/backend-state", { available: true }); }
    });
  }
  const bundleSource = NativeModules.SourceCode?.getConstants?.()?.scriptURL ?? NativeModules.SourceCode?.scriptURL ?? "unknown";
  const redirectEvidence = embeddedSynthetic ? await json("/__runtime/redirect-stats") : null;
  const report = { scope: "Android synthetic runtime controller checks", platform: Platform.OS, engine: (globalThis as { HermesInternal?: unknown }).HermesInternal ? "Hermes" : "unknown", embedded_synthetic: embeddedSynthetic, metro_required: !embeddedSynthetic, backend_required: true, script_url: bundleSource, redirect_evidence: redirectEvidence, redirect_cases: redirectCases, completed_at_utc: new Date().toISOString(), tests: rows, passed: rows.filter(row => row.passed).length, failed: rows.filter(row => !row.passed).length, boundaries: "Runs actual controllers and native fetch in Android. Some response delivery faults and lifecycle decisions are injected in JavaScript; Android instrumentation separately drives real AppState transitions. Redirect fixtures use noncredential synthetic canaries. No real personal data." };
  console.info("SOE_ANDROID_RUNTIME_REPORT", JSON.stringify(report));
  await json("/__runtime/report", report);
  return report;
}
