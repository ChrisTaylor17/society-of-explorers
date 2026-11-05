import { prepareAndroidAuthPorts } from '../circles/android-member';
import { createOwnedNativeAuth } from './owned-auth';
import { createNativeEmailAuth } from './email-auth';
import type { OwnedAccountConnection } from '../../OwnedAccountScreen';

/** Public configuration comes only from the installed native module. No account
 * secret is read from build variables, links, launch options or JS globals. */
export async function prepareAndroidOwnedAccount(): Promise<OwnedAccountConnection> {
  const { ports, publishableKey, connectivity } = await prepareAndroidAuthPorts();
  try {
    const controller = createOwnedNativeAuth({ ports, publishableKey, initialOnline: false });
    const email = ports.email ? createNativeEmailAuth({ ports: ports.email, publishableKey, initialOnline: false }) : undefined;
    controller.activity(false);
    email?.activity(false);
    return {
      controller, connectivity, ...(email ? { email } : {}),
      config: { ...ports.member, auth: controller.auth },
      close() { email?.close(); controller.close(); ports.retire(); },
    };
  } catch {
    ports.retire();
    throw Error('Native account connection unavailable');
  }
}
