import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PROFILE_LIMITS, type ProfileFields } from '../../lib/members/profile';
import type { MemberProfile } from '../shared/member-profile';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';

const fields = [
  { key: 'displayName', label: 'Display name', multiline: false },
  { key: 'bio', label: 'About you', multiline: true },
  { key: 'discipline', label: 'Your field', multiline: false },
  { key: 'projectDescription', label: 'What you are building', multiline: true },
  { key: 'seeking', label: 'What you are looking for', multiline: true },
  { key: 'philosophy', label: 'Your philosophy', multiline: true },
] as const;

/** The account view owns this controller so an uncertain save survives ordinary
 * view retirement. Opening the view itself performs no profile request. */
export function MemberProfileScreen({ session, connectivity, publicAvailable, onBack, onClose }: {
  session: MemberProfile; connectivity?: NativeConnectivityPort; publicAvailable: boolean; onBack(): void; onClose(): void;
}) {
  const connection = useMemo(() => ({ session, connectivity }), [session, connectivity]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: session.model() }));
  const [viewEpoch, setViewEpoch] = useState(0);
  const viewLife = useRef({ mounted: false, enabled: false, epoch: 0 });
  const m = snapshot.connection === connection ? snapshot.model : session.model();
  useLayoutEffect(() => {
    const life = viewLife.current;
    life.mounted = true; life.enabled = false; setViewEpoch(++life.epoch);
    const { session } = connection;
    let lastPhase = session.model().phase;
    const off = session.subscribe(model => {
      if (model.phase !== lastPhase || !model.connected || !model.active || !model.online || (!model.profile && !model.draft && !model.review && !model.busy)) setViewEpoch(++life.epoch);
      lastPhase = model.phase;
      setSnapshot({ connection, model });
    });
    let mounted = true, active = false, blurred = false, online = false;
    const sync = () => {
      if (!mounted) return;
      const enabled = active && !blurred && online;
      if (life.enabled !== enabled) { life.enabled = enabled; setViewEpoch(++life.epoch); }
      session.activity(active && !blurred);
    };
    session.activity(false); session.connectivity(false);
    const change = AppState.addEventListener('change', value => { active = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; active = AppState.currentState === 'active'; sync(); }) : null;
    active = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connection.connectivity, value => { if (mounted) { online = value === 'online'; sync(); session.connectivity(online); } });
    active = AppState.currentState === 'active'; sync(); session.connect();
    return () => { mounted = false; life.mounted = false; life.enabled = false; ++life.epoch; off(); session.disconnect(); offConnectivity(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  const act = (work: () => void, allowInactive = false) => {
    const life = viewLife.current;
    if (life.mounted && life.epoch === viewEpoch && (allowInactive || life.enabled)) work();
  };
  const preview = m.review, publicProfile = m.publicProfile;
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · PROFILE</Text>
    <Text accessibilityRole="header" style={styles.title}>Your profile</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{m.message}</Text>
    <Action label={m.phase === 'unknown' ? 'Check saved profile' : 'Load my profile'} disabled={!m.canLoad} onPress={() => act(() => void session.load())}/>
    {m.profile ? <Text style={styles.note}>Current saved profile: {m.profile.visibility === 'public' ? 'Published' : 'Private'}.</Text> : null}
    {m.draft && !preview ? <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Profile fields</Text>
      {fields.map(field => <View key={field.key} style={styles.field}>
        <Text style={styles.copy}>{field.label}</Text>
        <TextInput accessibilityLabel={field.label} value={m.draft![field.key]} editable={m.canEdit}
          multiline={field.multiline} maxLength={PROFILE_LIMITS[field.key]} style={[styles.input, field.multiline && styles.multiline]}
          onChangeText={value => act(() => session.edit(field.key, value))}/>
      </View>)}
      <Text style={styles.copy}>Skills, separated by commas</Text>
      <TextInput accessibilityLabel="Skills, separated by commas" value={m.draft.skills.join(',')} editable={m.canEdit}
        maxLength={4078} style={styles.input} onChangeText={value => act(() => session.edit('skills', value === '' ? [] : value.split(',')))}/>
      <Text style={styles.note}>Up to 40 skills, 100 characters each.</Text>
      <Text accessibilityRole="header" style={styles.heading}>Who can see your profile?</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Profile visibility" style={styles.field}>
        <Choice label="Keep profile private" checked={m.visibility === 'private'} disabled={!m.canEdit} onPress={() => act(() => session.setVisibility('private'))}/>
        <Choice label="Publish profile" checked={m.visibility === 'public'} disabled={!m.canEdit} onPress={() => act(() => session.setVisibility('public'))}/>
      </View>
      <Text style={styles.note}>{m.visibility === 'public'
        ? 'Publishing makes your display name and all of these profile fields visible to everyone.'
        : 'A private profile is hidden from public profiles and the member directory. Your display name can still appear with your Circle contributions.'}</Text>
      <Action label="Review profile changes" disabled={!m.canReview} onPress={() => act(() => session.review())}/>
    </View> : null}
    {preview ? <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>{preview.retry ? 'Review this same save again' : preview.visibility === 'public' ? 'Review publication' : 'Review private profile'}</Text>
      <Text style={styles.copy}>{preview.visibility === 'public' ? 'Confirming will publish these exact profile fields for everyone to see.'
        : 'Confirming will save these profile fields privately. Existing Circle contributions remain visible where they were shared.'}</Text>
      {preview.retry ? <Text style={styles.note}>An earlier attempt may have completed. This retry uses the same reviewed changes and version; it does not send a new edit.</Text> : null}
      <ProfileText profile={preview.profile}/>
      <Action label={preview.retry ? 'Confirm retry of same profile save' : preview.visibility === 'public' ? 'Confirm save and publish profile' : 'Confirm save private profile'}
        disabled={!m.canConfirm} onPress={() => act(() => void session.confirm())}/>
      <Action label="Cancel profile review" disabled={!m.canCancel} onPress={() => act(() => session.cancel())}/>
    </View> : null}
    {m.canRetry ? <Action label="Review retry of same profile save" onPress={() => act(() => session.retry())}/> : null}
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Your saved public profile</Text>
      <Text style={styles.note}>{publicAvailable ? 'Check how your saved profile appears to everyone. Unsaved changes are not included.' : 'Public-profile checking is unavailable in this connection.'}</Text>
      <Action label="Check my public profile" disabled={!m.canCheckPublic} onPress={() => act(() => void session.checkPublic())}/>
      <Text accessibilityLiveRegion="polite" style={styles.note}>{m.publicStatus === 'public' ? 'The public profile returned these fields.'
        : m.publicStatus === 'not-visible' ? 'No public profile is visible at this address.'
        : m.publicStatus === 'unavailable' ? 'The public profile could not be checked. Its visibility has not been confirmed.'
        : m.publicStatus === 'loading' ? 'Checking your saved public profile…' : 'The public profile has not been checked.'}</Text>
      {publicProfile ? <ProfileText profile={{ displayName: publicProfile.display_name, bio: publicProfile.bio ?? '', discipline: publicProfile.discipline ?? '',
        skills: publicProfile.skills, projectDescription: publicProfile.project_description ?? '', seeking: publicProfile.seeking ?? '', philosophy: publicProfile.philosophy ?? '' }}/> : null}
    </View>
    <Text style={styles.note}>Leaving clears unsaved fields from this view. A save already sent may still complete. An unresolved save stays available for checking while this member account view remains open; closing the member view clears that local recovery information.</Text>
    <Action label="Back to member account" disabled={!m.canNavigate} onPress={() => act(() => { if (session.model().canNavigate) onBack(); }, true)}/>
    <Action label="Close member view" onPress={() => act(onClose, true)}/>
  </ScrollView></SafeAreaView>;
}
function ProfileText({ profile }: { profile: ProfileFields }) {
  return <View style={styles.field}>
    {fields.map(field => <View key={field.key} style={styles.field}>
      <Text style={styles.note}>{field.label}</Text><Text selectable style={styles.copy}>{profile[field.key] || 'Not provided'}</Text>
    </View>)}
    <Text style={styles.note}>Skills</Text><Text selectable style={styles.copy}>{profile.skills.join(', ') || 'Not provided'}</Text>
  </View>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
function Choice({ label, checked, disabled, onPress }: { label: string; checked: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{checked ? '◉ ' : '○ '}{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  heading: { color: '#f4f2e5', fontSize: 23, lineHeight: 30 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  note: { color: '#c0cbbf', fontSize: 15, lineHeight: 23 }, field: { gap: 8 },
  card: { gap: 16, padding: 16, borderWidth: 1, borderColor: '#536d61', borderRadius: 8 },
  input: { color: '#f4f2e5', backgroundColor: '#172923', borderWidth: 1, borderColor: '#91a99a', borderRadius: 8, padding: 12, minHeight: 48, fontSize: 17 },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 }, disabled: { opacity: 0.5 } });
