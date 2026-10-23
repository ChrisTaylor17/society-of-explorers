import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..");

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) return [];
        const value = match[2].trim().replace(/^['"]|['"]$/g, "");
        return value ? [[match[1], value]] : [];
      }),
  );
}

const fileEnv = Object.assign(
  {},
  readEnvFile(resolve(repoRoot, ".env")),
  readEnvFile(resolve(repoRoot, ".env.production")),
  readEnvFile(resolve(repoRoot, ".env.local")),
  readEnvFile(resolve(projectRoot, ".env.local")),
  readEnvFile(resolve(projectRoot, ".vercel/.env.production.local")),
);

function env(name) {
  return process.env[name] || fileEnv[name] || "";
}

function createWalletSession(memberId) {
  const secret = env("WALLET_SESSION_SECRET") || env("NEXTAUTH_SECRET");
  assert(secret, "WALLET_SESSION_SECRET or NEXTAUTH_SECRET is required for live execution smoke.");
  const payload = `v1:${memberId}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `v1.${memberId}.${signature}`;
}

function parseSse(buffer) {
  return buffer
    .split("\n\n")
    .flatMap((chunk) => {
      const eventLine = chunk.split("\n").find((line) => line.startsWith("event: "));
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (!eventLine || !dataLine) return [];
      return [{
        event: eventLine.slice("event: ".length),
        data: JSON.parse(dataLine.slice("data: ".length)),
      }];
    });
}

const baseUrl = env("PROMPT_ATLAS_BASE_URL");
assert(
  baseUrl && /^https?:\/\//.test(baseUrl),
  "Set PROMPT_ATLAS_BASE_URL to the deployed Prompt Atlas origin before running live execution smoke.",
);

const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
assert(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL is missing.");
assert(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is missing.");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const walletAddress = `0x${randomBytes(20).toString("hex")}`;
let memberId = null;

try {
  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      wallet_address: walletAddress,
      display_name: "Prompt Atlas Live Smoke",
      exp_tokens: 0,
    })
    .select("id")
    .single();
  assert(!memberError, `Could not create smoke member: ${memberError?.message || "unknown"}`);
  memberId = member.id;

  const session = createWalletSession(memberId);
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/prompts/execute`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `soe_wallet_id=${session}`,
    },
    body: JSON.stringify({
      promptId: "10000000-0000-4000-8000-000000000001",
      promptText: "Help me turn this uncertain choice into one honest next move.",
      context: "I am choosing the next launch task for a privacy-first prompt marketplace.",
    }),
  });

  assert.equal(response.status, 200, `Expected execution stream, got ${response.status}.`);
  assert.match(response.headers.get("content-type") || "", /^text\/event-stream/);
  assert.match(response.headers.get("cache-control") || "", /private, no-store/);

  const body = await response.text();
  const events = parseSse(body);
  assert(events.some((entry) => entry.event === "meta"), "Execution stream did not include meta.");
  assert(events.some((entry) => entry.event === "delta" && entry.data.text), "Execution stream did not include text deltas.");
  assert(events.some((entry) => entry.event === "done"), "Execution stream did not finish.");

  const { data: runs, error: runsError } = await supabase
    .from("prompt_runs")
    .select("id,member_id,prompt_id,input_hash,status,model,input_tokens,output_tokens,latency_ms,error_code,created_at,completed_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(3);
  assert(!runsError, `Could not inspect smoke run: ${runsError?.message || "unknown"}`);
  assert.equal(runs.length, 1, "Expected exactly one smoke prompt run.");
  assert.equal(runs[0].status, "completed");
  assert.match(runs[0].input_hash, /^[0-9a-f]{64}$/);
  assert.equal("prompt_text" in runs[0], false);
  assert.equal("context" in runs[0], false);
  assert.ok(Number(runs[0].input_tokens) > 0, "Completed run should record input tokens.");
  assert.ok(Number(runs[0].output_tokens) > 0, "Completed run should record output tokens.");
  assert.ok(Number(runs[0].latency_ms) > 0, "Completed run should record latency.");

  console.log(`Prompt Atlas live execution smoke passed at ${baseUrl}.`);
} finally {
  if (memberId) {
    const { error } = await supabase.from("members").delete().eq("id", memberId);
    if (error) console.warn("Prompt Atlas smoke cleanup could not delete temporary member.");
  }
}
