// Normalises an EOA personal_sign signature before SIWE verification.
//
// ethers v6 (used by siwe) refuses ECDSA signatures whose s value is in the upper half of the curve order
// ("non-canonical s"). Some wallets return such signatures. (r, n - s, v ^ 1) is the equivalent low-s signature
// for the same key and message, so recovering it yields the same address. This changes nothing for low-s
// signatures, and leaves anything that is not a 65-byte hex signature (e.g. smart-contract wallet signatures) as-is.
const SECP256K1_N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const HALF_N = SECP256K1_N >> BigInt(1);
const RAW_SIGNATURE = /^0x[0-9a-fA-F]{130}$/;

export type SignatureShape = 'eoa-low-s' | 'eoa-high-s' | 'other';

export function canonicalizeSignature(signature: string): { signature: string; shape: SignatureShape } {
  if (!RAW_SIGNATURE.test(signature)) return { signature, shape: 'other' };
  const hex = signature.slice(2);
  const r = hex.slice(0, 64);
  const s = BigInt('0x' + hex.slice(64, 128));
  const v = parseInt(hex.slice(128, 130), 16);
  if (s <= HALF_N) return { signature, shape: 'eoa-low-s' };
  let flippedV: number;
  if (v === 27 || v === 28) flippedV = v === 27 ? 28 : 27;
  else if (v === 0 || v === 1) flippedV = v ^ 1;
  else return { signature, shape: 'other' };
  const lowS = (SECP256K1_N - s).toString(16).padStart(64, '0');
  return { signature: `0x${r}${lowS}${flippedV.toString(16).padStart(2, '0')}`, shape: 'eoa-high-s' };
}

/** 0x12…ab, for logs. Never log a full wallet address. */
export function shortAddress(address: string | null | undefined): string {
  if (!address) return 'none';
  return address.length > 8 ? `${address.slice(0, 4)}…${address.slice(-2)}` : '…';
}
