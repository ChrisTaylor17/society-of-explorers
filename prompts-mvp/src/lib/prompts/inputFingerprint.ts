import "server-only";

const encoder = new TextEncoder();
const FINGERPRINT_VERSION = "prompt-atlas:v1";

function fingerprintSecret(): string {
  return (
    process.env.PROMPT_INPUT_HASH_SECRET ||
    process.env.WALLET_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  );
}

export function hasInputFingerprintConfig(): boolean {
  return Boolean(fingerprintSecret());
}

export async function inputFingerprint(value: string): Promise<string> {
  const secret = fingerprintSecret();
  if (!secret) throw new Error("Prompt fingerprint configuration is missing.");

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${FINGERPRINT_VERSION}\n${value}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
