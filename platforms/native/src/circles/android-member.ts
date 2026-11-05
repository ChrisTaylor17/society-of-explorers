import { Platform } from 'react-native';
import { createInstalledMemberAdapter, prepareInstalledAuthPorts, prepareInstalledMemberBinding } from './installed-member';

// Preserve the explicit test/composition seam and Android-only public wrappers.
export const createAndroidMemberAdapter = createInstalledMemberAdapter;

export async function prepareAndroidMemberBinding(options: {
  origin: string; storageKey: string; timeoutMs?: number;
}) {
  if (Platform.OS !== 'android') throw Error('Native member service unavailable');
  return prepareInstalledMemberBinding(options);
}

export async function prepareAndroidAuthPorts() {
  if (Platform.OS !== 'android') throw Error('Native member service unavailable');
  return prepareInstalledAuthPorts();
}
