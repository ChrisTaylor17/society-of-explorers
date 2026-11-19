import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const DEFAULT_PORT = Number(process.env.PROMPT_ATLAS_UI_SMOKE_PORT || 3110);
const CONFIGURED_BASE_URL = process.env.PROMPT_ATLAS_BASE_URL;
const DEFAULT_BASE_URL = `http://localhost:${DEFAULT_PORT}`;
const SCREENSHOT_DIR = new URL("../.next/ui-smoke/", import.meta.url);
const screenshotPath = (name) => fileURLToPath(new URL(name, SCREENSHOT_DIR));
const START_TIMEOUT_MS = 45_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url) {
  const started = Date.now();
  while (Date.now() - started < START_TIMEOUT_MS) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Keep polling while Next starts.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startServer() {
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--port", String(DEFAULT_PORT)],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => {
    if (process.env.PROMPT_ATLAS_UI_SMOKE_VERBOSE) process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    if (process.env.PROMPT_ATLAS_UI_SMOKE_VERBOSE) process.stderr.write(chunk);
  });

  return child;
}

async function isPromptAtlasServer(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes("Find a question") || html.includes("Prompt Atlas");
  } catch {
    return false;
  }
}

async function resolveServer() {
  if (CONFIGURED_BASE_URL) {
    await waitForServer(CONFIGURED_BASE_URL);
    return { baseUrl: CONFIGURED_BASE_URL, server: null };
  }

  const candidates = [
    DEFAULT_BASE_URL,
    "http://localhost:3100",
    "http://localhost:3000",
    "http://127.0.0.1:3100",
    "http://127.0.0.1:3000",
  ];
  for (const candidate of [...new Set(candidates)]) {
    if (await isPromptAtlasServer(candidate)) {
      return { baseUrl: candidate, server: null };
    }
  }

  const server = startServer();
  await waitForServer(DEFAULT_BASE_URL);
  return { baseUrl: DEFAULT_BASE_URL, server };
}

async function pageMetrics(page) {
  return page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    height: document.documentElement.clientHeight,
    bodyHeight: document.body.scrollHeight,
    h1: document.querySelector("h1")?.textContent || "",
  }));
}

async function waitForHydration(page) {
  await page
    .waitForResponse((response) => response.url().includes("/api/auth/session"), {
      timeout: 15_000,
    })
    .catch(() => null);
  await page.waitForTimeout(150);
}

function assertNoOverflow(metrics, label) {
  assert(
    metrics.scrollWidth <= metrics.width,
    `${label} has horizontal overflow: ${metrics.scrollWidth}px > ${metrics.width}px`,
  );
}

async function mockOperatorMetrics(page) {
  await page.route("**/api/operator/metrics", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow",
      },
      body: JSON.stringify({
        metrics: {
          generatedAt: "2026-06-19T12:00:00.000Z",
          monthStart: "2026-06-01T00:00:00.000Z",
          nextMonthStart: "2026-07-01T00:00:00.000Z",
          activatedMembers: 64,
          activeExplorers: 31,
          paidActiveSubscriptions: 2,
          trialingSubscriptions: 1,
          scheduledCancellations: 0,
          recoverySubscriptions: 1,
          restartableSubscriptions: 3,
          freeLimitMembers: 7,
          completedRuns: 42,
          providerStartedRuns: 45,
          inputTokens: 91000,
          outputTokens: 38000,
          estimatedModelCostCents: 83,
          subscriptionRunRateCents: 2400,
          estimatedMtdSubscriptionRevenueCents: 1520,
          estimatedModelContributionCents: 1437,
          paidConversionPercent: 3.1,
        },
      }),
    });
  });
}

