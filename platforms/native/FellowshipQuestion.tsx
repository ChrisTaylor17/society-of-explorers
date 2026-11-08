import { StyleSheet, Text, View } from 'react-native';
import { getFellowshipTopic, type FellowshipTopicId } from '../../lib/fellowship/topics';

/** Public context only: this never grants access, joins a salon or posts. */
export function FellowshipQuestion({ topic: id }: { topic?: FellowshipTopicId }) {
  const topic = getFellowshipTopic(id);
  if (!topic) return null;
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Question from Fellowship</Text>
    <Text selectable style={styles.copy}>{topic.question}</Text>
    <Text selectable style={styles.source}>SoE reading: {topic.href}</Text>
    <Text style={styles.note}>Ask the host whether this topic fits their salon. Selecting it does not filter salons by subject, join a group or post a message.</Text>
  </View>;
}
const styles = StyleSheet.create({
  card: { gap: 12, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#708776', backgroundColor: '#172b24' },
  heading: { color: '#f4f2e5', fontSize: 20, lineHeight: 28 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 },
  source: { color: '#e8cb8d', fontSize: 14, lineHeight: 22 }, note: { color: '#c0cbbf', fontSize: 14, lineHeight: 22 },
});
