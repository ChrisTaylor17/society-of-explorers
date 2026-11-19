import { Platform } from 'react-native';
import NativeSoeMember, { type Spec } from '../../specs/NativeSoeMember';
import { prepareNativeMemberBinding } from './native-member-binding';
import { createNativeAuthPorts } from '../auth/native-auth-ports';
import { createNativeMemberPorts, type NativeMemberBridge } from './native-ports';
import type { NativeConnectivityPort, NativeConnectivityState } from './native-connectivity';
import type { CircleTransport } from './host';
import { isUuid } from '../../../../lib/ids/uuid';

const unavailable = () => Error('Native member service unavailable');
type InstalledMemberAdapter = { bridge: NativeMemberBridge; connectivity: NativeConnectivityPort };
export type PublicCircleDiscoveryConnection = { origin: string; publicTransport: CircleTransport; connectivity: NativeConnectivityPort; close(): void };
const adapters = new WeakMap<Spec, InstalledMemberAdapter>();

/** Explicit module injection also permits isolated contract tests. This does not
 * create an auth client or attest a compiled/installed native implementation. */
export function createInstalledMemberAdapter(module: Spec | null): InstalledMemberAdapter {
  if (!module || !(['capabilities', 'begin', 'send', 'cancel', 'read', 'write', 'remove',
    'resetAccountStorage', 'getConnectivitySnapshot', 'onConnectivityChange'] as const)
    .every(name => typeof module[name] === 'function')) throw unavailable();
  const existing = adapters.get(module);
  if (existing) return existing;
  const bridge: NativeMemberBridge = {
    capabilities: () => module.capabilities(),
    begin: generation => module.begin(generation),
    send: (id, request) => module.send(id, request),
    ...(typeof module.sendReview === 'function' ? { sendReview: (id: string, request: Parameters<NonNullable<NativeMemberBridge['sendReview']>>[1]) => module.sendReview(id, request) } : {}),
    ...(typeof module.sendCircleReview === 'function' ? { sendCircleReview: (id: string, request: Parameters<NonNullable<NativeMemberBridge['sendCircleReview']>>[1]) => module.sendCircleReview(id, request) } : {}),
    ...(typeof module.sendAuth === 'function' ? { sendAuth: (id: string, request: Parameters<NonNullable<NativeMemberBridge['sendAuth']>>[1]) => module.sendAuth(id, request) } : {}),
    ...(typeof module.prepareEmailLink === 'function' ? { prepareEmailLink: (...args: Parameters<NonNullable<NativeMemberBridge['prepareEmailLink']>>) => module.prepareEmailLink(...args) } : {}),
    ...(typeof module.pendingEmailLink === 'function' ? { pendingEmailLink: (...args: Parameters<NonNullable<NativeMemberBridge['pendingEmailLink']>>) => module.pendingEmailLink(...args) } : {}),
    ...(typeof module.claimEmailLink === 'function' ? { claimEmailLink: (...args: Parameters<NonNullable<NativeMemberBridge['claimEmailLink']>>) => module.claimEmailLink(...args) } : {}),
    ...(typeof module.discardEmailLink === 'function' ? { discardEmailLink: (...args: Parameters<NonNullable<NativeMemberBridge['discardEmailLink']>>) => module.discardEmailLink(...args) } : {}),
    ...(typeof module.sendEmailAuth === 'function' ? { sendEmailAuth: (id: string, request: Parameters<NonNullable<NativeMemberBridge['sendEmailAuth']>>[1]) => module.sendEmailAuth(id, request) } : {}),
    ...(typeof module.sendPublic === 'function' ? { sendPublic: (id: string, request: Parameters<NonNullable<NativeMemberBridge['sendPublic']>>[1]) => module.sendPublic(id, request) } : {}),
    cancel: id => module.cancel(id),
    read: (slot, generation) => module.read(slot, generation),
    write: (slot, value, generation) => module.write(slot, value, generation),
    remove: (slot, generation) => module.remove(slot, generation),
    resetAccountStorage: generation => module.resetAccountStorage(generation),
    ...(typeof module.newRequestId === 'function' ? { newRequestId: (generation: string) => module.newRequestId(generation) } : {}),
  };
  const snapshot = (): NativeConnectivityState => {
    try {
      const value = module.getConnectivitySnapshot();
      return value === 'online' || value === 'offline' ? value : 'unknown';
    } catch { return 'unknown'; }
  };
  const connectivity: NativeConnectivityPort = {
    snapshot,
    subscribe(listener) {
      let retired = false;
      let subscription: { remove(): void } | undefined;
      try {
        // Events may have queued before JS subscribed. Resample native state so
        // an old online payload cannot override a newer offline snapshot.
        subscription = module.onConnectivityChange(() => { if (!retired) listener(snapshot()); });
        if (typeof subscription?.remove !== 'function') throw unavailable();
      } catch {
        retired = true;
        try { subscription?.remove(); } catch { /* Already unavailable. */ }
        throw unavailable();
      }
      return () => {
        if (retired) return;
        retired = true;
        try { subscription?.remove(); } catch { /* Retired before native disposal. */ }
      };
    },
  };
  const adapter = { bridge, connectivity };
  adapters.set(module, adapter);
  return adapter;
}

