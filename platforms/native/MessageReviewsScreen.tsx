import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createMessageReviews } from '../shared/message-reviews';
import { REVIEW_COVERAGE_PAGE_SIZE } from '../../lib/circles/review-coverage';
import { observeNativeConnectivity, type NativeConnectivityPort } from './src/circles/native-connectivity';

const hideReasons = [['safety', 'Safety'], ['harassment', 'Harassment'], ['spam', 'Spam'], ['misleading', 'Misleading'], ['inappropriate', 'Inappropriate conduct']] as const;
const restoreReasons = [['no_violation', 'No violation found'], ['insufficient_evidence', 'Insufficient evidence'], ['resolved', 'Concern resolved']] as const;

/** A separate assigned-reviewer destination. The server checks assignment and
 * conflicts on every request; a verified member account is not a reviewer role. */
export function MessageReviewsScreen({ config, connectivity, onBack, onClose }: {
  config: Parameters<typeof createMessageReviews>[0]; connectivity?: NativeConnectivityPort; onBack(): void; onClose(): void;
}) {
  const connection = useMemo(() => {
    try { return { session: createMessageReviews({ ...config, initialOnline: false }), connectivity }; }
    catch { return null; }
  }, [config, connectivity]);
  const [snapshot, setSnapshot] = useState(() => ({ connection, model: connection?.session.model() }));
  const [viewEpoch, setViewEpoch] = useState(0);
  const viewLife = useRef({ mounted: false, enabled: false, epoch: 0 });
  const m = snapshot.connection === connection ? snapshot.model : connection?.session.model();
  useLayoutEffect(() => {
    const life = viewLife.current;
    life.mounted = true; life.enabled = false; setViewEpoch(++life.epoch);
    if (!connection) return () => { life.mounted = false; life.enabled = false; ++life.epoch; };
    const { session } = connection;
    const off = session.subscribe(model => { setViewEpoch(++life.epoch); setSnapshot({ connection, model }); });
    let mounted = true, appActive = false, blurred = false, online = false;
    const sync = () => {
      if (!mounted) return;
      const enabled = appActive && !blurred && online;
      if (life.enabled !== enabled) { life.enabled = enabled; setViewEpoch(++life.epoch); }
      session.activity(appActive && !blurred); session.connectivity(online);
    };
    session.activity(false); session.connectivity(false);
    const change = AppState.addEventListener('change', value => { appActive = value === 'active'; sync(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; appActive = AppState.currentState === 'active'; sync(); }) : null;
    appActive = AppState.currentState === 'active'; sync();
    const offConnectivity = observeNativeConnectivity(connection.connectivity, state => { online = state === 'online'; sync(); });
    appActive = AppState.currentState === 'active'; sync(); session.connect();
    return () => { mounted = false; life.mounted = false; life.enabled = false; ++life.epoch; off(); session.disconnect(); offConnectivity(); change.remove(); blur?.remove(); focus?.remove(); };
  }, [connection]);
  const session = connection?.session, detail = m?.detail, coverage = m?.coverage, reportPage = coverage?.page;
  const totalPages = reportPage ? Math.max(1, Math.ceil(reportPage.totalReports / REVIEW_COVERAGE_PAGE_SIZE)) : 0;
  const frontier = reportPage ? Math.min(totalPages, Math.floor(reportPage.reviewedReports / REVIEW_COVERAGE_PAGE_SIZE) + 1) : 0;
  const act = (work: () => void, allowed = true, allowInactive = false) => {
    const life = viewLife.current;
    if (allowed && life.mounted && life.epoch === viewEpoch && (allowInactive || life.enabled)) work();
  };
  const close = () => act(() => { session?.disconnect(); onClose(); }, true, true);
  const back = () => act(() => { session?.disconnect(); onBack(); }, Boolean(m?.canNavigate));
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · ASSIGNED HUMAN REVIEW</Text>
    <Text accessibilityRole="header" style={styles.title}>Review Circle messages</Text>
    <Text style={styles.copy}>Read current evidence and explain decisions about conduct. Political or religious disagreement alone does not justify a restriction.</Text>
    <Text style={styles.note}>Only eligible assigned reviewers can load cases. The review service checks your assignment and conflicts with the author, Circle host, participants and reporters.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{m?.message ?? 'Assigned reviews are unavailable in this connection. Return to your member account and check again.'}</Text>
    <Action label="Load assigned message reviews" disabled={!m?.canLoadQueue} onPress={() => act(() => { if (m) void session?.loadQueue(m.action); }, Boolean(m?.canLoadQueue))}/>
    {m?.pendingDecision ? <Action label="Retry exact decision" disabled={!m.canRetry} onPress={() => act(() => void session?.retryDecision(m.action), m.canRetry)}/> : null}
    {m?.queue ? <View style={styles.stack}>
      {m.queue.items.length === 0 ? <Text style={styles.copy}>No assigned cases were returned on this page.</Text> : null}
      {m.queue.items.map(item => <View key={`${item.circleId}:${item.messageId}`} style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>{item.circleTitle}</Text>
        <Text style={styles.copy}>{item.visibility === 'visible' ? 'Visible' : item.visibility === 'hidden' ? 'Hidden' : 'Author withdrawn'} · {item.openReports} open reports</Text>
        <Action label={`Review message in ${item.circleTitle}`} disabled={!m.canSelect} onPress={() => act(() => void session?.openCase(item.circleId, item.messageId, m.action), m.canSelect)}/>
      </View>)}
      {m.queue.nextCursor ? <Action label="Next page of assigned reviews" disabled={!m.canNextQueue} onPress={() => act(() => void session?.nextQueue(m.action), m.canNextQueue)}/> : null}
    </View> : null}
    {m && detail ? <View style={styles.stack}>
      <Text accessibilityRole="header" style={styles.heading}>{detail.circle.title}</Text>
      <Text style={styles.copy}>{detail.message.visibility === 'withdrawn' ? 'The author withdrew this message. Lifting a moderator restriction cannot return it to member views.' : detail.message.visibility === 'hidden' ? 'This message is hidden from member views.' : 'This message is visible to eligible members.'}</Text>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Restricted message evidence</Text>
        <Text style={styles.note}>{detail.message.member_name} · {detail.message.created_at}</Text>
        <Text selectable style={styles.copy}>{detail.message.content}</Text>
        <Action label="Use message text as evidence" disabled={!m.canEditDraft} onPress={() => act(() => session?.setEvidence('message', m.action), m.canEditDraft)}/>
      </View>
      {detail.decisions.map(decision => <View key={decision.id} style={styles.card}>
        <Text style={styles.note}>{decision.action === 'hide' ? 'Hidden' : 'Moderator restriction lifted'} · {decision.created_at}</Text>
        <Text style={styles.copy}>{decision.summary}</Text>
      </View>)}
      {detail.complete ? <View style={styles.stack}>
        <Text accessibilityRole="header" style={styles.heading}>Current reports</Text>
        {detail.reports.length === 0 ? <Text style={styles.copy}>No open reports in this current case.</Text> : null}
        {detail.reports.map((report, index) => <View key={report.id} style={styles.card}>
          <Text style={styles.note}>Report {index + 1} · {report.reason} · {report.created_at}</Text>
          <Text selectable style={styles.copy}>{report.note ?? 'No reporter note.'}</Text>
          <Action label={`Use report ${index + 1} as evidence`} disabled={!m.canEditDraft || !report.note} onPress={() => act(() => session?.setEvidence(report.id, m.action), m.canEditDraft && Boolean(report.note))}/>
        </View>)}
      </View> : coverage ? <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Full report review</Text>
        <Text style={styles.copy}>Read and acknowledge every report page before deciding. Earlier pages remain available to revisit and select evidence.</Text>
        <Text accessibilityLiveRegion="polite" style={styles.copy}>{coverage.message}</Text>
        <Action label="Start full case review" disabled={!coverage.canStart} onPress={() => act(() => void session?.startCoverage(m.action), coverage.canStart)}/>
        <Action label="Refresh review progress" disabled={!coverage.canRefresh} onPress={() => act(() => void session?.refreshCoverage(m.action), coverage.canRefresh)}/>
        {reportPage ? <>
          <Text accessibilityRole="header" style={styles.heading}>Report page {reportPage.pageNumber} of {totalPages}</Text>
          <Text style={styles.copy}>Reviewed {reportPage.reviewedReports} of {reportPage.totalReports} reports.</Text>
          {reportPage.reports.map((report, index) => <View key={report.id} style={styles.explanation}>
            <Text style={styles.note}>Report {(reportPage.pageNumber - 1) * REVIEW_COVERAGE_PAGE_SIZE + index + 1} · {report.reason} · {report.created_at}</Text>
            <Text selectable style={styles.copy}>{report.note ?? 'No reporter note.'}</Text>
            <Action label={`Use report ${(reportPage.pageNumber - 1) * REVIEW_COVERAGE_PAGE_SIZE + index + 1} as evidence`} disabled={!m.canEditDraft || !report.note}
              onPress={() => act(() => session?.setEvidence(report.id, m.action), m.canEditDraft && Boolean(report.note))}/>
          </View>)}
          <Check label="I have read every report on this page" checked={coverage.confirmed} disabled={!coverage.canConfirm}
            onPress={() => act(() => session?.confirmCoverage(!coverage.confirmed, m.action), coverage.canConfirm)}/>
          <Action label="Acknowledge this report page" disabled={!coverage.canAcknowledge} onPress={() => act(() => void session?.ackCoverage(m.action), coverage.canAcknowledge)}/>
          <Action label="Previous report page" disabled={!coverage.canPrevious} onPress={() => act(() => void session?.openCoveragePage(reportPage.pageNumber - 1, m.action), coverage.canPrevious)}/>
          <Action label="Next report page" disabled={!coverage.canNext} onPress={() => act(() => void session?.openCoveragePage(reportPage.pageNumber + 1, m.action), coverage.canNext)}/>
          <Action label="Return to latest report page" disabled={!coverage.canFrontier} onPress={() => act(() => void session?.openCoveragePage(frontier, m.action), coverage.canFrontier)}/>
        </> : null}
      </View> : null}
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Optional AI observations</Text>
        <Text style={styles.copy}>Available only when the author opted in for this message and AI assistance is enabled. Anthropic receives the message text, which may itself contain names or personal details. Reporter notes, account details and the rest of the conversation are excluded.</Text>
        <Text style={styles.note}>AI observations are advisory. They do not decide whether a message is hidden or restored. Human review remains available when AI is unavailable.</Text>
        <Action label="Request AI observations" disabled={!m.canRequestAdvice} onPress={() => act(() => void session?.requestAdvice(m.action), m.canRequestAdvice)}/>
        <Text accessibilityLiveRegion="polite" style={styles.copy}>{m.adviceMessage}</Text>
        {m.advice ? <>
          {m.advice.observations.map((item, index) => <View key={`observation-${index}`} style={styles.explanation}><Text style={styles.note}>{item.rule}</Text><Text selectable style={styles.copy}>{item.excerpt}</Text><Text style={styles.copy}>{item.note}</Text></View>)}
          {m.advice.counterevidence.map((item, index) => <View key={`counterevidence-${index}`} style={styles.explanation}><Text style={styles.note}>Counterevidence</Text><Text selectable style={styles.copy}>{item.excerpt}</Text><Text style={styles.copy}>{item.note}</Text></View>)}
          {m.advice.questions.map((question, index) => <Text key={`question-${index}`} style={styles.copy}>{question}</Text>)}
        </> : null}
      </View>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Your human decision</Text>
        <Choice label="Hide message" selected={m.draft.action === 'hide'} disabled={!m.canEditDraft} onPress={() => act(() => session?.setAction('hide', m.action), m.canEditDraft)}/>
        <Choice label="Lift moderator restriction" selected={m.draft.action === 'restore'} disabled={!m.canEditDraft} onPress={() => act(() => session?.setAction('restore', m.action), m.canEditDraft)}/>
        {(m.draft.action === 'hide' ? hideReasons : m.draft.action === 'restore' ? restoreReasons : []).map(([value, label]) => <Choice key={value} label={label} selected={m.draft.reason === value} disabled={!m.canEditDraft} onPress={() => act(() => session?.setReason(value, m.action), m.canEditDraft)}/>)}
        <Text style={styles.copy}>Explanation shown to the author (20–1,000 characters). Describe conduct and evidence without exposing private reporter information.</Text>
        <TextInput accessibilityLabel="Explanation shown to the author" value={m.draft.summary} multiline maxLength={1000} editable={m.canEditDraft}
          onChangeText={(value: string) => act(() => session?.setSummary(value, m.action), m.canEditDraft)} style={styles.input}/>
        {m.draft.action === 'hide' ? <>
          <Text style={styles.copy}>Evidence source: {m.draft.source === 'message' ? 'message text' : 'selected reporter note'}.</Text>
          {m.evidence ? <Text selectable style={styles.copy}>{m.evidence.note}</Text> : null}
          <Text style={styles.copy}>Copy an exact excerpt of 5–500 characters from your selected evidence source.</Text>
          <TextInput accessibilityLabel="Exact evidence excerpt" value={m.draft.excerpt} multiline maxLength={500} editable={m.canEditDraft}
            onChangeText={(value: string) => act(() => session?.setExcerpt(value, m.action), m.canEditDraft)} style={styles.input}/>
        </> : null}
        <Check label="I reviewed the current evidence and confirm this human decision" checked={m.draft.confirmed} disabled={!m.canConfirm}
          onPress={() => act(() => session?.confirmDecision(!m.draft.confirmed, m.action), m.canConfirm)}/>
        <Action label="Submit human decision" disabled={!m.canSubmit} onPress={() => act(() => void session?.submitDecision(m.action), m.canSubmit)}/>
      </View>
    </View> : null}
    {m?.selected ? <View style={styles.stack}>
      <Action label="Refresh current review case" disabled={!m.canRefreshCase} onPress={() => act(() => void session?.refreshCase(m.action), m.canRefreshCase)}/>
      <Action label="Back to assigned reviews" disabled={!m.canBack} onPress={() => act(() => session?.back(m.action), m.canBack)}/>
    </View> : null}
    <Text style={styles.note}>Closing or leaving clears this private review view. A request already sent may still finish. Check current state after returning; nothing retries automatically.</Text>
    <Action label="Return to member account" disabled={!m?.canNavigate} onPress={back}/>
    <Action label="Close member view" onPress={close}/>
  </ScrollView></SafeAreaView>;
}
function Action({ label, disabled = false, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{label}</Text></Pressable>;
}
function Check({ label, checked, disabled, onPress }: { label: string; checked: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} disabled={disabled} accessibilityState={{ checked, disabled }} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{checked ? '☑ ' : '☐ '}{label}</Text></Pressable>;
}
function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} disabled={disabled} accessibilityState={{ checked: selected, disabled }} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.copy}>{selected ? '● ' : '○ '}{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 32, lineHeight: 40 },
  heading: { color: '#f4f2e5', fontSize: 23, lineHeight: 30 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  note: { color: '#c0cbbf', fontSize: 15, lineHeight: 23 }, stack: { gap: 20 }, card: { padding: 16, gap: 16, borderWidth: 1, borderColor: '#536d61', borderRadius: 8 },
  explanation: { gap: 8 }, input: { color: '#f4f2e5', backgroundColor: '#172a23', borderColor: '#b1c1b5', borderWidth: 1, borderRadius: 8, minHeight: 100, padding: 14, fontSize: 17, textAlignVertical: 'top' },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 }, disabled: { opacity: 0.5 } });
