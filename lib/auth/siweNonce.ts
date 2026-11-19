import 'server-only';

import { secureEqual, signWithWalletSessionSecret } from '@/lib/auth/walletSession';
import { parseBrowserIntent } from '@/lib/auth/browserIntent';

export const SIWE_NONCE_COOKIE = 'soe_siwe_nonce';
export const SIWE_NONCE_MAX_AGE_S = 60 * 10;

// v3 challenges are issued only by builds that enforce one-time redemption.
const CHALLENGE_VERSION = 'v3';
const NONCE_PATTERN = /^[A-Za-z0-9]{8,64}$/;
const EXP_PATTERN = /^[1-9][0-9]{0,11}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

function mac(payload: string): Promise<string | null> {
  return signWithWalletSessionSecret(`siwe-nonce|${payload}`);
}

export async function signNonce(nonce: string, intent: string, nowMs: number = Date.now()): Promise<string | null> {
  if (!NONCE_PATTERN.test(nonce) || !parseBrowserIntent(intent)) return null;
  const exp = Math.floor(nowMs / 1000) + SIWE_NONCE_MAX_AGE_S;
  const payload = `${CHALLENGE_VERSION}.${nonce}.${exp}.${intent}`;
  const signature = await mac(payload);
  return signature ? `${payload}.${signature}` : null;
}

/** Returns the authenticated challenge for this browser intent. */
export async function verifyNonceCookie(
  value: string | undefined | null,
  intent: string,
  nowMs: number = Date.now(),
): Promise<{ nonce: string; expiresAt: number } | null> {
  if (!value || value.length > 240 || !parseBrowserIntent(intent)) return null;
  const parts = value.split('.');
  if (parts.length !== 5) return null;
  const [version, nonce, expText, boundIntent, signature] = parts;
  if (version !== CHALLENGE_VERSION || boundIntent !== intent || !NONCE_PATTERN.test(nonce) || !EXP_PATTERN.test(expText) || !SIGNATURE_PATTERN.test(signature)) return null;
  const exp = Number(expText);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (exp <= nowSeconds || exp > nowSeconds + SIWE_NONCE_MAX_AGE_S + 60) return null;
  const expected = await mac(`${version}.${nonce}.${expText}.${boundIntent}`);
  if (!expected || !secureEqual(signature, expected)) return null;
  return { nonce, expiresAt: exp };
}
