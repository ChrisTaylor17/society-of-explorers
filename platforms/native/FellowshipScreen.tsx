import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FELLOWSHIP_COVENANT } from '../../lib/fellowship/covenant';
import { FELLOWSHIP_TOPICS, getFellowshipTopic, type FellowshipTopicId } from '../../lib/fellowship/topics';
import { FELLOWSHIP_MEETING_PLAN } from '../../lib/fellowship/salon';
import { ANALYSIS_STATUS, STUDY_CLAIMS, STUDY_CONTEXTS, STUDY_SOURCES, SCRIPTURE_PASSAGES, SCRIPTURE_EDITION,
  correctionProposal, getPassage, referenceTitle, type ReviewableAnalysis } from '../../lib/fellowship/study';
import { ANCIENT_TEXT_PAPER, ANCIENT_TEXT_SOURCES, WHISTON_PASSAGE, TEXT_WITNESSES, HISTORICAL_POSITIONS, DOSSIER_ANALYSES } from '../../lib/fellowship/ancient-text';
import type { ScriptureStudyId } from '../../lib/root-kernel/scripture-studies';

const SECTIONS = [
  { id: 'people', label: 'People & events' }, { id: 'scripture', label: 'Scripture' },
  { id: 'josephus', label: 'Josephus' }, { id: 'covenant', label: 'Our covenant' },
] as const;
const NOTHING = () => {};

/** Public readings work offline. Navigation and correction actions retire on
 * background/Android blur; this screen has no account or network authority. */
function useForegroundAction(retire: () => void = NOTHING) {
  const life = useRef({ mounted: false, active: false, epoch: 0, editEpoch: 0 });
  const [epoch, setEpoch] = useState(0);
  const [editEpoch, setEditEpoch] = useState(0);
  useLayoutEffect(() => {
    const state = life.current; state.mounted = true;
    let blurred = false;
    const sync = () => {
      state.active = AppState.currentState === 'active' && !blurred;
      if (!state.active) retire();
      setEditEpoch(++state.editEpoch);
      setEpoch(++state.epoch);
    };
    const change = AppState.addEventListener('change', sync);
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; sync(); }) : null;
    sync();
    return () => { state.mounted = false; state.active = false; ++state.epoch; ++state.editEpoch; change.remove(); blur?.remove(); focus?.remove(); };
  }, [retire]);
  return (work: () => void, kind: 'action' | 'text-change' = 'action') => {
    const state = life.current;
    if (state.mounted && state.active && (kind === 'text-change' ? state.editEpoch === editEpoch : state.epoch === epoch)) {
      // Native text events may arrive together before a render. Keep that edit
      // stream valid, while every edit still retires older button callbacks.
      if (kind === 'action') setEditEpoch(++state.editEpoch);
      setEpoch(++state.epoch);
      work();
    }
  };
}

