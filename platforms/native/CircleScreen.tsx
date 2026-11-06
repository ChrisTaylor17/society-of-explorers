import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ArchiveQuery } from '../shared/archive';
import { PublicProfileScreen } from './PublicProfileScreen';
import type { MemberSessionModel } from './src/circles/verified-member-session';
import { createCircleHost, type CircleHostConfig } from './src/circles/host';
import type { ThreadMessage } from '../../lib/circles/thread';
import { observeNativeConnectivity, type NativeConnectivityPort, type NativeConnectivityState } from './src/circles/native-connectivity';
import { MESSAGE_REPORT_OPTIONS, MESSAGE_WITHDRAWAL_PRIVACY } from '../shared/message-safety';
import { REEL_QUESTIONS, reelDiscussionDraft, type ReelDiscussionId } from '../../lib/clips/salon';

export function CircleScreen({ config, connectivity, onClose, onBack, memberSession, reel }: {
  config?: CircleHostConfig; connectivity?: NativeConnectivityPort; onClose(): void; onBack?(): void;
  memberSession?: { model: MemberSessionModel; onCheck(): void }; reel?: ReelDiscussionId;
}) {
  const connection = useMemo(() => { try { return config ? { host: createCircleHost({ ...config, initialOnline: false }), connectivity, config } : null; } catch { return null; } }, [config, connectivity]);
  const host = connection?.host;
  const [network, setNetwork] = useState<NativeConnectivityState>('unknown');
  const [snapshot, setSnapshot] = useState(() => ({ host, model: host?.model() }));
  const [publicProfile, setPublicProfile] = useState<{ connection: NonNullable<typeof connection>; memberId: string; origin: ArchiveQuery | null } | null>(null);
  const publicProfileConfig = useMemo(() => publicProfile ? { ...publicProfile.connection.config, memberId: publicProfile.memberId } : null, [publicProfile]);
  const [viewEpoch, setViewEpoch] = useState(0), viewLife = useRef({ mounted: false, enabled: false, epoch: 0 });
  const m = snapshot.host === host ? snapshot.model : host?.model();
  useLayoutEffect(() => {
    const life = viewLife.current; life.mounted = true; life.enabled = false; setViewEpoch(++life.epoch);
    if (!connection) return () => { life.mounted = false; life.enabled = false; ++life.epoch; };
    const { host, connectivity } = connection;
    const off = host.subscribe(model => {
      life.enabled = model.connected && model.active && model.online; setViewEpoch(++life.epoch); setSnapshot({ host, model });
      if (!model.active || !model.online) setPublicProfile(null);
    });
    const offOwner = connection.config.owner.subscribe(() => { ++life.epoch; life.enabled = false; setViewEpoch(life.epoch); setPublicProfile(null); });
    let mounted = true, appActive = false, blurred = false;
    const syncActivity = () => { if (mounted) host.activity(appActive && !blurred); };
    host.activity(false); host.connectivity(false);
    const change = AppState.addEventListener('change', value => { appActive = value === 'active'; syncActivity(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; syncActivity(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; appActive = AppState.currentState === 'active'; syncActivity(); }) : null;
    appActive = AppState.currentState === 'active'; syncActivity();
    const offConnectivity = observeNativeConnectivity(connectivity, state => { if (mounted) { host.connectivity(state === 'online'); setNetwork(state); } });
    appActive = AppState.currentState === 'active'; syncActivity();
    host.connect();
    void host.refresh();
    return () => { mounted = false; life.mounted = false; life.enabled = false; ++life.epoch; off(); offOwner(); host.disconnect(); offConnectivity(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  useLayoutEffect(() => { setViewEpoch(++viewLife.current.epoch); }, [publicProfile]);
  const act = (work: () => void, allowInactive = false) => { const life = viewLife.current;
    if (life.mounted && life.epoch === viewEpoch && (allowInactive || life.enabled)) work(); };
  const p = m?.participation, read = p?.read, write = m?.threadWrite, archive = m?.archive, safety = m?.messageSafety;
  const archivePage = archive?.page;
  const rootMessage = archivePage?.kind === 'thread' ? archivePage.root : null;
  const savedMessage = write?.receipt?.message;
  const focusedMessage = archivePage?.kind === 'thread' && archivePage.focus.id !== archivePage.root.id && !archivePage.items.some(item => item.id === archivePage.focus.id) ? archivePage.focus : null;
  const navigate = Boolean(write?.canNavigate && safety?.canNavigate);
  const refresh = Boolean(m?.connected && m.active && m.online && navigate && !read?.busy && !write?.busy && !archive?.busy);
  const canLeaveDiscussion = () => { const current = host?.model();
    return Boolean(current?.connected && current.active && current.online && current.threadWrite.canNavigate && current.messageSafety.canNavigate
      && !current.participation.read.busy && !current.participation.write.busy && !current.threadWrite.busy && !current.archive.busy && !current.messageSafety.busy); };
  const openAuthorProfile = (messageId: string, memberId: string) => act(() => {
    if (!connection || !config?.publicProfileTransport || !canLeaveDiscussion()) return;
    const current = host!.model(), page = current.archive.page;
    const candidates = current.messageSafety.open ? [] : current.archive.open
      ? page ? [...page.items, ...(page.kind === 'thread' ? [page.root, page.focus] : [])] : []
      : current.participation.read.conversation?.messages ?? [];
    if (!candidates.some(message => message.id === messageId && message.publicProfileId === memberId
      && (!('visibility' in message) || message.visibility === 'visible'))) return;
    // Retire private drafts and callbacks before replacing their visible surface.
    const origin = current.archive.open ? host!.archiveSelection() : null;
    host!.disconnect(); setPublicProfile({ connection, memberId, origin });
  });
  const leave = () => act(() => { host?.disconnect(); setPublicProfile(null); onClose(); }, true);
  if (publicProfile && publicProfile.connection === connection && publicProfileConfig) return <PublicProfileScreen config={publicProfileConfig}
    connectivity={connectivity} backLabel="Back to discussion" onClose={leave} onBack={() => act(() => {
      setPublicProfile(null);
      if (m?.active && m.online && config?.owner.scope()) { host?.connect(); if (publicProfile.origin) void host?.restoreArchive(publicProfile.origin); else void host?.refresh(); }
    }, true)}/>;
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · CIRCLES</Text>
    <Text accessibilityRole="header" style={styles.title}>{read?.conversation?.title ?? 'A conversation worth having.'}</Text>
    <Text style={styles.copy}>Read, reflect and share with your circle. Only a current member session can open the conversation.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.note}>{network === 'online' ? 'Network available. Check the member session and refresh Circle access.' : network === 'offline' ? 'Offline. Private Circle views and drafts are cleared.' : 'Network availability is unknown. Private Circle access stays closed.'}</Text>
    {memberSession ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Member session</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{memberSession.model.message}</Text>
      <Action label={memberSession.model.busy ? 'Checking member session…' : 'Check member session'} disabled={!memberSession.model.canCheck} onPress={() => act(memberSession.onCheck)}/>
    </View> : null}
    <Action label="Close circle" onPress={leave}/>
    {onBack ? <Action label="Back to Circle" disabled={!navigate || Boolean(read?.busy || p?.write.busy || write?.busy || archive?.busy || safety?.busy)}
      onPress={() => act(() => {
        const current = host?.model();
        if (current?.threadWrite.canNavigate && current.messageSafety.canNavigate && !current.participation.read.busy && !current.participation.write.busy && !current.threadWrite.busy && !current.archive.busy && !current.messageSafety.busy) { host?.disconnect(); onBack(); }
      }, true)}/> : null}
    <View accessibilityLiveRegion="polite" accessibilityRole="summary" style={styles.status}>
      <Text style={styles.copy}>{m?.status ?? 'Member sign-in and the secure Circle connection are not connected in this build.'}</Text>
      {read && !archive?.open && !safety?.open ? <Text style={styles.copy}>{read.message}</Text> : null}
    </View>
    {read?.busy ? <ActivityIndicator accessibilityLabel="Checking current circle access" color="#e8cb8d"/> : null}
    <Action label="Refresh circle access" disabled={!refresh} onPress={() => act(() => void host?.refresh())}/>
    <Action label="Open complete discussion archive" disabled={!refresh} onPress={() => act(() => void host?.openArchive())}/>
    {archive?.open && !safety?.open ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Discussion archive</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{archive.message}</Text>
      {archive.busy ? <ActivityIndicator accessibilityLabel="Loading discussion page" color="#e8cb8d"/> : null}
      {archive.page ? <>
        {archive.page.kind === 'thread' ? <>
          <Text accessibilityRole="header" style={styles.heading}>Thread</Text>
          {rootMessage ? <ArchiveMessage message={rootMessage} disabled={!navigate || archive.busy} replyDisabled={!write?.canStart}
            onOpen={() => act(() => void host?.archiveThread(rootMessage.id))} onReply={() => act(() => host?.threadStart(rootMessage.id))} onActions={() => act(() => void host?.messageOpen(rootMessage.id))} onProfile={config?.publicProfileTransport && rootMessage.publicProfileId ? () => openAuthorProfile(rootMessage.id, rootMessage.publicProfileId!) : undefined}/> : null}
          {focusedMessage ? <ArchiveMessage message={focusedMessage} disabled={!navigate || archive.busy} replyDisabled={!write?.canStart}
            onOpen={() => act(() => void host?.archiveThread(focusedMessage.id))} onReply={() => act(() => host?.threadStart(focusedMessage.id))} onActions={() => act(() => void host?.messageOpen(focusedMessage.id))} onProfile={config?.publicProfileTransport && focusedMessage.publicProfileId ? () => openAuthorProfile(focusedMessage.id, focusedMessage.publicProfileId!) : undefined}/> : null}
        </> : null}
        {archive.page.items.map(message => <ArchiveMessage key={message.id} message={message} disabled={!navigate || archive.busy} replyDisabled={!write?.canStart}
          onOpen={() => act(() => void host?.archiveThread(message.id))} onReply={() => act(() => host?.threadStart(message.id))} onActions={() => act(() => void host?.messageOpen(message.id))} onProfile={config?.publicProfileTransport && message.publicProfileId ? () => openAuthorProfile(message.id, message.publicProfileId!) : undefined}/>)}
        {archive.page.items.length === 0 ? <Text style={styles.copy}>{archive.page.kind === 'thread' ? 'No replies in this page.' : 'No messages in this page.'}</Text> : null}
        {archive.page.nextCursor ? <Action label={archive.page.kind === 'thread' ? 'Next replies' : 'Older messages'} disabled={archive.busy || !navigate} onPress={() => act(() => void host?.archiveNext())}/> : null}
      </> : null}
      <Text style={styles.note}>Reply only to a visible message after reviewing its current server preview. Message actions require a separate current-state check. Reporting does not grant AI consent.</Text>
    </View> : null}
    {!archive?.open && !safety?.open && read?.conversation ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Circle conversation</Text>
      <Text style={styles.note}>Latest 100 messages. A later read cannot prove that an earlier post was never sent.</Text>
      {read.conversation.messages.length === 0 ? <Text style={styles.copy}>No messages in this view yet.</Text> : null}
      {read.conversation.messages.map(message => <View key={message.id} style={styles.message}>
        <Text style={styles.author}>{message.member_name}{message.is_mine ? ' · You' : ''}</Text>
        <Text style={styles.note}>{message.created_at}</Text><Text selectable style={styles.copy}>{message.content}</Text>
        {config?.publicProfileTransport && message.publicProfileId ? <Action label="View author public profile" disabled={!refresh} onPress={() => openAuthorProfile(message.id, message.publicProfileId!)}/> : null}
      </View>)}
    </View> : null}
    {write && !safety?.open ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Your discussion message</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{write.message}</Text>
      {reel && archivePage?.kind === 'archive' && <View style={styles.message}>
        <Text accessibilityRole="header" style={styles.heading}>Question from the Reel</Text>
        <Text style={styles.copy}>{REEL_QUESTIONS[reel]}</Text>
        <Action label="Use Reel question in a draft" disabled={!write.canStart || write.phase !== 'locked' || Boolean(archive?.busy)}
          onPress={() => act(() => {
            if (host && config && host.model().threadWrite.phase === 'locked' && host.threadStart(null)) {
              host.threadEdit(reelDiscussionDraft(reel, config.origin));
            }
          })}/>
      </View>}
      <Action label="Start a new discussion message" disabled={!write.canStart || Boolean(archive?.busy)} onPress={() => act(() => host?.threadStart(null))}/>
      {write.phase === 'editing' || write.phase === 'previewing' ? <>
        <Text style={styles.note}>{write.target ? 'Replying to the selected message. Your reply includes a stable link; its author and words are not copied into your message.' : 'Share your own thoughts with this Circle. Nothing posts until you review and confirm.'}</Text>
        <Text nativeID="circle-message-label" style={styles.copy}>Your discussion comment</Text>
        <TextInput accessibilityLabel="Your discussion comment" accessibilityLabelledBy="circle-message-label"
          accessibilityHint="Plain text. Prepare and review the complete message before choosing Post."
          value={write.draft} onChangeText={value => act(() => host?.threadEdit(value))} editable={write.canEdit}
          multiline maxLength={write.commentLimit} autoCorrect={false} autoComplete="off" textContentType="none"
          style={[styles.input, !write.canEdit && styles.disabled]}/>
        <Text style={styles.note}>{write.draft.length} of {write.commentLimit} comment characters. Full message limit: 2,000.</Text>
        <Action label={write.phase === 'previewing' ? 'Preparing discussion preview…' : 'Prepare discussion preview'} disabled={!write.canReview} onPress={() => act(() => void host?.threadReview())}/>
      </> : null}
      {write.phase === 'review' && write.preview ? <>
        <Text accessibilityRole="header" style={styles.heading}>Review discussion message</Text>
        {write.preview.parent ? <View style={styles.message}>
          <Text style={styles.note}>Current reply parent, checked for this preview:</Text>
          <Text selectable style={styles.copy}>{write.preview.parent.message.content}</Text>
        </View> : null}
        <Text style={styles.note}>This is the complete message that will be posted:</Text>
        <Text selectable style={styles.copy}>{write.preview.content}</Text>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="I reviewed this exact message and target, and want to post it to this Circle"
          accessibilityState={{ checked: write.confirmed, disabled: !write.active || write.busy }} disabled={!write.active || write.busy}
          onPress={() => act(() => host?.threadConfirm(!write.confirmed))} style={[styles.button, (!write.active || write.busy) && styles.disabled]}>
          <Text style={styles.buttonText}>{write.confirmed ? '✓ ' : '□ '}I reviewed this exact message and target, and want to post it to this Circle.</Text>
        </Pressable>
        <Action label="Post reviewed discussion message" disabled={!write.canPost} onPress={() => act(() => void host?.threadPost())}/>
        <Action label="Edit discussion comment" disabled={write.busy} onPress={() => act(() => host?.threadEditReview())}/>
      </> : null}
      {write.phase === 'unknown' ? <>
        <Text style={styles.note}>The message may already have been saved. Keep this screen open to preserve the exact request. Checking a missing receipt does not prove that an earlier attempt will not complete. Nothing is retried automatically.</Text>
        <Action label="Check discussion posting receipt" disabled={!write.canCheck} onPress={() => act(() => void host?.threadLookup())}/>
        <Action label="Retry exact reviewed discussion post" disabled={!write.canRetry} onPress={() => act(() => void host?.threadRetry())}/>
      </> : null}
      {write.phase === 'confirmed' && savedMessage ? <>
        <Text style={styles.copy}>{savedMessage.visibility === 'visible' ? 'The message was saved. Open its current thread to read it and any replies.' : `The saved message is currently ${savedMessage.visibility}. Its earlier body is not displayed.`}</Text>
        <Action label="Open saved discussion message" disabled={!navigate || Boolean(archive?.busy)} onPress={() => act(() => void host?.archiveThread(savedMessage.id))}/>
      </> : null}
      {write.canCancel ? <Action label="Cancel discussion draft" onPress={() => act(() => host?.threadCancel())}/> : null}
    </View> : null}
    {safety?.open && safety.active ? <View>
      <Text accessibilityRole="header" style={styles.heading}>Current message actions</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>{safety.message}</Text>
      {safety.busy ? <ActivityIndicator accessibilityLabel="Checking or sending message action" color="#e8cb8d"/> : null}
      {safety.state ? <>
        <View style={styles.message}>
          <Text style={styles.author}>{safety.state.message.member_name}{safety.state.message.is_mine ? ' · You' : ''}</Text>
          <Text style={styles.note}>{safety.state.message.created_at}</Text>
          <Text selectable style={styles.copy}>{safety.state.message.content ?? (safety.state.message.visibility === 'withdrawn' ? 'Message withdrawn by its author.' : 'Message hidden from member views.')}</Text>
        </View>
        <Text style={styles.note}>{safety.state.message.visibility === 'visible' ? 'Visible to eligible Circle members.' : safety.state.message.visibility === 'withdrawn' ? 'Withdrawn by the author. A reviewer cannot undo this withdrawal.' : 'Hidden from member views after human review.'}</Text>
        {safety.state.explanations.map(explanation => <View key={explanation.id} style={styles.message}>
          <Text style={styles.author}>{explanation.action === 'hide' ? 'Hidden' : 'Moderator restriction lifted'} · {explanationLabel(explanation.reason)}</Text>
          <Text selectable style={styles.copy}>{explanation.summary}</Text><Text style={styles.note}>{explanation.created_at}</Text>
        </View>)}
        {safety.state.canReport ? <>
          <Text style={styles.note}>Reports are private to eligible assigned reviewers. Describe conduct, rather than political or religious disagreement, and avoid unnecessary personal details. A report is an allegation, not a finding. Reporting does not enable AI processing or change consent.</Text>
          <Text accessibilityRole="header" style={styles.heading}>Report reason</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Report reason">
            {MESSAGE_REPORT_OPTIONS.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
              accessibilityState={{ checked: safety.reason === option.value, disabled: !safety.canEditReport }} disabled={!safety.canEditReport}
              onPress={() => act(() => host?.messageReason(option.value))} style={[styles.button, !safety.canEditReport && styles.disabled]}>
              <Text style={styles.buttonText}>{safety.reason === option.value ? '● ' : '○ '}{option.label}</Text>
            </Pressable>)}
          </View>
          <Text nativeID="circle-report-note-label" style={styles.copy}>Private report details (optional)</Text>
          <TextInput accessibilityLabel="Private report details (optional)" accessibilityLabelledBy="circle-report-note-label"
            accessibilityHint="Up to 1,000 characters. Do not include unnecessary personal details."
            value={safety.note} onChangeText={value => act(() => host?.messageNote(value))} editable={safety.canEditReport}
            multiline maxLength={1000} autoCorrect={false} autoComplete="off" textContentType="none"
            style={[styles.input, !safety.canEditReport && styles.disabled]}/>
        </> : null}
        {safety.state.canWithdraw ? <Text style={styles.note}>{MESSAGE_WITHDRAWAL_PRIVACY}</Text> : null}
        {safety.state.canReport || safety.state.canWithdraw ? <Pressable accessibilityRole="checkbox"
          accessibilityLabel={safety.state.canWithdraw ? 'I understand withdrawal removes this message from member views and cannot be undone here' : 'I checked this message and want to send this report for private human review'}
          accessibilityState={{ checked: safety.confirmed, disabled: !safety.canConfirm }} disabled={!safety.canConfirm}
          onPress={() => act(() => host?.messageConfirm(!safety.confirmed))} style={[styles.button, !safety.canConfirm && styles.disabled]}>
          <Text style={styles.buttonText}>{safety.confirmed ? '✓ ' : '□ '}{safety.state.canWithdraw ? 'I understand withdrawal removes this message from member views and cannot be undone here.' : 'I checked this message and want to send this report for private human review.'}</Text>
        </Pressable> : <Text style={styles.note}>No report or withdrawal action is available for this message.</Text>}
        {safety.state.canReport ? <Action label="Send private report" disabled={!safety.canReport} onPress={() => act(() => void host?.messageSubmit('report'))}/> : null}
        {safety.state.canWithdraw ? <Action label="Withdraw my message" disabled={!safety.canWithdraw} onPress={() => act(() => void host?.messageSubmit('withdraw'))}/> : null}
      </> : null}
      <Action label="Check current message state" disabled={!safety.canCheck} onPress={() => act(() => void host?.messageRefresh())}/>
      {safety.pendingRequestId ? <>
        <Text style={styles.note}>The result is unconfirmed. Checking current state does not confirm that this request was received. Retry only the same request manually. Leaving clears its local retry details; a request already sent may still complete.</Text>
        <Action label={safety.pendingAction === 'withdraw' ? 'Retry exact withdrawal' : 'Retry exact report'} disabled={!safety.canRetry} onPress={() => act(() => void host?.messageRetry())}/>
      </> : null}
      <Action label="Close message actions" disabled={!safety.canClose} onPress={() => act(() => host?.messageClose())}/>
    </View> : null}
    <Text style={styles.note}>Drafts stay in memory and clear when the view, account or activity ends. Closing does not erase stored messages or cancel a post already sent.</Text>
  </ScrollView></SafeAreaView>;
}
function ArchiveMessage({ message, onOpen, onReply, onActions, onProfile, disabled, replyDisabled }: { message: ThreadMessage; onOpen(): void; onReply(): void; onActions(): void; onProfile?(): void; disabled: boolean; replyDisabled: boolean }) {
  return <View style={styles.message}>
    <Text style={styles.author}>{message.member_name}{message.is_mine ? ' · You' : ''}</Text>
    {message.created_at ? <Text style={styles.note}>{message.created_at}</Text> : null}
    <Text selectable style={styles.copy}>{message.content ?? (message.visibility === 'withdrawn' ? 'This contribution was withdrawn.' : message.visibility === 'hidden' ? 'This contribution is restricted by moderation.' : 'This contribution is unavailable.')}</Text>
    {message.visibility === 'visible' && message.publicProfileId && onProfile ? <Action label="View author public profile" disabled={disabled} onPress={onProfile}/> : null}
    <Action label="Open thread" disabled={disabled} onPress={onOpen}/>
    {message.visibility === 'visible' && message.content !== null ? <Action label="Reply to this message" disabled={disabled || replyDisabled} onPress={onReply}/> : null}
    <Action label="Check message actions" disabled={disabled} onPress={onActions}/>
  </View>;
}
function explanationLabel(reason: string) {
  if (reason === 'no_violation') return 'No violation found';
  if (reason === 'insufficient_evidence') return 'Insufficient evidence';
  if (reason === 'resolved') return 'Concern resolved';
  return MESSAGE_REPORT_OPTIONS.find(option => option.value === reason)?.label ?? reason;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 16 },
  eyebrow: { color: '#e8cb8d', fontSize: 12, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 34, lineHeight: 40 },
  heading: { color: '#f4f2e5', fontSize: 24, marginTop: 20 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  note: { color: '#b1c1b5', fontSize: 14, lineHeight: 22 }, author: { color: '#e8cb8d', fontSize: 17 },
  status: { paddingVertical: 16, gap: 8 }, message: { borderTopColor: '#647967', borderTopWidth: 1, paddingVertical: 18, gap: 8 },
  input: { color: '#f4f2e5', backgroundColor: '#172923', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 140, textAlignVertical: 'top', fontSize: 17 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48, justifyContent: 'center', marginVertical: 5 },
  buttonText: { color: '#f4f2e5', fontSize: 17 }, disabled: { opacity: 0.5 },
});
