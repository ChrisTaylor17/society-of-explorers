import { createMobileClient } from "./client.ts";
import { DEMO_LABEL, REVOCATION_LIMIT } from "./copy.ts";
import { createFixturePort, HOST, PLAN_ID } from "./fixture.ts";
import { createHttpPort } from "./http.ts";
import type { Phase, ScreenModel } from "./types.ts";

export const PHASE_LABEL: Record<Phase, string> = {
  loading: "Loading",
  offline: "Offline",
  "expired-session": "Session expired",
  discover: "Discover",
  visibility: "Who may see what",
  "join-pending": "Pending write",
  "join-ambiguous": "Ambiguous write",
  mutual: "Mutual acceptance",
  revoked: "Revoked",
  withdrawn: "Participation ended",
  "failed-refresh": "Failed refresh",
  "live-blocked": "Live server blocked",
};

export async function collectGallery(): Promise<ScreenModel[]> {
  const loading = createMobileClient(createFixturePort());

  const offline = createMobileClient(createFixturePort());
  offline.setOnline(false);
  await offline.boot();

  const expiredPort = createFixturePort();
  expiredPort.expireSession();
  const expired = createMobileClient(expiredPort);
  await expired.boot();

  const discover = createMobileClient(createFixturePort());
  await discover.boot();

  const visibility = createMobileClient(createFixturePort());
  await visibility.boot();
  await visibility.reviewPlan(PLAN_ID);

  const pendingPort = createFixturePort();
  pendingPort.failNext("join", "pending");
  const pending = createMobileClient(pendingPort);
  await pending.boot();
  await pending.reviewPlan(PLAN_ID);
  await pending.requestJoin(PLAN_ID, "join-pending-key");

  const ambiguousPort = createFixturePort();
  ambiguousPort.failNext("join", "drop-before");
  const ambiguous = createMobileClient(ambiguousPort);
  await ambiguous.boot();
  await ambiguous.reviewPlan(PLAN_ID);
  await ambiguous.requestJoin(PLAN_ID, "join-ambiguous-key");

  const mutualPort = createFixturePort();
  const mutual = createMobileClient(mutualPort);
  await mutual.boot();
  await mutual.requestJoin(PLAN_ID, "join-committed-key");
  mutualPort.scriptHostAcceptsPlan();
  await mutual.refresh();
  await mutual.acceptDisclosure("grant-key");
  mutualPort.scriptHostGrantsContact();
  await mutual.refresh();

  const revokedPort = createFixturePort();
  const revoked = createMobileClient(revokedPort);
  await walkToMutual(revoked, revokedPort, "revoke-path");
  await revoked.revokeContact("revoke-key");

  const stalePort = createFixturePort();
  const stale = createMobileClient(stalePort);
  await walkToMutual(stale, stalePort, "stale-path");
  stalePort.pushStaleRead({ version: 1, title: "Leaked title", contact: HOST.relay });
  await stale.refresh();

  const blocked = createMobileClient(createHttpPort());
  await blocked.boot();

  return [
    loading.screen(),
    offline.screen(),
    expired.screen(),
    discover.screen(),
    visibility.screen(),
    pending.screen(),
    ambiguous.screen(),
    mutual.screen(),
    revoked.screen(),
    stale.screen(),
    blocked.screen(),
  ];
}