async function smokeOperatorDashboard(page, baseUrl) {
  await mockOperatorMetrics(page);
  await page.goto(new URL("/operator", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await expectText(page.locator("main"), [
    "Operator evidence",
    "Revenue evidence",
    "Launch board",
    "What to do before buying attention",
    "MRR target",
    "Run economics",
    "Next operator moves",
    "Aggregate by design",
    "not a member list or profit statement",
  ]);
  const operator = await pageMetrics(page);
  assertNoOverflow(operator, "desktop operator dashboard");
  await page.screenshot({ path: screenshotPath("desktop-operator.png"), fullPage: true });
}

async function smokeDesktop(page, baseUrl) {
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  const discovery = await pageMetrics(page);
  assertNoOverflow(discovery, "desktop discovery");
  assert(
    discovery.h1.includes("Find a question"),
    "desktop discovery did not render the main headline",
  );
  await expectText(page.locator("main"), [
    "Revenue path",
    "Profit loop",
    "Proof to collect",
    "Open packs",
    "Find the smallest honest offer",
    "Price this offer without apology",
  ]);
  assert(
    await page.getByRole("button", { name: "Signal this prompt" }).isVisible(),
    "desktop discovery signal action is missing",
  );
  await page.screenshot({ path: screenshotPath("desktop-discovery.png"), fullPage: true });
  await page.getByRole("button", { name: /Price this offer without apology/ }).click();
  await expectText(page.locator("article"), ["Price this offer without apology"]);

  await page.goto(new URL("/p/create-a-one-page-business", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await waitForHydration(page);
  await expectText(page.locator("article"), ["Create a one-page business"]);
  await page
    .getByRole("button", { name: "Copy share link for Create a one-page business" })
    .click();
  await page.getByRole("button", { name: "Share link copied" }).waitFor();
  const shareLink = new URL(page.url());
  assert(
    shareLink.pathname === "/p/create-a-one-page-business",
    "desktop prompt deep link did not preserve the clean prompt path",
  );
  const linkedDiscovery = await pageMetrics(page);
  assertNoOverflow(linkedDiscovery, "desktop prompt deep link");

  await page
    .getByRole("navigation", { name: "Prompt Atlas" })
    .getByRole("button", { name: "Packs" })
    .click();
  await expectText(page.locator("main"), [
    "Prompt packs",
    "Revenue loop",
    "Pick the move that can become paid",
    "Revenue Launch",
    "Community Market",
    "Sovereignty Audit",
    "Pack economics",
    "Paid validation brief",
    "No private prompt context",
  ]);
  await page
    .getByRole("button", { name: /Community Market Member-value offer map/ })
    .click();
  await expectText(page.locator("main"), [
    "Convert shared energy into a paid ritual",
    "Member-value offer map",
    "Upgrade when the community has a real audience",
  ]);
  await page.getByRole("button", { name: "Inspect revenue loop" }).first().click();
  await expectText(page.locator("main"), [
    "Turn one useful idea into the smallest honest offer",
    "Paid validation brief",
  ]);
  const packs = await pageMetrics(page);
  assertNoOverflow(packs, "desktop packs");
  await page.screenshot({ path: screenshotPath("desktop-packs.png"), fullPage: true });
  await page
    .getByRole("button", { name: /Open Revenue Launch step 2: Price this offer without apology/ })
    .click();
  await expectText(page.locator("main"), ["Price this offer without apology", "Launch path"]);
  await expectText(page.locator("main"), ["Profit loop", "Target artifact", "Fair exchange test"]);
  const packWorkspace = await pageMetrics(page);
  assertNoOverflow(packWorkspace, "desktop pack workspace");
  await page.getByRole("button", { name: "Back to discovery" }).click();
  await page.getByRole("button", { name: "Community" }).waitFor();

  await page.getByRole("button", { name: "Community" }).click();
  await expectText(page.locator("main"), [
    "Prompts that move",
    "Community momentum",
    "Create prompt",
    "View Pro",
    "Discover prompts",
    "Fastest mover",
    "Most saved",
    "Most signaled",
    "Market signals",
    "Leaderboard",
  ]);
  await page.getByRole("button", { name: "Sort community leaderboard by signals" }).click();
  await expectText(page.locator("main"), ["Prompts members explicitly marked as useful"]);
  const community = await pageMetrics(page);
  assertNoOverflow(community, "desktop community");
  await page.screenshot({ path: screenshotPath("desktop-community.png"), fullPage: true });

  await page.getByRole("button", { name: "Discover prompts" }).click();
  await page.getByRole("button", { name: "Customize" }).waitFor();

  await page.getByRole("button", { name: "Customize" }).click();
  await page.locator("#prompt-text").waitFor();
  await page.locator("#prompt-context").waitFor();
  await expectText(page.locator("main"), ["Launch path", "Find my first ten customers"]);
  await page
    .getByRole("button", { name: /Launch path 4: Write a landing page that earns trust/ })
    .click();
  await expectText(page.locator("main"), ["Write a landing page that earns trust"]);
  await page.locator("#prompt-text").waitFor();
  await page.waitForTimeout(450);
  const workspace = await pageMetrics(page);
  assertNoOverflow(workspace, "desktop workspace");
  await page.screenshot({ path: screenshotPath("desktop-workspace.png"), fullPage: true });

  await page.getByRole("button", { name: "View Prompt Atlas Pro plan" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await expectText(dialog, ["$12", "Unlimited prompt runs", "Sign in to upgrade"]);
  const dialogBox = await dialog.boundingBox();
  assert(dialogBox && dialogBox.x >= 0, "desktop Pro dialog is outside the viewport");
  assert(
    dialogBox && dialogBox.x + dialogBox.width <= 1440,
    "desktop Pro dialog overflows the viewport",
  );
  await page.screenshot({ path: screenshotPath("desktop-pro-dialog.png"), fullPage: true });

  await smokeOperatorDashboard(page, baseUrl);
}

async function smokeMobile(page, baseUrl) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  const discovery = await pageMetrics(page);
  assertNoOverflow(discovery, "mobile discovery");
  assert(
    await page.getByRole("button", { name: "Open navigation" }).isVisible(),
    "mobile navigation button is missing",
  );
  assert(
    await page.getByRole("button", { name: "Shuffle prompts" }).isVisible(),
    "mobile shuffle control is missing",
  );
  await expectText(page.locator("main"), ["Revenue path"]);
  await page
    .getByRole("button", { name: /Revenue path 3: Find my first ten customers/ })
    .click();
  await expectText(page.locator("article"), ["Find my first ten customers"]);
  const revenuePath = await pageMetrics(page);
  assertNoOverflow(revenuePath, "mobile revenue path");
  await page.screenshot({ path: screenshotPath("mobile-discovery.png"), fullPage: true });

  await page.getByRole("button", { name: "Customize" }).click();
  await page.locator("#prompt-text").waitFor();
  await expectText(page.locator("main"), ["Launch path"]);
  await page
    .getByRole("button", { name: /Launch path 2: Price this offer without apology/ })
    .click();
  await expectText(page.locator("main"), ["Price this offer without apology"]);
  await page.locator("#prompt-text").waitFor();
  await page.waitForTimeout(300);
  const mobileWorkspace = await pageMetrics(page);
  assertNoOverflow(mobileWorkspace, "mobile workspace");
  await page.screenshot({ path: screenshotPath("mobile-workspace.png"), fullPage: true });
  await page.getByRole("button", { name: "Back to discovery" }).click();
  await page.getByRole("button", { name: "Open navigation" }).waitFor();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Mobile Prompt Atlas" })
    .getByRole("button", { name: "Packs" })
    .click();
  await expectText(page.locator("main"), [
    "Prompt packs",
    "Revenue loop",
    "Pick the move that can become paid",
    "Revenue Launch",
    "Community Market",
    "Sovereignty Audit",
    "Paid validation brief",
  ]);
  await page
    .getByRole("button", { name: /Sovereignty Audit Sovereignty risk brief/ })
    .click();
  await expectText(page.locator("main"), [
    "Increase conversion by making the trust bargain clearer",
    "Sovereignty risk brief",
  ]);
  const mobilePacks = await pageMetrics(page);
  assertNoOverflow(mobilePacks, "mobile packs");
  await page.screenshot({ path: screenshotPath("mobile-packs.png"), fullPage: true });
  await page.getByRole("button", { name: "Discover prompts" }).click();
  await page.getByRole("button", { name: "Open navigation" }).waitFor();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Mobile Prompt Atlas" })
    .getByRole("button", { name: "Community" })
    .click();
  await expectText(page.locator("main"), [
    "Prompts that move",
    "Create prompt",
    "View Pro",
    "Fastest mover",
    "Most saved",
    "Most signaled",
    "Market signals",
    "Leaderboard",
  ]);
  await page.getByRole("button", { name: "Sort community leaderboard by saves" }).click();
  await expectText(page.locator("main"), ["Prompts members are keeping for later"]);
  const community = await pageMetrics(page);
  assertNoOverflow(community, "mobile community");
  await page.screenshot({ path: screenshotPath("mobile-community.png"), fullPage: true });

  await page.getByRole("button", { name: "View Prompt Atlas Pro plan" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await expectText(dialog, ["$12", "Unlimited prompt runs", "Sign in to upgrade"]);
  const dialogBox = await dialog.boundingBox();
  assert(dialogBox && dialogBox.x >= 0, "mobile Pro dialog is outside the viewport");
  assert(
    dialogBox && dialogBox.x + dialogBox.width <= 390,
    "mobile Pro dialog overflows the viewport",
  );
  const metrics = await pageMetrics(page);
  assertNoOverflow(metrics, "mobile Pro dialog");
  await page.screenshot({ path: screenshotPath("mobile-pro-dialog.png"), fullPage: true });
}

async function expectText(locator, snippets) {
  const started = Date.now();
  let text = "";
  while (Date.now() - started < 5_000) {
    text = (await locator.textContent()) || "";
    if (snippets.every((snippet) => text.includes(snippet))) return;
    await delay(100);
  }
  for (const snippet of snippets) {
    assert(text.includes(snippet), `Expected locator text to include "${snippet}"`);
  }
}

const { baseUrl, server } = await resolveServer();
try {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const consoleIssues = [];
  try {
    const desktop = await browser.newPage();
    desktop.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        consoleIssues.push(`[desktop:${message.type()}] ${message.text()}`);
      }
    });
    desktop.on("pageerror", (error) => {
      consoleIssues.push(`[desktop:pageerror] ${error.message}`);
    });
    await smokeDesktop(desktop, baseUrl);

    const mobile = await browser.newPage({ isMobile: true, deviceScaleFactor: 2 });
    mobile.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        consoleIssues.push(`[mobile:${message.type()}] ${message.text()}`);
      }
    });
    mobile.on("pageerror", (error) => {
      consoleIssues.push(`[mobile:pageerror] ${error.message}`);
    });
    await smokeMobile(mobile, baseUrl);
  } finally {
    await browser.close();
  }

  assert(consoleIssues.length === 0, consoleIssues.join("\n"));
  console.log(`Prompt Atlas UI smoke checks passed at ${baseUrl}.`);
  console.log(`Screenshots saved in ${SCREENSHOT_DIR.pathname}`);
} finally {
  if (server) server.kill("SIGTERM");
}
