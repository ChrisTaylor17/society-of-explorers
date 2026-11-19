import { mkdirSync, writeFileSync } from "node:fs";
import { PLAN_ID, assertNoRelay, boot, request, signIn, write } from "../tests/helpers.js";

const steps = [];

function record(name, result, note) {
  const text = JSON.stringify(result.body);
  steps.push({
    name,
    http: result.status,
    cache: result.cache,
    status: result.body?.status ?? null,
    relayPresent: text.includes("relay:"),
    contact: result.body?.data?.other?.contact ?? null,
    note,
    body: result.body,
  });
}

const { url, stop } = await boot();
try {
  const health = await request(url, "/api/health");
  record("GET /api/health", health, "no session");
  const jules = await signIn(url, "jules");
  const ada = await signIn(url, "ada");
  record("POST /api/session jules", { status: 200, cache: "no-store", body: { status: "ok", expiresAt: jules.expiresAt, person: jules.person } }, "token omitted in the trace");
  record("POST /api/session ada", { status: 200, cache: "no-store", body: { status: "ok", expiresAt: ada.expiresAt, person: ada.person } }, "token omitted in the trace");

  record("GET /api/plans", await request(url, "/api/plans", { token: jules.token }), "discover, before any join");
  record("GET /api/plans/plan-riverside", await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token }), "contact hidden");
  record("POST /api/writes/join", await write(url, jules.token, "join", "jules", "trace-join", { planId: PLAN_ID }), "Jules asks to join");
  record("POST /api/writes/join retry", await write(url, jules.token, "join", "jules", "trace-join", { planId: PLAN_ID }), "same key, same result");
  record(
    "POST /api/writes/accept as Jules",
    await write(url, jules.token, "accept", "jules", "trace-accept-guest", { planId: PLAN_ID, requesterId: "jules" }),
    "guest cannot accept",
  );
  record(
    "POST /api/writes/accept as Ada",
    await write(url, ada.token, "accept", "ada", "trace-accept", { planId: PLAN_ID, requesterId: "jules" }),
    "host accepts the join",
  );
  record("GET plan after host accept", await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token }), "still no relay");
  record(
    "POST /api/writes/grant Jules",
    await write(url, jules.token, "grant", "jules", "trace-grant-j", { planId: PLAN_ID, otherId: "ada" }),
    "one grant is not enough",
  );
  record("GET plan one grant", await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token }), "relay still hidden");
  record(
    "POST /api/writes/grant Ada",
    await write(url, ada.token, "grant", "ada", "trace-grant-a", { planId: PLAN_ID, otherId: "jules" }),
    "mutual acceptance",
  );
  const open = await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token });
  record("GET plan mutual", open, "Jules sees Ada's relay");
  record("GET plan as Ada", await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token }), "Ada sees Jules's relay");
  record(
    "POST /api/writes/revoke",
    await write(url, jules.token, "revoke", "jules", "trace-revoke", { permissionId: open.body.data.other.myGrantId }),
    "future access stops",
  );
  record("GET plan after revoke", await request(url, `/api/plans/${PLAN_ID}`, { token: jules.token }), "relay omitted on the later read");
  record("GET plan Ada after revoke", await request(url, `/api/plans/${PLAN_ID}`, { token: ada.token }), "Ada's later read omits it too");
  record("GET visibility after revoke", await request(url, `/api/plans/${PLAN_ID}/visibility`, { token: jules.token }), "copies already seen are not recalled");
} finally {
  await stop();
}

for (const step of steps) {
  if (step.note !== "Jules sees Ada's relay" && step.note !== "Ada sees Jules's relay") {
    if (step.relayPresent) throw new Error(`Relay present at ${step.name}`);
  } else if (!step.relayPresent) {
    throw new Error(`Expected a relay at ${step.name}`);
  }
}
assertNoRelay(steps.find((step) => step.name === "GET plan after revoke").body);

const lines = steps.map((step) => {
  return [
    `## ${step.name}`,
    `HTTP ${step.http}  cache=${step.cache}  status=${step.status}  relay=${step.relayPresent ? "present" : "absent"}`,
    step.note,
    JSON.stringify(step.body, null, 2),
    "",
  ].join("\n");
});
const text = [
  "SoE join/revoke local trace",
  "Label: working local prototype",
  "Revoking stops future contact access. It cannot erase information someone already saw.",
  "",
  ...lines,
].join("\n");

mkdirSync("/tmp/soe-join-revoke", { recursive: true });
writeFileSync("/tmp/soe-join-revoke-trace.txt", text);
mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync("/opt/cursor/artifacts/soe-join-revoke-trace.txt", text);

const rows = steps
  .map((step) => {
    const relay = step.relayPresent ? "present" : "absent";
    return `<tr><td>${step.name}</td><td>${step.http}</td><td>${step.status ?? ""}</td><td>${relay}</td><td>${step.note}</td></tr>`;
  })
  .join("");
const html = `<!doctype html>
<meta charset="utf-8">
<title>SoE join and revoke trace</title>
<style>
  body { font: 16px/1.4 system-ui, sans-serif; margin: 32px; color: #1c1915; background: #f6f3ec; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  p { max-width: 46rem; }
  table { border-collapse: collapse; width: 100%; background: white; }
  th, td { border: 1px solid #d9d2c5; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #efe8da; }
  .absent { color: #0b6b3a; font-weight: 600; }
  .present { color: #8a3b12; font-weight: 600; }
</style>
<h1>Join, accept, revoke</h1>
<p>Working local prototype. Synthetic people Ada Linden and Jules Okonkwo. The relay is absent until both contact grants are active, and absent again on reads after revoke.</p>
<p>Revoking stops future contact access. It cannot erase information someone already saw.</p>
<table>
  <thead><tr><th>Call</th><th>HTTP</th><th>Status</th><th>Relay</th><th>What happened</th></tr></thead>
  <tbody>${rows.replaceAll("<td>absent</td>", '<td class="absent">absent</td>').replaceAll("<td>present</td>", '<td class="present">present</td>')}</tbody>
</table>`;
writeFileSync("/opt/cursor/artifacts/soe-join-revoke-trace.html", html);
writeFileSync("/tmp/soe-join-revoke-trace.html", html);
console.log(text);
console.log("Wrote /tmp/soe-join-revoke-trace.txt and /opt/cursor/artifacts/soe-join-revoke-trace.html");