/** Trusted account composition supplies public configuration and owns sign-in.
 * The registered unconfigured App does not call this helper automatically. */
export async function prepareInstalledMemberBinding(options: {
  origin: string; storageKey: string; timeoutMs?: number;
}) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw unavailable();
  const { bridge, connectivity } = createInstalledMemberAdapter(NativeSoeMember ?? null);
  const binding = await prepareNativeMemberBinding({ ...options, bridge });
  return { ...binding, connectivity };
}

async function installedCapabilities(bridge: NativeMemberBridge) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([bridge.capabilities(), new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(unavailable()), 15000);
  })]).finally(() => clearTimeout(timer));
}

/** Reuse the anonymous native request policy without creating an account client. */
export async function prepareInstalledPublicCircles(module: Spec | null = NativeSoeMember ?? null): Promise<PublicCircleDiscoveryConnection> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw unavailable();
  const { bridge, connectivity } = createInstalledMemberAdapter(module);
  const caps = await installedCapabilities(bridge);
  if (caps?.publicPolicy !== 'circle-discovery-v1' || typeof caps.origin !== 'string' || typeof caps.storageKey !== 'string'
    || typeof bridge.sendPublic !== 'function') throw unavailable();
  const ports = await createNativeMemberPorts({ ...bridge, capabilities: async () => caps }, { origin: caps.origin, storageKey: caps.storageKey });
  if (!ports.publicTransport) { ports.retireStorage(); throw unavailable(); }
  return { origin: caps.origin, publicTransport: ports.publicTransport, connectivity, close: ports.retireStorage };
}

/** Public policy comes only from the trusted installed native module. No launch
 * extras, environment, global credential or invented Circle is consulted. */
export async function prepareInstalledAuthPorts() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw unavailable();
  const { bridge, connectivity } = createInstalledMemberAdapter(NativeSoeMember ?? null);
  const caps = await installedCapabilities(bridge);
  if (!caps || typeof caps !== 'object' || Array.isArray(caps) || caps.version !== 2
    || caps.redirectPolicy !== 'reject-before-send' || caps.storagePolicy !== 'os-protected' || !isUuid(caps.storageGeneration)
    || caps.authPolicy !== 'supabase-password-v1' || typeof caps.origin !== 'string' || typeof caps.storageKey !== 'string'
    || typeof caps.providerOrigin !== 'string' || typeof caps.publishableKey !== 'string') throw unavailable();
  // Missing optional policies preserve older installed modules. An advertised
  // policy must be recognized; a similarly named or truthy value grants nothing.
  const policies = {
    requestIdPolicy: 'os-random-uuid', emailAuthPolicy: 'supabase-email-pkce-v1', publicPolicy: 'circle-discovery-v1', circleInvitePolicy: 'public-circle-invite-v1',
    readingPolicy: 'pinned-passage-v1', profilePolicy: 'owner-profile-v1', publicProfilePolicy: 'published-profile-v1',
    memberBlocksPolicy: 'owner-member-blocks-v1',
    savedReadingPolicy: 'owner-reading-v1', attendancePolicy: 'circle-rsvp-v1', hostingPolicy: 'circle-host-v1', circleAdmissionPolicy: 'member-bound-circle-admission-v1',
    messageAiConsentPolicy: 'author-message-ai-consent-v1', messageReviewPolicy: 'assigned-message-review-v1',
    circleReviewPolicy: 'assigned-circle-review-v1',
  } as const;
  for (const name of Object.keys(policies) as Array<keyof typeof policies>) {
    if (caps[name] !== undefined && caps[name] !== policies[name]) throw unavailable();
  }
  if (typeof bridge.sendAuth !== 'function'
    || caps.requestIdPolicy !== undefined && typeof bridge.newRequestId !== 'function'
    || [caps.publicPolicy, caps.readingPolicy, caps.publicProfilePolicy, caps.hostingPolicy].some(value => value !== undefined) && typeof bridge.sendPublic !== 'function'
    || caps.messageReviewPolicy !== undefined && typeof bridge.sendReview !== 'function'
    || caps.circleReviewPolicy !== undefined && typeof bridge.sendCircleReview !== 'function') throw unavailable();
  const ports = await createNativeAuthPorts(bridge, { origin: caps.origin, storageKey: caps.storageKey,
    providerOrigin: caps.providerOrigin, publishableKey: caps.publishableKey });
  return { ports, publishableKey: caps.publishableKey, connectivity };
}
