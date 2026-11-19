import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..");
const migrationFile = resolve(
  projectRoot,
  "supabase/migrations/202606180008_unlimited_pro_runs.sql",
);
const linkedProjectRef = resolve(projectRoot, "supabase/.temp/project-ref");

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

function print(text = "") {
  process.stdout.write(`${text}\n`);
}

function redact(text, secrets) {
  return secrets.reduce(
    (current, secret) => (secret ? current.split(secret).join("[redacted]") : current),
    text,
  );
}

const allowedArgs = new Set(["--apply", "--dry-run", "--skip-readiness"]);
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));
if (unknownArgs.length) {
  console.error(`Unknown migration helper argument(s): ${unknownArgs.join(", ")}`);
  console.error("Usage: npm run db:apply:unlimited-pro -- [--dry-run|--apply] [--skip-readiness]");
  process.exit(1);
}

if (!existsSync(migrationFile)) {
  console.error(`Missing migration file: ${migrationFile}`);
  process.exit(1);
}

const apply = args.includes("--apply");
const skipReadiness = args.includes("--skip-readiness");
const dbUrl = env("SUPABASE_DB_URL") || env("DATABASE_URL") || env("POSTGRES_URL");
const accessToken = env("SUPABASE_ACCESS_TOKEN");
const canUseLinkedProject = Boolean(accessToken && existsSync(linkedProjectRef));
const secrets = [dbUrl, accessToken].filter(Boolean);

print("Prompt Atlas unlimited Pro migration helper");
print(`Migration: ${migrationFile}`);
print(`Mode: ${apply ? "apply" : "dry run"}`);
print(`Direct database URL: ${dbUrl ? "present" : "missing"}`);
print(`Linked Supabase project: ${canUseLinkedProject ? "available" : "unavailable"}`);

if (!apply) {
  print("");
  print("No database changes were made.");
  print("Run `npm run db:apply:unlimited-pro -- --apply` when a migration-capable credential is available.");
  print("Accepted credentials: SUPABASE_DB_URL, DATABASE_URL, POSTGRES_URL, or SUPABASE_ACCESS_TOKEN with a linked Supabase project.");
  process.exit(0);
}

const queryArgs = ["supabase", "db", "query", "--file", migrationFile];
if (dbUrl) {
  queryArgs.push("--db-url", dbUrl);
} else if (canUseLinkedProject) {
  queryArgs.push("--linked");
} else {
  console.error("Missing migration-capable credentials.");
  console.error("Set SUPABASE_DB_URL, DATABASE_URL, POSTGRES_URL, or SUPABASE_ACCESS_TOKEN with a linked Supabase project.");
  console.error("The existing SUPABASE_SERVICE_ROLE_KEY can validate the app but cannot apply schema DDL.");
  process.exit(1);
}

const result = spawnSync("npx", queryArgs, {
  cwd: projectRoot,
  encoding: "utf8",
  env: {
    ...process.env,
    SUPABASE_ACCESS_TOKEN: accessToken || process.env.SUPABASE_ACCESS_TOKEN,
    SUPABASE_TELEMETRY_DISABLED: "1",
  },
});

const stdout = redact(result.stdout || "", secrets);
const stderr = redact(result.stderr || "", secrets);
if (stdout.trim()) process.stdout.write(stdout);
if (stderr.trim()) process.stderr.write(stderr);
if (result.error) throw result.error;
if (result.status !== 0) {
  console.error("Prompt Atlas unlimited Pro migration failed.");
  process.exit(result.status || 1);
}

print("Prompt Atlas unlimited Pro migration applied.");

if (!skipReadiness) {
  print("Running database readiness smoke...");
  const readiness = spawnSync("npm", ["run", "db:readiness:smoke"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
  });
  process.stdout.write(redact(readiness.stdout || "", secrets));
  process.stderr.write(redact(readiness.stderr || "", secrets));
  if (readiness.error) throw readiness.error;
  if (readiness.status !== 0) process.exit(readiness.status || 1);
}
