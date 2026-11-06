import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';
import { reelHref } from '../../lib/clips/contracts';
import { REEL_QUESTIONS, reelDiscussionId, type ReelDiscussionId } from '../../lib/clips/salon';
import { philemonEdition } from '../../lib/root-kernel/philemon-study';
import { approvedOrigin } from './src/circles/host';
import { prepareInstalledPublicCircles, type PublicCircleDiscoveryConnection } from './src/circles/installed-member';
import catalog from './clip-catalog.json';
import type { ClipState } from './specs/SoeClipPlayerNativeComponent';

const ClipPlayer = lazy(() => import('./specs/SoeClipPlayerNativeComponent'));
const greeting = philemonEdition.paragraphs[0].find(verse => verse.verse === 3)?.text;
const status = { loading: 'Opening video…', playing: 'Playing', paused: 'Paused', ended: 'Video ended', unavailable: 'Video could not open.' } as const;
type Playback = { id: string; key: string; playing: boolean; phase: keyof typeof status };
let nextPlayback = 0;

function playerAvailable() {
  try { return (Platform.OS === 'ios' || Platform.OS === 'android') && Boolean(UIManager?.getViewManagerConfig('SoeClipPlayer')); }
  catch { return false; }
}

export function ClipsScreen({ onBack, onRead, onBrowse, appOrigin, reel, preparePublicCircles = prepareInstalledPublicCircles }: {
  onBack(): void; onRead(): void; onBrowse?: (reel?: ReelDiscussionId) => void; appOrigin?: string;
  reel?: ReelDiscussionId;
  preparePublicCircles?: () => Promise<PublicCircleDiscoveryConnection>;
}) {
  const current = useRef<Playback | null>(null);
  const foreground = useRef(false);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [active, setActive] = useState(false);
  const [available] = useState(playerAvailable);
  const shareRequest = useRef<symbol | null>(null);
  const [shareFallback, setShareFallback] = useState<{ id: string; url?: string } | null>(null);
  function update(value: Playback | null) {
    current.current = value;
    setPlayback(value);
  }
  useLayoutEffect(() => {
    let blurred = false;
    const sync = () => {
      const ready = AppState.currentState === 'active' && !blurred;
      foreground.current = ready;
      if (!ready) { update(null); shareRequest.current = null; }
      setActive(ready);
    };
    const change = AppState.addEventListener('change', sync);
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { blurred = true; sync(); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { blurred = false; sync(); }) : null;
    sync();
    return () => {
      foreground.current = false;
      current.current = null;
      shareRequest.current = null;
      change.remove(); blur?.remove(); focus?.remove();
    };
  }, []);

  function toggle(id: string) {
    if (!foreground.current || !available) return;
    const clip = current.current;
    if (clip?.id === id && clip.phase !== 'ended' && clip.phase !== 'unavailable') {
      update({ ...clip, playing: !clip.playing });
    } else {
      update({ id, key: 'clip-' + ++nextPlayback, playing: true, phase: 'loading' });
    }
  }
  function onPlayerState(state: ClipState) {
    const clip = current.current;
    if (!foreground.current || !clip || state.requestKey !== clip.key || !Object.hasOwn(status, state.phase)) return;
    const phase = state.phase as Playback['phase'];
    update({ ...clip, phase, playing: clip.playing && phase !== 'ended' && phase !== 'unavailable' });
  }
  async function share(id: string, title: string) {
    if (!foreground.current || shareRequest.current) return;
    const request = Symbol();
    shareRequest.current = request;
    setShareFallback(null);
    const isCurrent = () => foreground.current && shareRequest.current === request;
    let url: string | undefined;
    try {
      let origin = appOrigin;
      if (!origin) {
        const publicSite = await preparePublicCircles();
        try { origin = publicSite.origin; }
        finally { publicSite.close(); }
      }
      url = approvedOrigin(origin) + reelHref(id);
      const { Share } = await import('react-native');
      if (isCurrent()) await Share.share({ title, message: `${title}\n${url}` });
    } catch {
      if (isCurrent()) setShareFallback({ id, url });
    } finally {
      if (shareRequest.current === request) shareRequest.current = null;
    }
  }

  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>SOCIETY OF EXPLORERS</Text>
      <Text accessibilityRole="header" style={styles.title}>{reel ? 'Shared Reel' : 'Clips'}</Text>
      {!reel && <><Text style={styles.copy}>Short films and source readings to bring to a salon.</Text>
        <Text accessibilityRole="header" style={styles.heading}>Video clips</Text></>}
      {!available ? <Text style={styles.note}>This build can open the transcripts. Video playback needs the installed clip player.</Text> : null}
      {catalog.videos.filter(clip => !reel || clip.id === reel).map(clip => {
        const reel = clip.attribution ? reelDiscussionId(clip.id) : undefined;
        const playing = playback?.id === clip.id ? playback : null;
        const action = playing?.phase === 'ended' ? 'Replay' : playing?.playing ? 'Pause' : 'Play';
        return <View key={clip.id} style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>{clip.title}</Text>
          <Text style={styles.copy}>{clip.description}</Text>
          <Text style={styles.note}>Silent video with on-screen text · About {Math.round(clip.durationMs / 1000)} seconds</Text>
          {available ? <Action label={action + ' ' + clip.title} disabled={!active} onPress={() => toggle(clip.id)}/> : null}
          {playing ? <>
            <Text accessibilityLiveRegion="polite" style={styles.note}>{status[playing.phase]}</Text>
            {playing.phase !== 'unavailable' ? <Suspense fallback={<Text style={styles.note}>Opening player…</Text>}>
              <ClipPlayer key={playing.key} accessible={false} clipId={clip.id} requestKey={playing.key}
                playing={playing.playing} onClipState={event => onPlayerState(event.nativeEvent)}
                style={[styles.video, { aspectRatio: clip.width / clip.height }]}/>
            </Suspense> : null}
          </> : null}
          {reel && onBrowse && <>
            <Text style={styles.note}>{REEL_QUESTIONS[reel]}</Text>
            <Action label={`Discuss ${clip.title} in a Circle`} disabled={!active} onPress={() => onBrowse(reel)}/>
          </>}
          <Text selectable style={styles.note}>{clip.credit}</Text>
          {clip.attribution ? <>
            <Text style={styles.note}>{clip.attribution.edits}</Text>
            <Text selectable style={styles.address}>{clip.sourcePage}</Text>
            <Text selectable style={styles.address}>{clip.attribution.licenseUrl}</Text>
            {clip.attribution.referenceUrl && <Text selectable style={styles.address}>
              USGS eruption report · {clip.attribution.referenceUrl}</Text>}
            <Action label={`Share ${clip.title}`} disabled={!active} onPress={() => void share(clip.id, clip.title)}/>
            {shareFallback?.id === clip.id && <>
              <Text accessibilityLiveRegion="polite" style={styles.note}>
                {shareFallback.url ? 'Copy this Reel link.' : 'Sharing needs a configured Society of Explorers website.'}
              </Text>
              {shareFallback.url && <Text selectable style={styles.address}>{shareFallback.url}</Text>}
            </>}
          </> : null}
          <Text accessibilityRole="header" style={styles.note}>Transcript</Text>
          <Text selectable style={styles.copy}>{clip.transcript}</Text>
        </View>;
      })}
      {!reel && <>
        <Text accessibilityRole="header" style={styles.heading}>Reading clip</Text>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>Grace and peace</Text>
          <Text selectable style={styles.copy}>{greeting}</Text>
          <Text style={styles.note}>Philemon 1:3 · {philemonEdition.edition} · Public domain</Text>
          <Text selectable style={styles.address}>{philemonEdition.publisherUrl}</Text>
          <Action label="Read the full Philemon study" onPress={onRead}/>
        </View>
        {onBrowse ? <Action label="Find an online Circle" onPress={() => onBrowse()}/> : null}
      </>}
    </ScrollView>
    <View style={styles.footer}><Action label="Back to account" onPress={onBack}/></View>
  </SafeAreaView>;
}

function Action({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
    <Text style={styles.copy}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101d1a' },
  content: { padding: 20, gap: 16 },
  eyebrow: { color: '#e8cb8d', fontSize: 13, letterSpacing: 1.4 },
  title: { color: '#f4f2e5', fontSize: 33, lineHeight: 41 },
  heading: { color: '#f4f2e5', fontSize: 22, lineHeight: 28 },
  copy: { color: '#e9eadf', fontSize: 16, lineHeight: 24 },
  note: { color: '#c1cec5', fontSize: 14, lineHeight: 21 },
  address: { color: '#e8cb8d', fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: '#172923', borderColor: '#557266', borderWidth: 1, borderRadius: 10, padding: 16, gap: 12 },
  video: { alignSelf: 'center', width: '100%', maxHeight: 420, backgroundColor: '#080e0c' },
  button: { minHeight: 48, padding: 12, borderRadius: 8, borderColor: '#a4b9ad', borderWidth: 1, backgroundColor: '#294e3c', justifyContent: 'center' },
  disabled: { opacity: 0.6 },
  footer: { paddingHorizontal: 20, paddingVertical: 8 },
});
