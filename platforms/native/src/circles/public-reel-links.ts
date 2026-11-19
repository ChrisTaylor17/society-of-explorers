import { reelHref } from '../../../../lib/clips/contracts';
import { reelDiscussionId, type ReelDiscussionId } from '../../../../lib/clips/salon';
import { approvedOrigin } from './host';
import { CIRCLE_INVITE_PREFIX, isCircleInviteId } from '../../../../lib/circles/invite';

export type PublicAppLink = { kind: 'reel'; reel: ReelDiscussionId } | { kind: 'circle'; circleId: string };

export type PublicAppLinkPort = {
  getInitialURL(): Promise<string | null>;
  addEventListener(name: 'url', listener: (event: { url: string }) => void): { remove(): void };
};

/** The installed public origin is used for local routing only. It cannot
 * configure an account or a request. A late launch URL cannot replace a tap. */
export function observePublicAppLinks(
  linking: PublicAppLinkPort | undefined,
  installedOrigin: string | undefined,
  receive: (link: PublicAppLink, initial: boolean) => void,
) {
  let origin: string;
  try { origin = approvedOrigin(installedOrigin ?? ''); } catch { return () => {}; }
  let closed = false, receivedWarm = false;
  function select(url: unknown, initial: boolean) {
    if (closed || initial && receivedWarm || typeof url !== 'string' || url.length > 420) return;
    const invite = origin + CIRCLE_INVITE_PREFIX;
    const circleId = url.startsWith(invite) ? url.slice(invite.length) : null;
    const reel = reelDiscussionId(url.split('/').at(-1));
    const link: PublicAppLink | null = isCircleInviteId(circleId) ? { kind: 'circle', circleId }
      : reel && url === origin + reelHref(reel) ? { kind: 'reel', reel } : null;
    if (!link) return;
    if (!initial) receivedWarm = true;
    receive(link, initial);
  }
  const subscription = linking?.addEventListener?.('url', event => select(event?.url, false));
  void linking?.getInitialURL?.().then(url => select(url, true)).catch(() => {});
  return () => { closed = true; subscription?.remove(); };
}
