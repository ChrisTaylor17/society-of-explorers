import { Platform } from 'react-native';
import { prepareInstalledOwnedAccount } from './installed-owned-account';
import type { OwnedAccountConnection } from '../../OwnedAccountScreen';

/** Compatibility entry for callers that explicitly require Android. */
export async function prepareAndroidOwnedAccount(): Promise<OwnedAccountConnection> {
  if (Platform.OS !== 'android') throw Error('Native account connection unavailable');
  return prepareInstalledOwnedAccount();
}
