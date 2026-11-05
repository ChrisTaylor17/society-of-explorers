import { prepareInstalledAuthPorts } from '../circles/installed-member';
import { createOwnedNativeAuth } from './owned-auth';
import { createNativeEmailAuth } from './email-auth';
import type { OwnedAccountConnection } from '../../OwnedAccountScreen';

/** The registered app accepts configuration only from its installed native
 * capability receipt. The same controllers serve iOS and Android; neither has
 * a JavaScript network/storage fallback or automatically resumes an account. */
export async function prepareInstalledOwnedAccount(): Promise<OwnedAccountConnection> {
  const { ports, publishableKey, connectivity } = await prepareInstalledAuthPorts();
  let controller: ReturnType<typeof createOwnedNativeAuth> | undefined;
  let email: ReturnType<typeof createNativeEmailAuth> | undefined;
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    // Partial setup and a failed independent cleanup must retire every owner.
    try { email?.close(); } catch { /* Continue retiring the other owners. */ }
    try { controller?.close(); } catch { /* Native ports still retire below. */ }
    try { ports.retire(); } catch { /* All local cleanup attempts completed. */ }
  }
  try {
    controller = createOwnedNativeAuth({ ports, publishableKey, initialOnline: false });
    email = ports.email ? createNativeEmailAuth({ ports: ports.email, publishableKey, initialOnline: false }) : undefined;
    controller.activity(false);
    email?.activity(false);
    return {
      controller, connectivity, ...(email ? { email } : {}),
      config: { ...ports.member, auth: controller.auth }, close,
    };
  } catch {
    close();
    throw Error('Native account connection unavailable');
  }
}
