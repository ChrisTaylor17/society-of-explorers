import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { philemonEdition, PHILEMON_AGENDA, PHILEMON_COMPARISON, PHILEMON_FURTHER_READING,
  PHILEMON_GREETING, PHILEMON_PERSPECTIVES, PHILEMON_SALON_QUESTIONS, PHILEMON_VIDEO_ROOM } from '../../lib/root-kernel/philemon-study';

const sections = [
  { id: 'letter', label: 'Read the letter' },
  { id: 'compare', label: 'Compare readings' },
  { id: 'host', label: 'Host guide' },
] as const;
const noteVerses = new Set(philemonEdition.footnotes.map(note => note.verse));

export function PhilemonStudyScreen({ onBack, onHost, onBrowse, onClose, backLabel = 'Back to account' }: {
  onBack(): void; onHost?: () => void; onBrowse?: () => void; onClose?: () => void; backLabel?: string;
}) {
  const [section, setSection] = useState<(typeof sections)[number]['id']>('letter');

  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>ROOT KERNEL · SCRIPTURE STUDY</Text>
      <Text accessibilityRole="header" style={styles.title}>{philemonEdition.title}</Text>
      <View style={styles.tabs}>
        {sections.map(({ id, label }) => (
          <Pressable key={id} accessibilityRole="button" accessibilityLabel={label}
            accessibilityState={{ selected: section === id }} onPress={() => setSection(id)}
            style={[styles.button, styles.tab, section === id && styles.selected]}>
            <Text style={styles.buttonText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
    <ScrollView key={section} style={styles.scroller} contentContainerStyle={styles.content}>
      {section === 'letter' ? <>
        <Text accessibilityRole="header" style={styles.heading}>Scripture · Philemon 1</Text>
        <Text style={styles.note}>{philemonEdition.edition} · Complete letter</Text>
        {philemonEdition.paragraphs.map(paragraph => (
          <View key={paragraph[0].verse} style={styles.paragraph}>
            {paragraph.map(({ verse, text }) => (
              <Text key={verse} selectable style={styles.copy}>
                <Text style={styles.verseNumber}>{verse}{noteVerses.has(verse) ? '*' : ''}{' '}</Text>{text}
              </Text>
            ))}
          </View>
        ))}
        <Text accessibilityRole="header" style={styles.heading}>Publisher footnotes</Text>
        {philemonEdition.footnotes.map(({ verse, text }) => (
          <Text key={verse} selectable style={styles.copy}>Verse {verse} · {text}</Text>
        ))}
        <Text accessibilityRole="header" style={styles.heading}>Edition and rights</Text>
        <Text style={styles.note}>The publisher dedicates this edition to the public domain.</Text>
        <Source label="Publisher’s edition" href={philemonEdition.publisherUrl}/>
        <Source label="Publisher reuse terms" href={philemonEdition.rightsUrl}/>
      </> : section === 'compare' ? <>
        <Text style={styles.eyebrow}>STUDY NOTES · PHILEMON 1:3</Text>
        <Text accessibilityRole="header" style={styles.heading}>Two readings of the greeting</Text>
        <Text style={styles.copy}>{PHILEMON_GREETING}</Text>
        {PHILEMON_PERSPECTIVES.map(({ id, title, detail, source }) => (
          <View key={id} style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
            <Text style={styles.copy}>{detail}</Text>
            <Source label={source.label} href={source.href}/>
          </View>
        ))}
        <Text style={styles.copy}>{PHILEMON_COMPARISON}</Text>
        {PHILEMON_FURTHER_READING.map(({ label, href }) => <Source key={href} label={label} href={href}/>)}
        <Text accessibilityRole="header" style={styles.heading}>Questions for your salon</Text>
        {PHILEMON_SALON_QUESTIONS.map(({ before, verse, after }) => (
          <Text key={verse} style={styles.copy}>{before}verse {verse}{after}</Text>
        ))}
      </> : <>
        <Text accessibilityRole="header" style={styles.heading}>Host a Philemon salon online</Text>
        <Text style={styles.copy}>Try one 45-minute conversation with four to six readers. Ask everyone to read the letter and bring a question.</Text>
        <Text style={styles.copy}>{PHILEMON_VIDEO_ROOM}</Text>
        {PHILEMON_AGENDA.map(({ title, minutes, detail }) => (
          <View key={title} style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>{title} · {minutes} min</Text>
            <Text style={styles.copy}>{detail}</Text>
          </View>
        ))}
        <Text style={styles.copy}>To list your salon, choose a time and verify the complete letter as its first reading.</Text>
        {onHost ? <Pressable accessibilityRole="button" accessibilityLabel="Prepare a weekly online Circle" onPress={onHost} style={styles.button}>
          <Text style={styles.buttonText}>Prepare a weekly online Circle</Text>
        </Pressable> : <Text style={styles.note}>Circle hosting is unavailable in this connection.</Text>}
      </>}
      {onBrowse ? <Pressable accessibilityRole="button" accessibilityLabel="Find an online reading Circle" onPress={onBrowse} style={styles.button}>
        <Text style={styles.buttonText}>Find an online reading Circle</Text>
      </Pressable> : null}
    </ScrollView>
    <View style={styles.footer}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={styles.button}>
        <Text style={styles.buttonText}>{backLabel}</Text>
      </Pressable>
      {onClose ? <Pressable accessibilityRole="button" onPress={onClose} style={styles.button}>
        <Text style={styles.buttonText}>Close member view</Text>
      </Pressable> : null}
    </View>
  </SafeAreaView>;
}

function Source({ label, href }: { label: string; href: string }) {
  return <View style={styles.source}>
    <Text style={styles.note}>{label}</Text>
    <Text selectable style={styles.address}>{href}</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101d1a' },
  header: { padding: 16, gap: 10, borderBottomWidth: 1, borderColor: '#395346' },
  eyebrow: { color: '#e8cb8d', fontSize: 12, letterSpacing: 1.1 },
  title: { color: '#f4f2e5', fontSize: 25, lineHeight: 32 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scroller: { flex: 1 },
  content: { padding: 16, gap: 14 },
  heading: { color: '#f4f2e5', fontSize: 20, lineHeight: 26 },
  copy: { color: '#e9eadf', fontSize: 17, lineHeight: 27 },
  note: { color: '#c0cbbf', fontSize: 15, lineHeight: 22 },
  address: { color: '#e8cb8d', fontSize: 14, lineHeight: 21 },
  verseNumber: { color: '#e8cb8d', fontSize: 14, fontWeight: 'bold' },
  paragraph: { gap: 5, marginBottom: 6 },
  card: { backgroundColor: '#172b24', borderWidth: 1, borderColor: '#395346', borderRadius: 8, padding: 14, gap: 8 },
  source: { gap: 3, paddingVertical: 4 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 10, minHeight: 48, justifyContent: 'center' },
  tab: { flexGrow: 1 },
  selected: { borderColor: '#e8cb8d', backgroundColor: '#395346' },
  buttonText: { color: '#f4f2e5', fontSize: 15, lineHeight: 21 },
  footer: { padding: 12, borderTopWidth: 1, borderColor: '#395346' },
});
