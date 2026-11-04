import { isUuid } from '../../lib/ids/uuid';
import { approvedOrigin, type CircleTransport } from '../native/src/circles/host';
import type { ExistingMemberCircleConfig, ExistingVerifiedAuth } from '../native/src/circles/verified-member-session';

/** Trusted application composition, never configuration discovered from a URL,
 * global credential, fixture, or mutable React Native launch payload. */
export function memberCircleConfig(input: unknown): ExistingMemberCircleConfig | null {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const v = input as { circleId?: unknown; origin?: unknown; auth?: ExistingVerifiedAuth; transport?: CircleTransport; verificationTimeoutMs?: unknown; newRequestId?: unknown };
    if (!isUuid(v.circleId) || typeof v.origin !== 'string' || typeof v.transport !== 'function'
      || typeof v.auth?.getSession !== 'function' || typeof v.auth.getUser !== 'function' || typeof v.auth.onAuthStateChange !== 'function'
      || v.verificationTimeoutMs !== undefined && (!Number.isSafeInteger(v.verificationTimeoutMs) || Number(v.verificationTimeoutMs) < 1 || Number(v.verificationTimeoutMs) > 60000)
      || v.newRequestId !== undefined && typeof v.newRequestId !== 'function') return null;
    return { circleId: v.circleId.toLowerCase(), origin: approvedOrigin(v.origin), auth: v.auth, transport: v.transport,
      ...(v.verificationTimeoutMs === undefined ? {} : { verificationTimeoutMs: Number(v.verificationTimeoutMs) }),
      ...(typeof v.newRequestId === 'function' ? { newRequestId: v.newRequestId as () => Promise<string> } : {}) };
  } catch { return null; }
}
