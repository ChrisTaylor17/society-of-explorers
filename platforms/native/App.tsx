import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MemberCircleScreen } from './MemberCircleScreen';
import { memberCircleConfig } from '../shared/bootstrap';
import type { ExistingMemberCircleConfig } from './src/circles/verified-member-session';
import type { NativeConnectivityPort } from './src/circles/native-connectivity';

/** The authenticated native composition calls this component with its existing
 * client/approved transport. The registered default has no fictional login. */
export default function App({ memberCircle, connectivity }: { memberCircle?: ExistingMemberCircleConfig; connectivity?: NativeConnectivityPort } = {}) {
  const config = useMemo(() => memberCircleConfig(memberCircle), [memberCircle]);
  const [closed, setClosed] = useState<ExistingMemberCircleConfig | null>(null);
  if (config && closed !== config) return <MemberCircleScreen config={config} connectivity={connectivity} onClose={() => setClosed(config)}/>;
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS</Text>
    <Text accessibilityRole="header" style={styles.title}>Read deeply. Share thoughtfully.</Text>
    <Text style={styles.copy}>A Great Books community rooted in Christian and American traditions, open to everyone willing to explore in good faith.</Text>
    <View accessibilityLiveRegion="polite" style={styles.status}>
      <Text style={styles.copy}>{config ? 'Circle closed. Return through the signed-in app to choose your Circle again.' : 'Member sign-in is not connected in this native build yet. No private conversation has been loaded.'}</Text>
    </View>
    <Text style={styles.copy}>The member experience needs the app’s verified sign-in and approved secure connection before Circles can open.</Text>
    {config ? <Pressable accessibilityRole="button" accessibilityLabel="Reopen current Circle" onPress={() => setClosed(null)} style={styles.button}>
      <Text style={styles.copy}>Reopen current Circle</Text>
    </Pressable> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#101d1a' }, content: { padding: 24, gap: 20 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 }, title: { color: '#f4f2e5', fontSize: 34, lineHeight: 42 },
  copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 }, status: { paddingVertical: 16 },
  button: { backgroundColor: '#294e3c', borderWidth: 1, borderColor: '#b1c1b5', borderRadius: 8, padding: 14, minHeight: 48 } });
