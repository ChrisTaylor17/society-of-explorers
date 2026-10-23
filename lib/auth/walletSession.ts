const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const SESSION_VERSION = 'v1';

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

function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function createWalletSessionValue(memberId: string): Promise<string | null> {
  if (!UUID_PATTERN.test(memberId)) return null;

  const payload = `${SESSION_VERSION}:${memberId}`;
  const signature = await signPayload(payload);
  if (!signature) return null;

  return `${SESSION_VERSION}.${memberId}.${signature}`;
}

export async function verifyWalletSessionValue(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;

  const [version, memberId, signature] = value.split('.');
  if (version !== SESSION_VERSION || !UUID_PATTERN.test(memberId) || !SIGNATURE_PATTERN.test(signature)) {
    return null;
  }

  const expectedSignature = await signPayload(`${version}:${memberId}`);
  if (!expectedSignature || !secureEqual(signature, expectedSignature)) return null;

  return memberId;
}