export function FellowshipScreen({ onBack, onBrowse, onHost, onReadStudy, initialTopic = 'psalm-22' }: {
  onBack(): void; onBrowse(topic: FellowshipTopicId): void; onHost?(topic: FellowshipTopicId): void;
  onReadStudy?(study: ScriptureStudyId): void; initialTopic?: FellowshipTopicId;
}) {
  const [section, setSection] = useState<(typeof SECTIONS)[number]['id']>('people');
  const [topicId, setTopicId] = useState<FellowshipTopicId>(() => getFellowshipTopic(initialTopic)?.id ?? 'psalm-22');
  const [expandedPassage, setExpandedPassage] = useState<string | null>(null);
  const act = useForegroundAction();
  const topic = getFellowshipTopic(topicId)!;
  const theme = topicId === 'isaiah-53' ? 'isaiah' : 'psalm';
  const context = STUDY_CONTEXTS[theme];
  const choose = (id: FellowshipTopicId) => act(() => { setTopicId(id); setExpandedPassage(null); });
  const read = () => act(() => setSection(topicId === 'josephus' ? 'josephus' : 'scripture'));
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS · FELLOWSHIP</Text>
      <Text accessibilityRole="header" style={styles.title}>Christian fellowship</Text>
      <Text style={styles.copy}>Read deeply. Seek truth. Meet again.</Text>
      <Action label="Back to SoE" onPress={() => act(onBack)}/>
      <View style={styles.tabs}>{SECTIONS.map(tab => <Action key={tab.id} label={tab.label}
        selected={section === tab.id} onPress={() => act(() => setSection(tab.id))}/>)}</View>
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.copy}>A place to follow Jesus Christ through Scripture, prayer, friendship and honest inquiry. People who disagree are welcome. Prayer and personal sharing are optional.</Text>
      {section === 'people' || section === 'scripture' ? <>
        <Text accessibilityRole="header" style={styles.heading}>Bring a question to the table</Text>
        {FELLOWSHIP_TOPICS.map(item => <View key={item.id} style={styles.card}>
          <Action label={item.title} selected={topicId === item.id} onPress={() => choose(item.id)}/>
          <Text style={styles.copy}>{item.question}</Text>
        </View>)}
      </> : null}
      {section === 'people' ? <>
        <Text accessibilityRole="header" style={styles.heading}>{topic.title}</Text>
        <Text style={styles.copy}>{topic.brief}</Text>
        <Action label="Read and compare this topic" onPress={read}/>
        <Action label="Find a salon for this conversation" onPress={() => act(() => onBrowse(topicId))}/>
        {onHost ? <Action label="Prepare a fellowship salon" onPress={() => act(() => onHost(topicId))}/> : null}
        <Text style={styles.note}>Browse current online salons, review the host and schedule, then choose whether to join. Your question travels with you; you decide whether to share it.</Text>
        <Text accessibilityRole="header" style={styles.heading}>A small table, a reason to return</Text>
        <Text style={styles.copy}>Try four weekly meetings with six to eight adults. Keep a familiar host, a backup host, one shared reading and enough time to hear each person.</Text>
        {FELLOWSHIP_MEETING_PLAN.map(step => <View key={step.title} style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>{step.title} · {step.minutes} min</Text><Text style={styles.copy}>{step.detail}</Text>
        </View>)}
        <Text accessibilityRole="header" style={styles.heading}>Gather in a shared VR study room</Text>
        <Text style={styles.copy}>A host can arrange a Quest gathering around the same question and sources. Keep a phone or browser way to participate, agree on voice and recording, and check the room arrangements with your host.</Text>
        <Text style={styles.note}>The immersive room is a preview awaiting headset testing. A headset is optional for joining a salon.</Text>
      </> : null}
      {section === 'scripture' ? topicId === 'josephus' ? <Action label="Open the Josephus dossier" onPress={read}/> : <>
        <Text accessibilityRole="header" style={styles.heading}>{context.title}</Text>
        <Text style={styles.copy}>{context.context}</Text>
        <Section title="Nicene Christian reading" text={context.nicene}/>
        <Section title="Root Kernel · Biblical Unitarian reading" text={context.rootKernel}/>
        <Section title="Jewish and historical readings" text={context.jewish}/>
        <Text style={styles.note}>{ANALYSIS_STATUS}</Text>
        {STUDY_CLAIMS.filter(claim => claim.theme === theme).map(claim => <View key={claim.id} style={styles.card}>
          <Text style={styles.eyebrow}>{claim.relationship.toUpperCase()}</Text>
          <Text accessibilityRole="header" style={styles.heading}>{claim.title}</Text>
          {claim.references.map(reference => <View key={reference.passageId} style={styles.source}>
            <Text accessibilityRole="header" style={styles.heading}>{referenceTitle(reference)}</Text>
            {getPassage(reference.passageId)?.verses.filter(v => v.verse >= reference.first && v.verse <= reference.last).map(v =>
              <Text key={v.verse} selectable style={styles.copy}>{v.verse} {v.text}</Text>)}
          </View>)}
          <Section title="What the text shows" text={claim.observation}/>
          <Section title="Christian interpretation" text={claim.christian}/>
          <Section title="Another reading" text={claim.other}/>
          <Section title="What remains open" text={claim.limit}/>
          <Text style={styles.question}>{claim.question}</Text>
          {claim.sources.map(id => <Source key={id} title={STUDY_SOURCES[id].title} href={STUDY_SOURCES[id].href}/>)}
          <FellowshipCorrection claim={claim}/>
        </View>)}
        <Text accessibilityRole="header" style={styles.heading}>Read the surrounding passages</Text>
        <Text style={styles.note}>{SCRIPTURE_EDITION.name} · {SCRIPTURE_EDITION.notice}</Text>
        {SCRIPTURE_PASSAGES.map(passage => <View key={passage.id} style={styles.card}>
          <Action label={'Read ' + passage.title + ' · ' + passage.extent} selected={expandedPassage === passage.id}
            onPress={() => act(() => setExpandedPassage(expandedPassage === passage.id ? null : passage.id))}/>
          {expandedPassage === passage.id ? <>
            {'superscription' in passage && passage.superscription ? <Text selectable style={styles.copy}>{passage.superscription}</Text> : null}
            {passage.verses.map(verse => <Text key={verse.verse} selectable style={styles.copy}>{verse.verse} {verse.text}</Text>)}
            <Text accessibilityRole="header" style={styles.heading}>Publisher notes</Text>
            {passage.footnotes.map((note, n) => <Text key={n} selectable style={styles.note}>{note.verse} · {note.text}</Text>)}
            <Source title="Publisher’s passage" href={passage.publisherUrl}/>
          </> : null}
        </View>)}
        <Source title="Translation and reuse terms" href={SCRIPTURE_EDITION.rightsUrl}/>
        {onReadStudy ? <><Action label="Root Kernel · read Philemon" onPress={() => act(() => onReadStudy('philemon'))}/>
          <Action label="Root Kernel · read the Good Samaritan" onPress={() => act(() => onReadStudy('luke-good-samaritan'))}/></> : null}
        <Action label="Find a salon for this conversation" onPress={() => act(() => onBrowse(topicId))}/>
      </> : null}
      {section === 'josephus' ? <>
        <Text accessibilityRole="header" style={styles.heading}>Josephus: what can this passage establish?</Text>
        <Text style={styles.copy}>{ANCIENT_TEXT_PAPER.locus}</Text>
        <Text style={styles.note}>The original headline is still unidentified. This is a verified, relevant preprint: {ANCIENT_TEXT_PAPER.author}, {ANCIENT_TEXT_PAPER.title}, {ANCIENT_TEXT_PAPER.date}, {ANCIENT_TEXT_PAPER.version}. Journal peer review is not established here.</Text>
        <Text style={styles.copy}>{ANCIENT_TEXT_PAPER.summary}</Text>
        <Text accessibilityRole="header" style={styles.heading}>The received passage · William Whiston, 1737</Text>
        <Text selectable style={styles.copy}>{WHISTON_PASSAGE}</Text>
        <Text style={styles.note}>Historical translation, public domain in the USA. Disputed wording is retained. This is the transmitted paragraph, not a reconstructed original or independent proof of resurrection.</Text>
        {TEXT_WITNESSES.map(witness => <View key={witness.work} style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>{witness.work}</Text>
          <Text style={styles.copy}>Work: {witness.composition}{'\n'}Surviving copy: {witness.copy}{'\n'}{witness.distinction}</Text>
        </View>)}
        {HISTORICAL_POSITIONS.map(position => <Section key={position.title} title={position.title} text={position.detail}/>)}
        <Text style={styles.note}>{ANALYSIS_STATUS}. Text, historical inference and Christian belief remain distinct.</Text>
        {DOSSIER_ANALYSES.map(claim => <View key={claim.id} style={styles.card}>
          <Text style={styles.copy}>{claim.observation}</Text>
          <FellowshipCorrection claim={{ ...claim, sourceLinks: ANCIENT_TEXT_SOURCES }}/>
        </View>)}
        {ANCIENT_TEXT_SOURCES.map(source => <View key={source.id} style={styles.source}>
          <Source title={source.title} href={source.href}/><Text style={styles.note}>{source.note}</Text>
        </View>)}
        <Action label="Discuss Josephus in a salon" onPress={() => act(() => onBrowse('josephus'))}/>
      </> : null}
      {section === 'covenant' ? <>{FELLOWSHIP_COVENANT.map(item => <Section key={item.title} title={item.title} text={item.text}/>)}
        <Text style={styles.note}>This fellowship is part of the wider Society of Explorers. It adds a Christian table while preserving the Society’s wider invitation.</Text>
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

function FellowshipCorrection({ claim }: { claim: ReviewableAnalysis }) {
  const [text, setText] = useState(''), [reason, setReason] = useState('');
  const [proposal, setProposal] = useState<ReturnType<typeof correctionProposal>>(null);
  const clear = useCallback(() => { setText(''); setReason(''); setProposal(null); }, []);
  const act = useForegroundAction(clear);
  const possible = correctionProposal(claim, text, reason);
  return <View style={styles.source}>
    <Text accessibilityRole="header" style={styles.heading}>Propose a correction</Text>
    <Text style={styles.note}>Your proposal stays in this view. Copy the preview if you want to keep it. It is cleared when you leave or background the app; nothing is submitted.</Text>
    <TextInput accessibilityLabel={'Proposed analysis · ' + claim.id} value={text} maxLength={6000} multiline
      autoComplete="off" autoCorrect={false} textContentType="none" style={styles.input}
      onChangeText={value => act(() => { setText(value); setProposal(null); }, 'text-change')}/>
    <TextInput accessibilityLabel={'Reason and source to check · ' + claim.id} value={reason} maxLength={3000} multiline
      autoComplete="off" autoCorrect={false} textContentType="none" style={styles.input}
      onChangeText={value => act(() => { setReason(value); setProposal(null); }, 'text-change')}/>
    <Action label={'Preview correction · ' + claim.id} disabled={!possible} onPress={() => act(() => setProposal(correctionProposal(claim, text, reason)))}/>
    {proposal ? <Text selectable accessibilityLabel={'Correction preview · ' + claim.id} style={styles.copy}>{JSON.stringify(proposal, null, 2)}</Text> : null}
    <Action label={'Clear correction · ' + claim.id} onPress={() => act(clear)}/>
  </View>;
}
function Section({ title, text }: { title: string; text: string }) {
  return <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>{title}</Text><Text style={styles.copy}>{text}</Text></View>;
}
function Source({ title, href }: { title: string; href: string }) {
  return <View style={styles.source}><Text style={styles.note}>{title}</Text><Text selectable style={styles.address}>{href}</Text></View>;
}
function Action({ label, onPress, disabled = false, selected = false }: { label: string; onPress(): void; disabled?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled}
    onPress={onPress} style={[styles.button, selected && styles.selected, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#091311' }, header: { padding: 20, gap: 10 }, content: { padding: 20, paddingBottom: 48, gap: 16 },
  eyebrow: { color: '#c8ac68', fontSize: 12, letterSpacing: 1.1 }, title: { color: '#f3f2e9', fontSize: 30, fontWeight: '700' },
  heading: { color: '#e9e6d6', fontSize: 18, fontWeight: '600' }, copy: { color: '#e4e9e4', fontSize: 16, lineHeight: 25 },
  note: { color: '#acbdb4', fontSize: 14, lineHeight: 22 }, address: { color: '#d5bf83', fontSize: 13, lineHeight: 21 },
  question: { color: '#edcf8c', fontSize: 18, lineHeight: 27 }, card: { backgroundColor: '#13231f', padding: 16, borderRadius: 12, gap: 12 },
  source: { gap: 10, paddingVertical: 10 }, tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderWidth: 1, borderColor: '#476258', borderRadius: 10, padding: 14 }, buttonText: { color: '#f1e6c7', fontSize: 16, lineHeight: 23 },
  selected: { backgroundColor: '#29463a', borderColor: '#c8ac68' }, disabled: { opacity: 0.45 },
  input: { color: '#f3f2e9', borderWidth: 1, borderColor: '#658074', borderRadius: 8, padding: 12, minHeight: 90, textAlignVertical: 'top', fontSize: 16 },
});
