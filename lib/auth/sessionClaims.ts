import { isUuid } from '../ids/uuid';

// Inspect claims without Buffer or browser-only globals.
// The provider verifies the exact token separately.
export function readJwtClaims(access: string): Record<string, unknown> | null {
  if (access.length > 16384) return null;
  const parts = access.split('.');
  if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let bits = 0;
  let accumulator = 0;
  let encoded = '';
  try {
    for (const character of parts[1]) {
      accumulator = ((accumulator << 6) | alphabet.indexOf(character)) & 0xffffff;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        encoded += '%' + ((accumulator >> bits) & 255).toString(16).padStart(2, '0');
      }
    }
    const value: unknown = JSON.parse(decodeURIComponent(encoded));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function hasLocalSessionClaim(access: string, subject?: string): boolean {
  const claims = readJwtClaims(access);
  if (!claims || !isUuid(claims.session_id) || !isUuid(claims.sub)) return false;
  // A differently cased claim can bind to the same field in GoTrue.
  if (Object.keys(claims).some(key => /[^\x20-\x7e]/.test(key) ||
    key !== 'session_id' && key.toLowerCase() === 'session_id' ||
    key !== 'sub' && key.toLowerCase() === 'sub')) return false;
  return subject === undefined || claims.sub.toLowerCase() === subject.toLowerCase();
}
