import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CircleScreen } from './CircleScreen';
import { ContributionsScreen } from './ContributionsScreen';
import { MessageReviewsScreen } from './MessageReviewsScreen';
import { CircleDirectoryScreen } from './CircleDirectoryScreen';
import { MemberProfileScreen } from './MemberProfileScreen';
import { createMemberProfile, type MemberProfile } from '../shared/member-profile';
import { createSavedReading, type SavedReading } from '../shared/saved-reading';
import { SavedReadingScreen } from './SavedReadingScreen';
import { CircleHostingScreen } from './CircleHostingScreen';
import { createCircleHosting, type CircleHosting } from '../shared/circle-hosting';
import { createVerifiedSupabaseCircleOwner, type ExistingMemberAccountConfig } from './src/circles/verified-member-session';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';
import { createMemberAccountSession } from '../shared/account-session';

/** Retained by the owned sign-in screen across temporary member-view unmounts.
 * It contains no active authority after disconnect/stop; recovery requires new
 * provider and canonical member checks before a profile can be loaded again. */
export function createMemberViewConnection(config: ExistingMemberAccountConfig, connectivity?: NativeConnectivityPort) {
  const { auth, verificationTimeoutMs, ...host } = config;
  const binding = createVerifiedSupabaseCircleOwner(auth, { timeoutMs: verificationTimeoutMs });
  const account = createMemberAccountSession({ owner: binding.owner, origin: host.origin, transport: host.transport,
    timeoutMs: host.timeoutMs, initialOnline: false });
  let profile: { memberId: string; session: MemberProfile } | null = null, closed = false;
  let savedReading: { memberId: string; session: SavedReading } | null = null;
  let hosting: { memberId: string; session: CircleHosting } | null = null;
  const closeProfile = () => { profile?.session.close(); profile = null; };
  const closeSavedReading = () => { savedReading?.session.close(); savedReading = null; };
  const closeHosting = () => { hosting?.session.close(); hosting = null; };
  return { config, binding, account, host: { ...host, owner: binding.owner }, connectivity,
    profile: () => profile,
    savedReading: () => savedReading,
    hosting: () => hosting,
    discardOtherMemberViews(memberId: string) {
      if (profile && profile.memberId !== memberId) closeProfile();
      if (savedReading && savedReading.memberId !== memberId) closeSavedReading();
      if (hosting && hosting.memberId !== memberId) closeHosting();
    },
    openHosting(memberId: string) {
      if (closed || !host.hostingTransport || !host.newRequestId) throw Error('Circle hosting unavailable');
      if (hosting?.memberId !== memberId) {
        closeHosting();
        hosting = { memberId, session: createCircleHosting({ origin: host.origin, memberId, owner: binding.owner,
          transport: host.transport, hostingTransport: host.hostingTransport, editionTransport: host.editionTransport,
          newRequestId: host.newRequestId, timeoutMs: host.timeoutMs, initialOnline: false }) };
      }
    },
    openSavedReading(memberId: string) {
      if (closed || !host.savedReadingTransport) throw Error('Saved reading unavailable');
      if (savedReading?.memberId !== memberId) {
        closeSavedReading();
        savedReading = { memberId, session: createSavedReading({ origin: host.origin, memberId, owner: binding.owner,
          savedReadingTransport: host.savedReadingTransport, timeoutMs: host.timeoutMs, initialOnline: false }) };
      }
    },
    openProfile(memberId: string) {
      if (closed || !host.profileTransport) throw Error('Profile connection unavailable');
      if (profile?.memberId !== memberId) {
        closeProfile();
        profile = { memberId, session: createMemberProfile({ origin: host.origin, memberId, owner: binding.owner,
          profileTransport: host.profileTransport, publicProfileTransport: host.publicProfileTransport, timeoutMs: host.timeoutMs, initialOnline: false }) };
      }
    },
    disconnect(discardProfile = false) { if (discardProfile) { closeProfile(); closeSavedReading(); closeHosting(); }
      else { profile?.session.disconnect(); savedReading?.session.disconnect(); hosting?.session.disconnect(); } account.disconnect(); binding.stop(); },
    close() { if (closed) return; closed = true; closeProfile(); closeSavedReading(); closeHosting(); account.close(); binding.stop(); } };
}
export type MemberViewConnection = ReturnType<typeof createMemberViewConnection>;

