import { reelHref } from '../../../../lib/clips/contracts';
import { reelDiscussionId, type ReelDiscussionId } from '../../../../lib/clips/salon';
import { approvedOrigin } from './host';

export type PublicReelLinkPort = {
  getInitialURL(): Promise<string | null>;
  addEventListener(name: 'url', listener: (event: { url: string }) => void): { remove(): void };
};

/** The installed public origin is used for local routing only. It cannot
 * configure an account or a request. A late launch URL cannot replace a tap. */
export function observePublicReelLinks(
  linking: PublicReelLinkPort | undefined,
  installedOrigin: string | undefined,
  receive: (reel: ReelDiscussionId, initial: boolean) => void,
) {
  let origin: string;
  try { origin = approvedOrigin(installedOrigin ?? ''); } catch { return () => {}; }
  let closed = false, receivedWarm = false;
  function select(url: unknown, initial: boolean) {
    if (closed || initial && receivedWarm || typeof url !== 'string' || url.length > 420) return;
    const reel = reelDiscussionId(url.split('/').at(-1));
    if (!reel || url !== origin + reelHref(reel)) return;
    if (!initial) receivedWarm = true;
    receive(reel, initial);
  }
  const subscription = linking?.addEventListener?.('url', event => select(event?.url, false));
  void linking?.getInitialURL?.().then(url => select(url, true)).catch(() => {});
  return () => { closed = true; subscription?.remove(); };
}
