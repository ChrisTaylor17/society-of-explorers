const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const SESSION_VERSION = 'v2';
const LEGACY_SESSION_VERSION = 'v1';
const EXPIRY_PATTERN = /^[1-9][0-9]{0,11}$/;

// v2 cookies carry a signed expiry that the server checks (the browser maxAge alone is not enforced).
export const WALLET_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 5 * 60;

// v1 cookies (no expiry, issued before this release) are accepted until this instant so nobody is logged out
// at deploy time. Browser maxAge for those cookies is 30 days, so this must be >= deploy date + 30 days.
// Recompute it if the release ships after 2026-12-01.
export const LEGACY_V1_ACCEPT_UNTIL = '2026-12-31T00:00:00Z';

function getWalletSessionSecret(): string {
  return process.env.WALLET_SESSION_SECRET || process.env.NEXTAUTH_SECRET || '';
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signPayload(payload: string): Promise<string | null> {
  const secret = getWalletSessionSecret();
  if (!secret) return null;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return hex(new Uint8Array(signature));
}

/**
 * HMAC-SHA256 (hex) with the wallet-session secret, for other short-lived signed values (e.g. the SIWE nonce).
 * Callers must domain-separate their payloads; wallet-session payloads always start with "v1:" or "v2:".
 */
export async function signWithWalletSessionSecret(payload: string): Promise<string | null> {
  if (/^v[0-9]+:/.test(payload)) return null;
  return signPayload(payload);
}

export function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function createWalletSessionValue(memberId: string, nowMs: number = Date.now()): Promise<string | null> {
  if (!UUID_PATTERN.test(memberId)) return null;

  const expiresAt = Math.floor(nowMs / 1000) + WALLET_SESSION_TTL_SECONDS;
  const payload = `${SESSION_VERSION}:${memberId}:${expiresAt}`;
  const signature = await signPayload(payload);
  if (!signature) return null;

  return `${SESSION_VERSION}.${memberId}.${expiresAt}.${signature}`;
}

/** Test helper only: mints a pre-release v1 cookie (no expiry) to check the legacy cutoff. */
export async function createLegacyV1WalletSessionValueForTests(memberId: string): Promise<string | null> {
  if (!UUID_PATTERN.test(memberId)) return null;
  const signature = await signPayload(`${LEGACY_SESSION_VERSION}:${memberId}`);
  return signature ? `${LEGACY_SESSION_VERSION}.${memberId}.${signature}` : null;
}

export async function verifyWalletSessionValue(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<string | null> {
  if (!value || value.length > 256) return null;

  const parts = value.split('.');
  const nowSeconds = Math.floor(nowMs / 1000);

  if (parts.length === 4) {
    const [version, memberId, expiresAtText, signature] = parts;
    if (
      version !== SESSION_VERSION ||
      !UUID_PATTERN.test(memberId) ||
      !EXPIRY_PATTERN.test(expiresAtText) ||
      !SIGNATURE_PATTERN.test(signature)
    ) {
      return null;
    }
    const expiresAt = Number(expiresAtText);
    if (expiresAt <= nowSeconds) return null;
    if (expiresAt > nowSeconds + WALLET_SESSION_TTL_SECONDS + CLOCK_SKEW_SECONDS) return null;

    const expectedSignature = await signPayload(`${version}:${memberId}:${expiresAtText}`);
    if (!expectedSignature || !secureEqual(signature, expectedSignature)) return null;
    return memberId;
  }

  if (parts.length === 3) {
    const [version, memberId, signature] = parts;
    if (version !== LEGACY_SESSION_VERSION || !UUID_PATTERN.test(memberId) || !SIGNATURE_PATTERN.test(signature)) {
      return null;
    }
    if (nowMs >= Date.parse(LEGACY_V1_ACCEPT_UNTIL)) return null;

    const expectedSignature = await signPayload(`${version}:${memberId}`);
    if (!expectedSignature || !secureEqual(signature, expectedSignature)) return null;
    return memberId;
  }

  return null;
}
