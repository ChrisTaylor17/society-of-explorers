import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { createNativeEmailAuth } from './src/auth/email-auth';

type Controller = ReturnType<typeof createNativeEmailAuth>;
type Mode = 'signup' | 'recovery';
type Model = ReturnType<Controller['model']>;

export function NativeEmailAccountForm({ controller, mode, onSignIn }: {
  controller: Controller; mode: Mode; onSignIn(): void;
}) {
  const owner = useRef<Controller | null>(null), epoch = useRef(0);
  const [, setVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<{ owner: Controller; model: Model } | null>(null);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const invalidate = () => { epoch.current++; setVersion(value => value + 1); };
  const clear = () => { setEmail(''); setPassword(''); setConfirmation(''); };
  useLayoutEffect(() => {
    const viewEpoch = epoch;
    let firstSnapshot = true;
    owner.current = controller;
    viewEpoch.current++;
    const off = controller.subscribe(model => {
      if (owner.current !== controller) return;
      viewEpoch.current++;
      setSnapshot({ owner: controller, model });
      if (firstSnapshot || !model.active || !model.online || model.busy || ['confirmed', 'accepted', 'closed'].includes(model.phase)) clear();
      firstSnapshot = false;
    });
    return () => { viewEpoch.current++; owner.current = null; off(); };
  }, [controller, mode]);

  const model = snapshot?.owner === controller ? snapshot.model : controller.model();
  const capturedEpoch = epoch.current;
  const current = () => owner.current === controller && epoch.current === capturedEpoch;
  const editable = () => current() && controller.model().active && controller.model().online && !controller.model().busy;
  const done = model.phase === 'confirmed' || model.phase === 'accepted';
  const update = model.phase === 'ready' || model.phase === 'updating';
  const start = !done && !update;
  function request(kind: 'signup' | 'resend' | 'recovery') {
    if (!editable()) return;
    const latest = controller.model();
    if (kind === 'signup' ? !latest.canSignUp : kind === 'resend' ? !latest.canResend : !latest.canRecover) return;
    const address = email, secret = password, repeated = confirmation;
    invalidate(); clear();
    if (kind === 'signup') void controller.signUp(address, secret, repeated);
    else if (kind === 'resend') void controller.resend(address);
    else void controller.recover(address);
  }
  function act(capability: 'canLoad' | 'canContinue' | 'canDiscard', action: () => Promise<void>) {
    if (!editable() || !controller.model()[capability]) return;
    invalidate(); clear(); void action();
  }
  const edit = (setter: (value: string) => void, value: string) => {
    if (!editable()) return;
    invalidate(); setter(value);
  };
  return <View style={styles.group}>
    <Text accessibilityRole="header" style={styles.title}>{update ? 'Choose a new password' : mode === 'signup' ? 'Create your account' : 'Recover your password'}</Text>
    <Text style={styles.copy}>Supabase sends the email link. Open it on this device, return here, then load and continue the link.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{model.message}</Text>
    {model.warning ? <Text accessibilityLiveRegion="polite" style={styles.note}>{model.warning}</Text> : null}
    {start ? <>
      <Text style={styles.label}>Email</Text>
      <TextInput accessibilityLabel="Email" value={email} onChangeText={value => edit(setEmail, value)} editable={!model.busy && model.active && model.online}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="username" maxLength={254} style={styles.input}/>
    </> : null}
    {update || (start && mode === 'signup') ? <>
      <Text style={styles.label}>New password</Text>
      <TextInput accessibilityLabel="New password" value={password} onChangeText={value => edit(setPassword, value)} editable={!model.busy && model.active && model.online}
        secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" maxLength={1024} style={styles.input}/>
      <Text style={styles.label}>Confirm new password</Text>
      <TextInput accessibilityLabel="Confirm new password" value={confirmation} onChangeText={value => edit(setConfirmation, value)} editable={!model.busy && model.active && model.online}
        secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" maxLength={1024} style={styles.input}/>
    </> : null}
    {start && mode === 'signup' ? <>
      <Action label="Send confirmation email" disabled={!model.canSignUp || !email.trim() || !password || !confirmation} onPress={() => request('signup')}/>
      <Action label="Resend confirmation email" disabled={!model.canResend || !email.trim()} onPress={() => request('resend')}/>
    </> : null}
    {start && mode === 'recovery' ? <Action label="Send recovery email" disabled={!model.canRecover || !email.trim()} onPress={() => request('recovery')}/> : null}
    {update ? <Action label="Update password" disabled={!model.canUpdate || !password || !confirmation} onPress={() => {
      if (!editable() || !controller.model().canUpdate) return;
      const secret = password, repeated = confirmation;
      invalidate(); clear(); void controller.updatePassword(secret, repeated);
    }}/> : null}
    {!done && !update ? <>
      <Action label="Load email link" disabled={!model.canLoad} onPress={() => act('canLoad', () => controller.loadPending())}/>
      {model.pending ? <Text style={styles.copy}>{model.pending.purpose === 'signup' ? 'Account confirmation' : 'Password recovery'}: {model.pending.hasCode ? 'link is ready to verify.' : 'open the latest email, then load the link again.'}</Text> : null}
      <Action label="Continue email link" disabled={!model.canContinue} onPress={() => act('canContinue', () => controller.continuePending())}/>
      {model.pending ? <Action label="Discard email link" disabled={!model.canDiscard} onPress={() => act('canDiscard', () => controller.discardPending())}/> : null}
    </> : null}
    <Text style={styles.note}>After confirmation or a password update, sign in with your email and password. A request already sent may finish after you leave this screen. Nothing retries automatically.</Text>
    <Action label="Sign in instead" onPress={() => { if (!current()) return; invalidate(); clear(); onSignIn(); }}/>
  </View>;
}

function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  group: { gap: 16 }, title: { color: '#f4f2e5', fontSize: 26, lineHeight: 34 },
  copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 }, label: { color: '#e9eadf', fontSize: 16 }, note: { color: '#c0cbbf', fontSize: 15, lineHeight: 23 },
  input: { color: '#f4f2e5', backgroundColor: '#172b24', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, fontSize: 17, minHeight: 48 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 }, disabled: { opacity: 0.5 },
});
