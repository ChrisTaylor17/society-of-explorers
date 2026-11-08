import { useLayoutEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CircleAdmission } from '../shared/circle-admission';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';
import { CircleCommunityNorms } from './CircleCommunityNorms';

const consentLabel = 'I choose to share my member name and account reference with this salon’s host.';
const confirmationLabel = 'I reviewed the account, recipient and effects above and want this invitation action.';

/** The account screen retains the controller through temporary unmounts. Codes
 * never enter navigation, clipboard, persistent storage or platform URLs. */
export function CircleAdmissionScreen({ session, connectivity, onBack, onDiscard }: {
  session: CircleAdmission; connectivity?: NativeConnectivityPort; onBack(): void; onDiscard(): void;
}) {
  const [snapshot, setSnapshot] = useState(() => ({ session, model: session.model() }));
  const life = useRef({ mounted: false });
  const m = snapshot.session === session ? snapshot.model : session.model();
  useLayoutEffect(() => {
    const lifetime = life.current; lifetime.mounted = true;
    const off = session.subscribe(model => setSnapshot({ session, model }));
    let mounted = true, active = false, blurred = false;
    const sync = () => { if (mounted) session.activity(active && !blurred); };
    session.activity(false); session.connectivity(false);
    const change = AppState.addEventListener('change', value => { active = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; active = AppState.currentState === 'active'; sync(); }) : null;
    active = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connectivity, value => { if (mounted) session.connectivity(value === 'online'); });
    active = AppState.currentState === 'active'; sync(); session.connect();
    return () => {
      mounted = false; lifetime.mounted = false; session.disconnect();
      offConnectivity(); off(); change.remove(); blur?.remove(); focus?.remove();
    };
  }, [session, connectivity]);
  const act = (work: () => void, allowInactive = false) => {
    const current = session.model();
    if (life.current.mounted && current.epoch === m.epoch && (allowInactive || current.connected && current.active && current.online)) work();
  };
  const review = m.review, access = m.access;
  const confirmAction = review?.kind === 'issue' ? 'Issue approval code' : review?.kind === 'join' ? 'Confirm join' : 'Confirm revocation';
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS</Text>
    <Text accessibilityRole="header" style={styles.title}>Salon invitations</Text>
    <Text style={styles.copy}>The salon name, description and schedule are public. Host approval controls membership. The host manages entry to an external video room separately.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{m.message}</Text>
    <Action label="Check invitation access" disabled={!m.canCheck} onPress={() => act(() => void session.check())}/>
    {m.uncertain ? <View style={styles.card}>
      <Text style={styles.copy}>A sent request may still complete. Other changes are paused. Checking an earlier join result is read only and cannot join you again.</Text>
      <Action label="Check earlier invitation result" disabled={!m.canRecover} onPress={() => act(() => void session.recover())}/>
    </View> : null}
    {access ? <>
      <Text accessibilityRole="header" style={styles.heading}>{access.title}</Text>
      <Text style={styles.copy}>Signed in as {m.account} (account {access.memberId.slice(0, 8)}).</Text>
      <Text style={styles.copy}>{access.admissionMode === 'host_approval' ? 'Membership requires this host’s approval.' : 'This salon uses open joining. Use its regular membership controls.'}{access.isMember ? ' You are currently a member.' : ''}</Text>
      {!review && access.admissionMode === 'host_approval' && !access.isMember ? <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Give the host your sharing code</Text>
        <Text style={styles.copy}>Choose to let this salon’s host see your member name and account reference. The code lasts one hour, works only for this salon and gives no membership or message access. Send it privately to the host.</Text>
        <Check label={consentLabel} checked={m.shareConsent} disabled={!m.canEdit} onPress={() => act(() => session.consent(!m.shareConsent))}/>
        <Action label="Create my sharing code" disabled={!m.canGenerate} onPress={() => act(() => void session.generate())}/>
        {m.recipientCode ? <Code label="My one-hour sharing code" value={m.recipientCode}/> : null}
      </View> : null}
      {!review && access.canIssue ? <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Approve a recipient</Text>
        <Text style={styles.copy}>Ask the person for their own sharing code. Review the recipient before issuing a 24-hour approval. A forwarded approval still needs that exact recipient account.</Text>
        <Field label="Recipient sharing code" value={m.hostCode} maximum={1000} editable={m.canEdit} onChange={value => act(() => session.edit('hostCode', value.trim()))}/>
        <Action label="Review recipient" disabled={!m.canReviewHost} onPress={() => act(() => void session.reviewHost())}/>
        {m.issuedApproval ? <Code label="Approval code for the reviewed recipient" value={m.issuedApproval}/> : null}
      </View> : null}
      {!review && access.admissionMode === 'host_approval' && !access.isMember ? <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Review the host’s approval</Text>
        <Text style={styles.copy}>Paste the approval the host gave you. Reviewing checks the account and salon; joining requires a separate confirmation.</Text>
        <Field label="Host approval code" value={m.approvalText} maximum={1600} editable={m.canEdit} onChange={value => act(() => session.edit('approvalText', value.trim()))}/>
        <Action label="Review my approval" disabled={!m.canReviewJoin} onPress={() => act(() => void session.reviewJoin())}/>
      </View> : null}
      {!review && access.canRevoke ? <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Revoke outstanding approvals</Text>
        <Text style={styles.copy}>All unused approvals will stop working. Existing members stay. You can issue new approvals afterward.</Text>
        <Action label="Review revocation" disabled={!m.canReviewRevoke} onPress={() => act(() => void session.reviewRevoke())}/>
      </View> : null}
    </> : null}
    {review ? <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>{review.kind === 'issue' ? 'Review this recipient' : review.kind === 'join' ? 'Review joining this salon' : 'Review revoking outstanding approvals'}</Text>
      <Text style={styles.copy}>Salon: {access?.title}. Account: {m.account} ({access?.memberId.slice(0, 8)}).</Text>
      {review.kind === 'issue' ? <>
        <Text style={styles.copy}>Recipient: {review.recipient.targetLabel} (account {review.recipient.targetMemberId.slice(0, 8)}).</Text>
        <Text style={styles.copy}>Approval expires {review.recipient.expiresAt}. It admits only that account after the person confirms.</Text>
      </> : review.kind === 'join' ? <Text style={styles.copy}>This approval is for your current account and expires {review.invitation.expiresAt}. Joining shares your membership with this salon and permits its member conversation. The listing remains public.</Text>
        : <Text style={styles.copy}>{review.retry ? 'This deliberately retries the exact original revocation. ' : ''}Unused approvals will stop working; existing members remain.</Text>}
      {review.kind === 'join' ? <CircleCommunityNorms/> : null}
      <Check label={confirmationLabel} checked={m.confirmed} disabled={m.busy || !m.connected || !m.active || !m.online}
        onPress={() => act(() => session.confirm(!m.confirmed))}/>
      <Action label={confirmAction} disabled={!m.canConfirm} onPress={() => act(() => void session.send())}/>
      <Action label="Cancel invitation review" disabled={!m.canCancel} onPress={() => act(() => session.cancel())}/>
    </View> : null}
    <Action label="Back to salon" disabled={!m.canNavigate} onPress={() => act(onBack, true)}/>
    <Text style={styles.note}>Discarding this private view clears codes and any result reference. It does not cancel a sent request. Recovery is available only while this app retains the same controller; it does not survive app termination.</Text>
    <Action label="Discard private invitation view and return" onPress={() => act(() => { session.close(); onDiscard(); }, true)}/>
  </ScrollView></SafeAreaView>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
