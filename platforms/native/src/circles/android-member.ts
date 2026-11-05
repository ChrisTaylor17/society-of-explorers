import { Platform } from 'react-native';
import NativeSoeMember, { type Spec } from '../../specs/NativeSoeMember';
import { prepareNativeMemberBinding } from './native-member-binding';
import { createNativeAuthPorts } from '../auth/native-auth-ports';
import type { NativeMemberBridge } from './native-ports';
import type { NativeConnectivityPort, NativeConnectivityState } from './native-connectivity';

const unavailable = () => Error('Native member service unavailable');
type AndroidMemberAdapter = { bridge: NativeMemberBridge; connectivity: NativeConnectivityPort };
const adapters = new WeakMap<Spec, AndroidMemberAdapter>();

/** Explicit module injection also permits isolated contract tests. This does not
 * create an auth client or attest a compiled/installed Android implementation. */
export function createAndroidMemberAdapter(module: Spec | null): AndroidMemberAdapter {
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
export async function prepareAndroidMemberBinding(options: {
  origin: string; storageKey: string; timeoutMs?: number;
}) {
  if (Platform.OS !== 'android') throw unavailable();
  const { bridge, connectivity } = createAndroidMemberAdapter(NativeSoeMember);
  const binding = await prepareNativeMemberBinding({ ...options, bridge });
  return { ...binding, connectivity };
}

/** Public policy comes only from the trusted installed native module. No launch
 * extras, environment, global credential or invented Circle is consulted. */
export async function prepareAndroidAuthPorts() {
  if (Platform.OS !== 'android') throw unavailable();
  const { bridge, connectivity } = createAndroidMemberAdapter(NativeSoeMember);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const caps = await Promise.race([bridge.capabilities(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(unavailable()), 15000); })]).finally(() => clearTimeout(timer));
  if (caps.authPolicy !== 'supabase-password-v1' || typeof caps.providerOrigin !== 'string' || typeof caps.publishableKey !== 'string') throw unavailable();
  const ports = await createNativeAuthPorts(bridge, { origin: caps.origin, storageKey: caps.storageKey,
    providerOrigin: caps.providerOrigin, publishableKey: caps.publishableKey });
  return { ports, publishableKey: caps.publishableKey, connectivity };
}
