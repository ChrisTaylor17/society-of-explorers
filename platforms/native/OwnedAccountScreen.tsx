import { useLayoutEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { MemberCircleScreen, createMemberViewConnection, type MemberViewConnection } from './MemberCircleScreen';
import type { createOwnedNativeAuth } from './src/auth/owned-auth';
import { prepareInstalledOwnedAccount } from './src/auth/installed-owned-account';
import type { ExistingMemberAccountConfig } from './src/circles/verified-member-session';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';
import type { createNativeEmailAuth } from './src/auth/email-auth';
import { NativeEmailAccountForm } from './NativeEmailAccountForm';
import { PhilemonStudyScreen } from './PhilemonStudyScreen';
import { ClipsScreen } from './ClipsScreen';
import { REEL_QUESTIONS, type ReelDiscussionId } from '../../lib/clips/salon';
import { PublicCirclesScreen } from './PublicCirclesScreen';
import type { PublicCircleChoice } from '../shared/circle-directory';
import type { PublicCircleDiscoveryConnection } from './src/circles/installed-member';

export type OwnedAccountConnection = {
  controller: ReturnType<typeof createOwnedNativeAuth>;
  email?: ReturnType<typeof createNativeEmailAuth>;
  config: ExistingMemberAccountConfig;
  connectivity: NativeConnectivityPort;
  close(): void;
};
type AuthModel = ReturnType<OwnedAccountConnection['controller']['model']>;
type AccountMode = 'signin' | 'signup' | 'recovery';

/** Only the native policy factory is used by the registered app. The explicit
 * prepare prop is a trusted composition seam, never populated from a URL. */
export function OwnedAccountScreen({ prepare = prepareInstalledOwnedAccount, publicCirclesPrepare }: {
  prepare?: () => Promise<OwnedAccountConnection>; publicCirclesPrepare?: () => Promise<PublicCircleDiscoveryConnection>;
}) {
  const [connection, setConnection] = useState<OwnedAccountConnection | null>(null);
  const [snapshot, setSnapshot] = useState<{ connection: OwnedAccountConnection; model: AuthModel } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState('Connect to sign in or manage your account.');
  const [mode, setMode] = useState<AccountMode>('signin');
  const [, setVersion] = useState(0);
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [entered, setEntered] = useState<OwnedAccountConnection | null>(null);
  const [memberProblem, setMemberProblem] = useState('');
  const [studyOpen, setStudyOpen] = useState(false);
  const [clipsOpen, setClipsOpen] = useState(false);
  const [publicCircles, setPublicCircles] = useState<{ reel?: ReelDiscussionId } | null>(null);
  const [circleChoice, setCircleChoice] = useState<(PublicCircleChoice & { reel?: ReelDiscussionId }) | null>(null);
  const [philemonHosting, setPhilemonHosting] = useState(false);
  const [memberContext, setMemberContext] = useState<{ connection: OwnedAccountConnection; view: MemberViewConnection } | null>(null);
  const mounted = useRef(false), active = useRef(false), attempt = useRef(0);
  const epoch = useRef(0), modeRef = useRef<AccountMode>('signin'), preparing = useRef(false);
  const current = useRef<OwnedAccountConnection | null>(null);
  const memberView = useRef<{ connection: OwnedAccountConnection; view: MemberViewConnection } | null>(null);
  const clearFields = () => { setEmail(''); setPassword(''); };
  const invalidate = () => { epoch.current++; setVersion(value => value + 1); };
  const m = snapshot?.connection === connection ? snapshot?.model : connection?.controller.model();
  const signingOut = m?.phase === 'signing_out';
  const capturedEpoch = epoch.current;
  const validView = () => mounted.current && current.current === connection && modeRef.current === mode && epoch.current === capturedEpoch;

  useLayoutEffect(() => {
    const attempts = attempt;
    const viewEpoch = epoch;
    mounted.current = true;
    let blurred = false;
    const sync = () => {
      // Lifecycle replay also retires rendered callbacks before any connection
      // exists. Publish a render so the new active view can connect explicitly.
      invalidate();
      active.current = AppState.currentState === 'active' && !blurred;
      current.current?.controller.activity(active.current && modeRef.current === 'signin');
      current.current?.email?.activity(active.current && modeRef.current !== 'signin');
      if (!active.current) { ++attempt.current; preparing.current = false; setConnecting(false); clearFields(); setEntered(null); }
    };
    const change = AppState.addEventListener('change', sync);
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; sync(); }) : null;
    sync();
    return () => {
      mounted.current = false; active.current = false; viewEpoch.current++; preparing.current = false; ++attempts.current;
      const oldMember = memberView.current; memberView.current = null; oldMember?.view.close();
      const old = current.current; current.current = null; old?.close();
      change.remove(); blur?.remove(); focus?.remove();
    };
  }, []);

  useLayoutEffect(() => {
    if (!connection) return;
    const { controller } = connection;
    const off = controller.subscribe(model => {
      if (current.current !== connection) return;
      epoch.current++;
      setSnapshot({ connection, model });
      if (!model.ready) setEntered(null);
    });
    controller.activity(active.current && modeRef.current === 'signin');
    connection.email?.activity(active.current && modeRef.current !== 'signin');
    const offConnectivity = observeNativeConnectivity(connection.connectivity, state => {
      controller.connectivity(state === 'online');
      connection.email?.connectivity(state === 'online');
      if (state !== 'online') { invalidate(); clearFields(); setEntered(null); }
    });
    return () => {
      if (memberView.current?.connection === connection) { const oldMember = memberView.current; memberView.current = null; oldMember.view.close(); }
      offConnectivity(); off(); connection.close();
    };
  }, [connection]);

  async function connect() {
    if (!validView() || !active.current || preparing.current || current.current) return;
    invalidate(); preparing.current = true;
    const id = ++attempt.current;
    setConnecting(true); clearFields(); setNotice('Preparing the protected account connection…');
    let expired = false, timer: ReturnType<typeof setTimeout> | undefined;
    const pending = Promise.resolve().then(prepare).then(value => {
      if (expired || !mounted.current || !active.current || attempt.current !== id) { value.close(); throw Error('Retired'); }
      return value;
    });
    try {
      const ready = await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(Error('Unavailable')); }, 15000);
      })]);
      if (!mounted.current || !active.current || attempt.current !== id) { ready.close(); return; }
      current.current = ready; setConnection(ready);
    } catch {
      if (mounted.current && attempt.current === id) setNotice('Sign-in is unavailable in this build. Your account has not been connected.');
    } finally {
      clearTimeout(timer);
      if (mounted.current && attempt.current === id) { preparing.current = false; setConnecting(false); }
    }
  }
  function close() {
    if (!validView()) return;
    const model = connection?.controller.model();
    if (model?.phase === 'signing_out') return;
    invalidate(); preparing.current = false;
    ++attempt.current; setConnecting(false); clearFields(); setEntered(null); setCircleChoice(null);
    const oldMember = memberView.current; memberView.current = null; oldMember?.view.close(); setMemberProblem('');
    setMemberContext(null);
    const old = current.current; current.current = null; old?.close(); setConnection(null); setSnapshot(null);
    modeRef.current = 'signin'; setMode('signin');
    setNotice(model?.phase === 'closed' || model?.phase === 'clear_unknown'
      ? model.message : 'Account view closed. A saved sign-in may remain on this device. Connect to restore it or clear it.');
  }
  function signIn() {
    if (!validView() || mode !== 'signin') return;
    const value = connection;
    if (!value?.controller.model().canSignIn) return;
    const submittedEmail = email, submittedPassword = password;
    invalidate();
    clearFields(); setEntered(null);
    void value.controller.signIn(submittedEmail, submittedPassword);
  }
  function endDeviceSession(onlineSignOut: boolean) {
    if (!validView() || mode !== 'signin') return;
    const value = connection;
    if (!value) return;
    const model = value.controller.model();
    if (onlineSignOut ? !model.canSignOut : !model.canClear) return;
    invalidate(); setPhilemonHosting(false); setCircleChoice(null);
    clearFields(); setEntered(null);
    const oldMember = memberView.current; memberView.current = null; oldMember?.view.close(); setMemberProblem('');
    setMemberContext(null);
    if (onlineSignOut) void value.controller.signOutDevice();
    else void value.controller.clearDeviceSession();
  }
  function enterMember() {
    if (!validView() || mode !== 'signin' || !connection?.controller.model().ready) return;
    invalidate();
    try {
      if (memberView.current?.connection !== connection) {
        memberView.current?.view.close();
        memberView.current = { connection, view: createMemberViewConnection(connection.config, connection.connectivity) };
      }
      clearFields(); setMemberProblem(''); setMemberContext(memberView.current); setEntered(connection);
    } catch { setMemberProblem('The member account view is unavailable. Close sign-in and connect again.'); }
  }
  function switchMode(next: AccountMode) {
    if (!validView() || !connection || connection.controller.model().phase === 'signing_out' || (next !== 'signin' && !connection.email)) return;
    invalidate(); clearFields(); setEntered(null); setMemberProblem('');
    const oldMember = memberView.current; memberView.current = null; oldMember?.view.close(); setMemberContext(null);
    connection.controller.activity(false); connection.email?.activity(false);
    modeRef.current = next; setMode(next);
    connection.controller.activity(active.current && next === 'signin');
    connection.email?.activity(active.current && next !== 'signin');
  }
  function edit(setter: (value: string) => void, value: string) {
    if (!validView() || mode !== 'signin' || !connection?.controller.model().canSignIn) return;
    invalidate(); setter(value);
  }
  function openStudy() {
    if (!validView() || current.current || preparing.current) return;
    invalidate(); setStudyOpen(true);
  }
  function closeStudy(prepareHosting: boolean) {
    if (!validView() || !studyOpen || current.current) return;
    invalidate(); setStudyOpen(false);
    if (prepareHosting) { setPhilemonHosting(true); setCircleChoice(null); }
  }
  function openClips() {
    if (!validView() || current.current || preparing.current) return;
    invalidate(); setClipsOpen(true);
  }
  function closeClips(read: boolean) {
    if (!validView() || !clipsOpen || current.current) return;
    invalidate(); setClipsOpen(false);
    if (read) setStudyOpen(true);
  }
  function openPublicCircles(reel?: ReelDiscussionId) {
    if (!validView() || !active.current || current.current || preparing.current || publicCircles) return;
    invalidate(); setPublicCircles({ reel });
  }
  function closePublicCircles(choice?: PublicCircleChoice) {
    if (!validView() || !publicCircles || current.current || choice && !active.current) return;
    invalidate(); setPublicCircles(null);
    if (choice) { setClipsOpen(false); setStudyOpen(false); setPhilemonHosting(false); setCircleChoice({ ...choice, reel: publicCircles.reel }); }
  }
  if (publicCircles) return <PublicCirclesScreen prepare={publicCirclesPrepare} reel={publicCircles.reel}
    onBack={() => closePublicCircles()} onChoose={closePublicCircles}/>;
  if (clipsOpen) return <ClipsScreen onBack={() => closeClips(false)} onRead={() => closeClips(true)}
    onBrowse={openPublicCircles} preparePublicCircles={publicCirclesPrepare}/>;
  if (studyOpen) return <PhilemonStudyScreen onBack={() => closeStudy(false)} onHost={() => closeStudy(true)} onBrowse={() => openPublicCircles()}/>;
  if (connection && entered === connection && m?.ready && memberContext?.connection === connection) return <MemberCircleScreen config={connection.config}
    retained={memberContext.view} connectivity={connection.connectivity} philemonHosting={philemonHosting} circleChoice={circleChoice ?? undefined} onClose={() => {
      if (current.current !== connection || memberView.current !== memberContext) return;
      const oldMember = memberView.current; memberView.current = null; oldMember?.view.close(); setMemberContext(null); setEntered(null); setCircleChoice(null);
    }}/>;

  return <SafeAreaView style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS</Text>
    <Text accessibilityRole="header" style={styles.title}>Your account, on this device</Text>
    <Text style={styles.copy}>Read deeply. Share thoughtfully. A Great Books community rooted in Christian and American traditions, open to everyone willing to explore in good faith.</Text>
    {!connection ? <>
      <Action label="Find an online Circle" disabled={connecting} onPress={() => openPublicCircles()}/>
      <Action label="Explore Clips" disabled={connecting} onPress={openClips}/>
      <Action label="Read Philemon" disabled={connecting} onPress={openStudy}/>
    </> : null}
    {circleChoice ? <>
      <Text style={styles.note}>Sign in to continue with {circleChoice.title}.</Text>
      {circleChoice.reel && <Text style={styles.note}>{REEL_QUESTIONS[circleChoice.reel]}</Text>}
      <Action label="Clear selected Circle" onPress={() => {
        if (!validView()) return;
        invalidate(); setCircleChoice(null);
      }}/>
    </> : null}
    {philemonHosting ? <>
      <Text style={styles.note}>Sign in and check your member account to prepare a weekly online Circle from the Philemon guide.</Text>
      <Action label="Clear Philemon hosting choice" onPress={() => {
        if (!validView()) return;
        invalidate(); setPhilemonHosting(false);
      }}/>
    </> : null}
    {mode === 'signin' ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{m?.message ?? notice}</Text> : null}
    {memberProblem ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{memberProblem}</Text> : null}
    {!connection ? <Action label={connecting ? 'Connecting…' : 'Connect my account'} disabled={connecting} onPress={() => void connect()}/> : <>
      {mode !== 'signin' && connection.email ? <NativeEmailAccountForm key={mode} controller={connection.email} mode={mode} onSignIn={() => switchMode('signin')}/> : <>
      <Text style={styles.copy}>Use your existing account email and password. These details are sent to Supabase to sign in.</Text>
      <Text style={styles.label}>Email</Text>
      <TextInput accessibilityLabel="Email" value={email} onChangeText={value => edit(setEmail, value)} editable={Boolean(m?.canSignIn)}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="username" maxLength={254} style={styles.input}/>
      <Text style={styles.label}>Password</Text>
      <TextInput accessibilityLabel="Password" value={password} onChangeText={value => edit(setPassword, value)} editable={Boolean(m?.canSignIn)}
        secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" maxLength={1024} style={styles.input}/>
      <Action label="Sign in" disabled={!m?.canSignIn || !email.trim() || !password} onPress={signIn}/>
      <Action label="Restore saved sign-in" disabled={!m?.canResume} onPress={() => {
        if (!validView() || !connection.controller.model().canResume) return;
        invalidate(); clearFields(); setEntered(null); void connection.controller.resume();
      }}/>
      <Action label="Continue to my member account" disabled={!m?.ready} onPress={enterMember}/>
      {connection.email ? <>
        <Action label="Create account" disabled={signingOut} onPress={() => switchMode('signup')}/>
        <Action label="Recover password" disabled={signingOut} onPress={() => switchMode('recovery')}/>
      </> : null}
      {m?.canSignOut || signingOut ? <>
        <Text style={styles.note}>Sign out ends this phone’s online session and clears its saved sign-in.</Text>
        <Action label="Sign out of this device" disabled={signingOut} onPress={() => endDeviceSession(true)}/>
      </> : null}
      <Text style={styles.note}>Clear the saved sign-in on this phone, even while offline. The online session can remain active.</Text>
      <Action label="Clear sign-in from this device" disabled={!m?.canClear} onPress={() => endDeviceSession(false)}/>
      </>}
      <Action label="Close sign-in" disabled={signingOut} onPress={close}/>
    </>}
  </ScrollView></SafeAreaView>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 18 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 }, label: { color: '#e9eadf', fontSize: 16 }, note: { color: '#c0cbbf', fontSize: 15, lineHeight: 23 },
  input: { color: '#f4f2e5', backgroundColor: '#172b24', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, fontSize: 17, minHeight: 48 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 }, disabled: { opacity: 0.5 } });