function Check({ label, checked, disabled, onPress }: { label: string; checked: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{checked ? '☑ ' : '☐ '}{label}</Text></Pressable>;
}
function Field({ label, value, maximum, editable, onChange }: { label: string; value: string; maximum: number; editable: boolean; onChange(value: string): void }) {
  return <View style={styles.list}><Text style={styles.copy}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} maxLength={maximum} editable={editable} multiline autoCorrect={false} autoCapitalize="none"
      autoComplete="off" importantForAutofill="no" onChangeText={onChange} style={styles.input}/></View>;
}
function Code({ label, value }: { label: string; value: string }) {
  return <View style={styles.list}><Text style={styles.copy}>{label}</Text><Text selectable accessibilityLabel={label} style={styles.code}>{value}</Text></View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 }, list: { gap: 12 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  heading: { color: '#f4f2e5', fontSize: 22, lineHeight: 30 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  note: { color: '#c3cec4', fontSize: 15, lineHeight: 23 }, code: { color: '#f4f2e5', fontSize: 14, lineHeight: 22 },
  card: { gap: 16, padding: 16, borderWidth: 1, borderColor: '#657d6b', borderRadius: 8 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 },
  input: { backgroundColor: '#152920', color: '#f4f2e5', borderWidth: 1, borderColor: '#a6baaa', borderRadius: 6, padding: 12, minHeight: 96 },
  disabled: { opacity: 0.5 },
});
