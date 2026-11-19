type EventTargetLike = {
    addEventListener: (name: string, fn: () => void) => void;
    removeEventListener: (name: string, fn: () => void) => void;
};
type Visibility = EventTargetLike & {
    visibilityState: string;
};
/** Browser lifecycle adapter only. Native AppState and Quest visibility can call
 * the same portable controller directly; neither is simulated as verified here. */
export function bindCircleAccess({ window: win, document: doc, subscribeAuth, onInactive, onActive, onIdentity }: {
    window: EventTargetLike;
    document: Visibility;
    subscribeAuth: (listener: (event: string) => void) => () => void;
    onInactive: () => void;
    onActive: () => void;
    onIdentity: () => void;
}) {
    let disposed = false;
    const inactive = () => { if (!disposed)
        onInactive(); }, active = () => { if (!disposed)
        onActive(); }, identity = () => { if (!disposed)
        onIdentity(); };
    const visibility = () => doc.visibilityState === 'visible' ? active() : inactive();
    win.addEventListener('blur', inactive);
    win.addEventListener('focus', active);
    win.addEventListener('pagehide', inactive);
    win.addEventListener('storage', identity);
    const unsubscribeProvider = subscribeAuthProviderChanges(identity);
    doc.addEventListener('visibilitychange', visibility);
    const unsubscribe = subscribeAuth(event => { if (event !== 'INITIAL_SESSION')
        identity(); });
    if (doc.visibilityState !== 'visible')
        inactive();
    return () => { disposed = true; unsubscribeProvider(); unsubscribe(); win.removeEventListener('blur', inactive); win.removeEventListener('focus', active); win.removeEventListener('pagehide', inactive); win.removeEventListener('storage', identity); doc.removeEventListener('visibilitychange', visibility); };
}
import { subscribeAuthProviderChanges } from '@/lib/auth/providerSelection';