async function walkToMutual(
  client: ReturnType<typeof createMobileClient>,
  port: ReturnType<typeof createFixturePort>,
  suffix: string,
): Promise<void> {
  await client.boot();
  await client.requestJoin(PLAN_ID, `join-${suffix}`);
  port.scriptHostAcceptsPlan();
  await client.refresh();
  await client.acceptDisclosure(`grant-${suffix}`);
  port.scriptHostGrantsContact();
  await client.refresh();
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

export function renderGallery(screens: ScreenModel[]): string {
  const phones = screens.map((screen) => renderPhone(screen)).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SoE mobile client — ${esc(DEMO_LABEL)}</title>
  <style>
    :root {
      --paper: #f6f3e9;
      --card: #fffdf8;
      --ink: #24352c;
      --muted: #5d6b60;
      --moss: #2f6a45;
      --moss-deep: #1e4a30;
      --line: #d7d3c4;
      --rust: #8f3d24;
      --warn: #f8ecd4;
      --bad: #f8e4dc;
      --good: #e5f0e4;
      --serif: Georgia, "Iowan Old Style", Palatino, serif;
      --sans: "Avenir Next", Avenir, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(900px 420px at 8% -10%, rgba(47, 106, 69, 0.1), transparent 60%),
        var(--paper);
      font-family: var(--sans);
      line-height: 1.45;
    }
    header.page, footer.page { width: min(1180px, calc(100% - 2rem)); margin: 0 auto; }
    header.page { padding: 1.5rem 0 0.5rem; }
    header.page h1 { font-family: var(--serif); font-weight: 500; font-size: 2.4rem; letter-spacing: -0.03em; margin: 0.2rem 0; }
    header.page p, footer.page p { color: var(--muted); max-width: 46rem; }
    .banner { display: inline-block; border: 1px solid var(--moss); color: var(--moss-deep); border-radius: 999px; padding: 0.15rem 0.7rem; letter-spacing: 0.06em; text-transform: uppercase; font-size: 0.72rem; }
    .grid { width: min(1180px, calc(100% - 2rem)); margin: 0 auto 2rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
    .phone { background: var(--card); border: 1px solid var(--line); border-radius: 28px; padding: 0.9rem 0.9rem 1rem; box-shadow: 0 18px 40px rgba(36, 53, 44, 0.06); display: flex; flex-direction: column; gap: 0.45rem; }
    .status { display: flex; justify-content: space-between; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
    .phase { margin: 0; color: var(--moss-deep); font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; }
    h2 { font-family: var(--serif); font-weight: 500; font-size: 1.55rem; line-height: 1.15; margin: 0; }
    .lede, .relay, .limit, li, dd { font-size: 0.92rem; }
    .lede { margin: 0; }
    dl { margin: 0; display: grid; gap: 0.35rem; }
    .fact { border-top: 1px solid var(--line); padding-top: 0.35rem; }
    dt { font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
    dd { margin: 0.1rem 0 0; }
    .relay, .limit, .blocker { border-radius: 12px; padding: 0.55rem 0.7rem; margin: 0; }
    .relay { background: var(--paper); }
    .memory { background: var(--good); }
    .limit { background: var(--warn); }
    .blocker { background: var(--bad); }
    ul { list-style: none; padding: 0; margin: 0.2rem 0 0; display: flex; flex-direction: column; gap: 0.35rem; }
    li { border: 1px solid var(--line); border-radius: 999px; padding: 0.35rem 0.7rem; }
    li.on { background: var(--moss); color: white; border-color: var(--moss); }
    li.off { color: var(--muted); }
    footer.page { padding-bottom: 2rem; }
  </style>
</head>
<body>
  <header class="page">
    <p class="banner">${esc(DEMO_LABEL)}</p>
    <h1>SoE mobile client</h1>
    <p>Adult journey on synthetic fixtures: discover a plan, review who may see what, request to join, mutual acceptance, and revoke future contact. ${esc(REVOCATION_LIMIT)} This page is a local gallery. It is not a deployed preview and it does not talk to Meridian.</p>
  </header>
  <main class="grid">
    ${phones}
  </main>
  <footer class="page">
    <p>${esc(REVOCATION_LIMIT)} Live participant writes are refused at the HTTP adapter.</p>
  </footer>
</body>
</html>
`;
}

function renderPhone(screen: ScreenModel): string {
  const facts = screen.facts
    .map(
      (fact) =>
        `<div class="fact"><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}</dd></div>`,
    )
    .join("");
  const enabled = screen.actions.filter((action) => action.enabled);
  const actions = (enabled.length > 0 ? enabled : [{ label: "Nothing to send from this state." }])
    .map((action) => `<li class="${"enabled" in action && action.enabled ? "on" : "off"}">${esc(action.label)}</li>`)
    .join("");
  const blockers = screen.blockers.map((blocker) => `<p class="blocker">${esc(blocker)}</p>`).join("");
  const relayClass = screen.relay.state === "memory" ? "relay memory" : "relay";
  const relayText = screen.relay.value ? `${screen.relay.value}. ${screen.relay.note}` : screen.relay.note;
  return `<article class="phone" data-phase="${esc(screen.phase)}">
    <div class="status"><span>SoE</span><span>${esc(screen.banner)}</span></div>
    <p class="phase">${esc(PHASE_LABEL[screen.phase])}</p>
    <p class="eyebrow">${esc(screen.eyebrow)}</p>
    <h2>${esc(screen.title)}</h2>
    <p class="lede">${esc(screen.lede)}</p>
    <dl>${facts}</dl>
    <p class="${relayClass}">${esc(relayText)}</p>
    ${blockers}
    <p class="limit">${esc(screen.revocationNote)}</p>
    <ul>${actions}</ul>
  </article>`;
}