/** Uses the app's existing verified account. Member setup is deliberate; this
 * screen does not create an auth client, sign in or choose an account. */
export function MemberCircleScreen({ config, connectivity, retained, onClose }: {
  config: ExistingMemberAccountConfig; connectivity?: NativeConnectivityPort; retained?: MemberViewConnection; onClose(): void;
}) {
  const connection = useMemo(() => {
    try {
      if (retained) return retained.config === config && retained.connectivity === connectivity ? retained : null;
      return createMemberViewConnection(config, connectivity);
    } catch { return null; }
  }, [config, connectivity, retained]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: connection?.binding.model() }));
  const [accountSnapshot, setAccountSnapshot] = useState(() => ({ connection, model: connection?.account.model() }));
  const [entered, setEntered] = useState<{ connection: typeof connection; destination: 'circle' | 'contributions' | 'reviews' | 'discover' | 'mine' | 'profile' | 'saved' | 'hosting' } | null>(null);
  const [profileNotice, setProfileNotice] = useState('');
  const [viewEpoch, setViewEpoch] = useState(0);
  const viewLife = useRef({ mounted: false, enabled: false, epoch: 0 });
  const model = snapshot.connection === connection ? snapshot.model : connection?.binding.model();
  const account = accountSnapshot.connection === connection ? accountSnapshot.model : connection?.account.model();
  const memberId = account?.member?.id;
  const directoryConfig = useMemo(() => connection && memberId ? { ...connection.host, memberId } : null, [connection, memberId]);
  const reviewerConfig = useMemo(() => connection?.host.reviewerTransport && connection.host.newRequestId
    ? { ...connection.host, reviewerTransport: connection.host.reviewerTransport, newRequestId: connection.host.newRequestId } : null, [connection]);
  useLayoutEffect(() => {
    const life = viewLife.current;
    life.mounted = true; life.enabled = false; setViewEpoch(++life.epoch);
    if (!connection) return () => { life.mounted = false; life.enabled = false; ++life.epoch; };
    const binding = connection.binding;
    const off = binding.subscribe(model => { setViewEpoch(++life.epoch); setSnapshot({ connection, model }); if (model.phase !== 'ready') setEntered(null); });
    const offAccount = connection.account.subscribe(model => {
      setViewEpoch(++life.epoch);
      if (model.member) connection.discardOtherMemberViews(model.member.id);
      setAccountSnapshot({ connection, model }); if (!model.canOpenCircle) setEntered(null);
    });
    let appActive = false, blurred = false, online = false, mounted = true;
    const sync = () => {
      if (!mounted) return;
      const enabled = appActive && !blurred && online;
      if (life.enabled !== enabled) { life.enabled = enabled; setViewEpoch(++life.epoch); }
      connection.account.activity(enabled); connection.account.connectivity(online); binding.activity(enabled);
      if (!enabled) setEntered(null);
    };
    sync();
    // Install lifecycle fences before any connectivity callback or auth method
    // can synchronously cause a background/blur transition.
    const change = AppState.addEventListener('change', value => { appActive = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; appActive = AppState.currentState === 'active'; sync(); }) : null;
    appActive = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connection.connectivity, state => { if (mounted) { online = state === 'online'; sync(); } });
    appActive = AppState.currentState === 'active'; sync();
    connection.account.connect();
    void binding.start();
    return () => {
      mounted = false; life.mounted = false; life.enabled = false; ++life.epoch;
      offAccount(); off();
      connection.disconnect(retained !== connection);
      offConnectivity(); change.remove(); blur?.remove(); focus?.remove();
    };
  }, [connection, retained]);
  // Retiring a child also retires callbacks retained by that child, even when
  // the account connection remains available for a later explicit re-entry.
  useLayoutEffect(() => { setViewEpoch(++viewLife.current.epoch); }, [connection, entered]);
  const act = (work: () => void, allowInactive = false) => {
    const life = viewLife.current;
    if (life.mounted && life.epoch === viewEpoch && (allowInactive || life.enabled)) work();
  };
  const close = () => act(() => { connection?.close(); setEntered(null); onClose(); }, true);
  const back = () => act(() => setEntered(null), true);
  const openProfile = () => act(() => {
    const current = connection?.account.model();
    if (!connection || !current?.canOpenCircle || !current.member || connection.binding.model().phase !== 'ready' || !connection.host.profileTransport) return;
    try {
      connection.openProfile(current.member.id);
      setProfileNotice(''); setEntered({ connection, destination: 'profile' });
    } catch { setProfileNotice('Profile editing is unavailable. Check your member account and try again.'); }
  });
  const openReadingDestination = (destination: 'saved' | 'discover' | 'mine') => act(() => {
    const current = connection?.account.model();
    if (!connection || !current?.canOpenCircle || !current.member || connection.binding.model().phase !== 'ready') return;
    try {
      if (connection.host.savedReadingTransport) connection.openSavedReading(current.member.id);
      else if (destination === 'saved') return;
      setProfileNotice(''); setEntered({ connection, destination });
    } catch { setProfileNotice('Saved reading is unavailable. Check the member account and try again.'); }
  });
  const openHosting = () => act(() => {
    const current = connection?.account.model();
    if (!connection || !current?.canOpenCircle || !current.member || connection.binding.model().phase !== 'ready') return;
    try { connection.openHosting(current.member.id); setProfileNotice(''); setEntered({ connection, destination: 'hosting' }); }
    catch { setProfileNotice('Circle hosting is unavailable. Check your member account and try again.'); }
  });
  const profileConnection = connection?.profile();
  const savedReadingConnection = connection?.savedReading();
  const hostingConnection = connection?.hosting();
  if (connection && entered?.connection === connection && account?.canOpenCircle && model?.phase === 'ready') {
    if (entered.destination === 'hosting' && hostingConnection && hostingConnection.memberId === account.member?.id) {
      return <CircleHostingScreen session={hostingConnection.session} config={connection.host} connectivity={connection.connectivity}
        onBack={back} onMyCircles={() => openReadingDestination('mine')} onClose={close}/>;
    }
    if (entered.destination === 'saved' && savedReadingConnection && savedReadingConnection.memberId === account.member?.id) {
      return <SavedReadingScreen session={savedReadingConnection.session} config={connection.host} connectivity={connection.connectivity} onBack={back} onClose={close}/>;
    }
    if (entered.destination === 'profile' && profileConnection && profileConnection.memberId === account.member?.id) {
      return <MemberProfileScreen session={profileConnection.session} connectivity={connection.connectivity}
        publicAvailable={Boolean(connection.host.publicProfileTransport)} onBack={back} onClose={close}/>;
    }
    if ((entered.destination === 'discover' || entered.destination === 'mine') && directoryConfig) return <CircleDirectoryScreen config={directoryConfig} connectivity={connection.connectivity}
      initialMode={entered.destination} savedReading={savedReadingConnection && savedReadingConnection.memberId === account.member?.id ? savedReadingConnection.session : undefined} onBack={back} onClose={close}/>;
    if (entered.destination === 'contributions') return <ContributionsScreen config={connection.host} connectivity={connection.connectivity}
      onBack={back} onClose={close}/>;
    if (entered.destination === 'reviews' && reviewerConfig) return <MessageReviewsScreen config={reviewerConfig} connectivity={connection.connectivity}
      onBack={back} onClose={close}/>;
    if (connection.host.circleId) return <CircleScreen config={{ ...connection.host, circleId: connection.host.circleId }} connectivity={connection.connectivity} onClose={close}/>;
  }
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS</Text>
    <Text accessibilityRole="header" style={styles.title}>Your member account</Text>
    <Text style={styles.copy}>Check your member account to manage your profile, find a Circle, return to your groups or review your contributions.</Text>
    <View accessibilityLiveRegion="polite">
      <Text style={styles.copy}>{model?.phase === 'ready' ? 'Existing sign-in verified. Check your member account to continue.'
        : model?.message ?? 'The existing account connection is unavailable. Return through the signed-in app.'}</Text>
      <Text style={styles.copy}>{account?.message ?? 'No member account has been checked.'}</Text>
    </View>
    <Action label={model?.busy ? 'Checking existing sign-in…' : 'Check existing sign-in'} disabled={!model?.canCheck || account?.busy}
      onPress={() => act(() => { setEntered(null); void connection?.binding.check(); })}/>
    <Action label={account?.phase === 'checking' ? 'Checking my member account…' : 'Check my member account'} disabled={!account?.canCheck}
      onPress={() => act(() => { setEntered(null); void connection?.account.check(); })}/>
    {account?.canConfirm || account?.confirmed ? <View style={styles.setup}>
      <Text style={styles.copy}>{account.phase === 'unknown'
        ? 'An earlier setup may have completed. Retry only if you want to check or set up this same member record again.'
        : 'Set up a Society of Explorers member record for this signed-in account. This does not join a Circle or publish a profile.'}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="I want to set up a member record for this signed-in account"
        accessibilityState={{ checked: Boolean(account.confirmed), disabled: !account.canConfirm }} disabled={!account.canConfirm}
        onPress={() => act(() => connection?.account.confirm(!account.confirmed))} style={[styles.button, !account.canConfirm && styles.disabled]}>
        <Text style={styles.copy}>{account.confirmed ? '☑ ' : '☐ '}I want to set up a member record for this signed-in account.</Text>
      </Pressable>
      <Action label={account.phase === 'preparing' ? 'Setting up my member account…' : account.phase === 'unknown' ? 'Retry member setup' : 'Set up my member account'} disabled={!account.canPrepare}
        onPress={() => act(() => { setEntered(null); void connection?.account.prepare(); })}/>
    </View> : null}
    <Action label="My profile" disabled={!account?.canOpenCircle || model?.phase !== 'ready' || !connection?.host.profileTransport} onPress={openProfile}/>
    <Action label="Saved reading" disabled={!account?.canOpenCircle || model?.phase !== 'ready' || !connection?.host.savedReadingTransport} onPress={() => openReadingDestination('saved')}/>
    {!connection?.host.profileTransport ? <Text style={styles.copy}>Profile editing is unavailable in this connection.</Text> : null}
    {profileNotice ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{profileNotice}</Text> : null}
    <Action label="Discover Circles" disabled={!account?.canOpenCircle || model?.phase !== 'ready'}
      onPress={() => openReadingDestination('discover')}/>
    <Action label="My Circles" disabled={!account?.canOpenCircle || model?.phase !== 'ready'}
      onPress={() => openReadingDestination('mine')}/>
    <Action label="Start a Circle" disabled={!account?.canOpenCircle || model?.phase !== 'ready' || !connection?.host.hostingTransport || !connection?.host.newRequestId}
      onPress={openHosting}/>
    {connection?.host.circleId ? <Action label="Continue to Circle" disabled={!account?.canOpenCircle || model?.phase !== 'ready'}
      onPress={() => act(() => { if (connection?.account.model().canOpenCircle && connection.binding.model().phase === 'ready') setEntered({ connection, destination: 'circle' }); })}/> : null}
    <Action label="View my contributions" disabled={!account?.canOpenCircle || model?.phase !== 'ready'}
      onPress={() => act(() => { if (connection?.account.model().canOpenCircle && connection.binding.model().phase === 'ready') setEntered({ connection, destination: 'contributions' }); })}/>
    <Action label="Check assigned message reviews" disabled={!account?.canOpenCircle || model?.phase !== 'ready' || !reviewerConfig}
      onPress={() => act(() => { if (reviewerConfig && connection?.account.model().canOpenCircle && connection.binding.model().phase === 'ready') setEntered({ connection, destination: 'reviews' }); })}/>
    {!reviewerConfig ? <Text selectable style={styles.copy}>Assigned message reviews are unavailable in this app connection. You can use {config.origin}/moderation/messages in your browser. The review service checks your assignment.</Text> : null}
    <Action label="Close member view" onPress={close}/>
  </ScrollView></SafeAreaView>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 }, setup: { gap: 16 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 }, disabled: { opacity: 0.5 } });
