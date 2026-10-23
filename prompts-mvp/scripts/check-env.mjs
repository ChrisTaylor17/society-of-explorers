import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SOE_ADMIN_EMAILS",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET_PROMPTS",
  "STRIPE_PROMPTS_PRO_PRICE_ID",
  "NEXT_PUBLIC_SITE_URL",
];

const walletConfigured = Boolean(env("WALLET_SESSION_SECRET") || env("NEXTAUTH_SECRET"));
const claudeConfigured = Boolean(
  env("ANTHROPIC_API_KEY") ||
    env("AI_GATEWAY_API_KEY") ||
    env("VERCEL_OIDC_TOKEN"),
);
const missing = required.filter((name) => !env(name));
if (!walletConfigured) missing.push("WALLET_SESSION_SECRET or NEXTAUTH_SECRET");
if (!claudeConfigured) missing.push("ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY");

if (missing.length) {
  console.error(`Missing production environment variables:\n- ${missing.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Prompt Atlas environment is ready.");
}
