import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const failures = [];

async function record(label, check) {
  try {
    await check();
  } catch (error) {
    failures.push(`${label}: ${error?.message || String(error)}`);
  }
}

function isMissingRpc(error) {
  return ["PGRST202", "PGRST204"].includes(error?.code);
}

async function assertQuery(label, query) {
  const { error, status, statusText } = await query;
  assert(!error, `${label} failed: ${formatError(error, status, statusText)}`);
}

async function assertRpcExists(supabase, name, args) {
  const { error, status, statusText } = await supabase.rpc(name, args);
  assert(error, `${name} accepted invalid smoke arguments unexpectedly.`);
  assert(!isMissingRpc(error), `${name} is missing from the Supabase schema cache.`);
  assert(status !== 401 && status !== 403, `${name} authorization failed: ${formatError(error, status, statusText)}`);
}

async function assertUnlimitedProReservation(supabase) {
  const suffix = randomBytes(8).toString("hex");
  const walletAddress = `0x${randomBytes(20).toString("hex")}`;
  let memberId = null;

  try {
    const { data: member, error: memberError } = await supabase
      .from("members")
      .insert({
        wallet_address: walletAddress,
        display_name: "Prompt Atlas DB Readiness Smoke",
        exp_tokens: 0,
      })
      .select("id")
      .single();
    assert(!memberError, `Could not create temporary member: ${memberError?.message || "unknown"}`);
    memberId = member.id;

    const { error: entitlementError } = await supabase
      .from("prompt_entitlements")
      .upsert({
        member_id: memberId,
        plan: "explorer_pro",
        stripe_customer_id: `cus_prompt_atlas_smoke_${suffix}`,
        stripe_subscription_id: `sub_prompt_atlas_smoke_${suffix}`,
        stripe_price_id: `price_prompt_atlas_smoke_${suffix}`,
        subscription_status: "active",
        current_period_end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        cancel_at_period_end: false,
        stripe_event_created: Math.floor(Date.now() / 1000),
        stripe_event_id: `evt_prompt_atlas_smoke_${suffix}`,
      });
    assert(!entitlementError, `Could not create temporary Pro entitlement: ${entitlementError?.message || "unknown"}`);

    const { data: rows, error: reserveError, status, statusText } = await supabase.rpc(
      "reserve_prompt_run",
      {
        p_member_id: memberId,
        p_prompt_id: null,
        p_input_hash: randomBytes(32).toString("hex"),
      },
    );
    assert(!reserveError, `reserve_prompt_run rejected active Pro member: ${formatError(reserveError, status, statusText)}`);

    const reservation = Array.isArray(rows) ? rows[0] : rows;
    assert(reservation, "reserve_prompt_run returned no reservation row.");
    assert(
      reservation.plan === "explorer_pro",
      "active Pro reservation did not use explorer_pro plan.",
    );
    assert(
      reservation.runs_limit === null,
      "active Pro reservation must return null runs_limit for unlimited monthly runs.",
    );
    assert(
      Number(reservation.runs_used) === 1,
      "temporary Pro reservation should count exactly one smoke run.",
    );
  } finally {
    if (memberId) {
      const { error } = await supabase.from("members").delete().eq("id", memberId);
      if (error) {
        failures.push(`cleanup temporary Pro reservation member: ${error.message || "unknown"}`);
      }
    }
  }
}

function formatError(error, status, statusText) {
  return [
    error?.code || "unknown",
    status ? `status ${status}` : "",
    statusText || "",
    error?.message || "",
    error?.details || "",
    error?.hint || "",
  ]
    .filter(Boolean)
    .join(" ");
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
assert(url, "NEXT_PUBLIC_SUPABASE_URL is missing.");
assert(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is missing.");

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

await record("prompts table contract", () =>
  assertQuery(
    "prompts table contract",
    supabase
      .from("prompts")
      .select("id,slug,title,description,category,prompt_text,tags,usage_count,is_featured,visibility,published_at,created_at", {
        count: "exact",
        head: true,
      }),
  ),
);
await record("prompt_runs accounting contract", () =>
  assertQuery(
    "prompt_runs accounting contract",
    supabase
      .from("prompt_runs")
      .select("id,member_id,prompt_id,input_hash,status,provider_started_at,input_tokens,output_tokens,latency_ms,error_code,created_at,completed_at", {
        count: "exact",
        head: true,
      }),
  ),
);
await record("prompt_entitlements billing contract", () =>
  assertQuery(
    "prompt_entitlements billing contract",
    supabase
      .from("prompt_entitlements")
      .select("member_id,plan,stripe_customer_id,stripe_subscription_id,stripe_price_id,subscription_status,current_period_end,cancel_at_period_end,stripe_event_created,stripe_event_id", {
        count: "exact",
        head: true,
      }),
  ),
);
await record("prompt community aggregate contract", () =>
  assertQuery(
    "prompt community aggregate contract",
    supabase
      .from("prompt_community_leaderboard")
      .select("id,slug,title,description,category,usage_count,favorite_count,vote_count,momentum", {
        count: "exact",
        head: true,
      }),
  ),
);

await record("reserve_prompt_run RPC", () =>
  assertRpcExists(supabase, "reserve_prompt_run", {
    p_member_id: null,
    p_prompt_id: null,
    p_input_hash: "not-a-real-fingerprint",
  }),
);
await record("mark_prompt_run_started RPC", () =>
  assertRpcExists(supabase, "mark_prompt_run_started", {
    p_run_id: null,
    p_member_id: null,
  }),
);
await record("finish_prompt_run RPC", () =>
  assertRpcExists(supabase, "finish_prompt_run", {
    p_run_id: null,
    p_status: "failed",
    p_model: null,
    p_input_tokens: null,
    p_output_tokens: null,
    p_latency_ms: null,
    p_error_code: null,
  }),
);
await record("sync_prompt_entitlement RPC", () =>
  assertRpcExists(supabase, "sync_prompt_entitlement", {
    p_member_id: null,
    p_plan: "free",
    p_stripe_customer_id: null,
    p_stripe_subscription_id: null,
    p_stripe_price_id: null,
    p_subscription_status: null,
    p_current_period_end: null,
    p_cancel_at_period_end: false,
    p_stripe_event_created: null,
    p_stripe_event_id: null,
  }),
);
await record("get_prompt_atlas_operator_metrics RPC", async () => {
  const { data, error, status, statusText } = await supabase.rpc("get_prompt_atlas_operator_metrics");
  assert(!error, `get_prompt_atlas_operator_metrics failed: ${formatError(error, status, statusText)}`);
  assert(data && typeof data === "object", "operator metrics did not return aggregate JSON.");
});
await record("unlimited Pro reservation contract", () =>
  assertUnlimitedProReservation(supabase),
);

if (failures.length) {
  console.error("Prompt Atlas database readiness smoke checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Prompt Atlas database readiness smoke checks passed.");
}
