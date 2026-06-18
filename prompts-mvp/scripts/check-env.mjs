const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WALLET_SESSION_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET_PROMPTS",
  "STRIPE_PROMPTS_PRO_PRICE_ID",
  "NEXT_PUBLIC_SITE_URL",
];

const claudeConfigured = Boolean(
  process.env.ANTHROPIC_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_OIDC_TOKEN,
);
const missing = required.filter((name) => !process.env[name]);
if (!claudeConfigured) missing.push("ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY");

if (missing.length) {
  console.error(`Missing production environment variables:\n- ${missing.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Prompt Atlas environment is ready.");
}

