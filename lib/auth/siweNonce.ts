import 'server-only';

// Security fix S3: the SIWE nonce cookie is HMAC-signed and time-limited.
//
// Before, the nonce route set a plain soe_siwe_nonce cookie and the SIWE route trusted whatever value it found,
// so anyone holding a captured (message, signature) pair could set that cookie to the nonce inside the message and
// replay the login forever. The cookie is now `v2.<nonce>.<expSeconds>.<intent>.<hmac>`, signed with the wallet-session secret
// (WALLET_SESSION_SECRET || NEXTAUTH_SECRET, Web Crypto, no new secret), domain-separated with "siwe-nonce|".
//
// The browser intent is part of the signed payload, so an older nonce cannot be
// borrowed by a later password, Google or wallet sign-in attempt.
// Limitation: stateless. Within its lifetime a nonce cookie can in principle be reused by the client that holds it
// (the SIWE route clears it after use). True single-use needs a server-side store.
import { secureEqual, signWithWalletSessionSecret } from '@/lib/auth/walletSession';
import { parseBrowserIntent } from '@/lib/auth/browserIntent';

export const SIWE_NONCE_COOKIE = 'soe_siwe_nonce';
export const SIWE_NONCE_MAX_AGE_S = 60 * 10;

const NONCE_PATTERN = /^[A-Za-z0-9]{8,64}$/;
const EXP_PATTERN = /^[1-9][0-9]{0,11}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

function mac(payload: string): Promise<string | null> {
  return signWithWalletSessionSecret(`siwe-nonce|${payload}`);
}

export async function signNonce(nonce: string, intent: string, nowMs: number = Date.now()): Promise<string | null> {
  if (!NONCE_PATTERN.test(nonce) || !parseBrowserIntent(intent)) return null;
  const exp = Math.floor(nowMs / 1000) + SIWE_NONCE_MAX_AGE_S;
  const payload = `v2.${nonce}.${exp}.${intent}`;
  const signature = await mac(payload);
  return signature ? `${payload}.${signature}` : null;
}

/** Returns the nonce if the cookie value is authentic and unexpired, else null. */
export async function verifyNonceCookie(value: string | undefined | null, intent: string, nowMs: number = Date.now()): Promise<string | null> {
  if (!value || value.length > 240 || !parseBrowserIntent(intent)) return null;
  const parts = value.split('.');
  if (parts.length !== 5) return null;
  const [version, nonce, expText, boundIntent, signature] = parts;
  if (version !== 'v2' || boundIntent !== intent || !NONCE_PATTERN.test(nonce) || !EXP_PATTERN.test(expText) || !SIGNATURE_PATTERN.test(signature)) return null;
  const exp = Number(expText);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (exp <= nowSeconds || exp > nowSeconds + SIWE_NONCE_MAX_AGE_S + 60) return null;
  const expected = await mac(`${version}.${nonce}.${expText}.${boundIntent}`);
  if (!expected || !secureEqual(signature, expected)) return null;
  return nonce;
}
