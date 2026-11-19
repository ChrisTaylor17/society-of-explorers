const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const SESSION_VERSION = "v1";

function walletSecret(): string {
  return process.env.WALLET_SESSION_SECRET || process.env.NEXTAUTH_SECRET || "";
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(payload: string): Promise<string | null> {
  const secret = walletSecret();
  if (!secret) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toHex(new Uint8Array(signature));
}

function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function createWalletSession(memberId: string): Promise<string | null> {
  if (!UUID_PATTERN.test(memberId)) return null;
  const signature = await sign(`${SESSION_VERSION}:${memberId}`);
  return signature ? `${SESSION_VERSION}.${memberId}.${signature}` : null;
}

export async function verifyWalletSession(value?: string | null): Promise<string | null> {
  if (!value) return null;
  const [version, memberId, signature] = value.split(".");
  if (
    version !== SESSION_VERSION ||
    !UUID_PATTERN.test(memberId) ||
    !SIGNATURE_PATTERN.test(signature)
  ) {
    return null;
  }

  const expected = await sign(`${version}:${memberId}`);
  return expected && secureEqual(signature, expected) ? memberId : null;
}

