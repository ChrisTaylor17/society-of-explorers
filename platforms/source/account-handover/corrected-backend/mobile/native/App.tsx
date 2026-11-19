import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, LogBox, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { HOST, PLAN_ID } from "../src/fixture.ts";
import { createNativeSession, type NativeSession } from "../src/native-session.ts";
import { createShellActions } from "../src/shell-actions.ts";
import type { ScreenAction, ScreenModel } from "../src/types.ts";
import { prepareAndroidLifecycleJourney, recordAndroidAudit, runAndroidRuntimeChecks } from "./runtime-checks.ts";
import { ReportScreen } from "./ReportScreen.tsx";
import type { ReportModel } from "../src/reporting.ts";
import { MemberCircleScreen } from './MemberCircleScreen';
import type { ExistingMemberCircleConfig } from '../src/circles/verified-member-session';
import { CircleScreen } from './CircleScreen';
import type { CircleHostConfig } from '../src/circles/host';
import { DiscussionScreen } from './DiscussionScreen.tsx';
import {PlanAccessScreen} from './PlanAccessScreen.tsx';

type AppProps = { [key: string]: unknown; embeddedSynthetic?: boolean; syntheticAutorun?: boolean; circleConfig?: CircleHostConfig; memberCircle?: ExistingMemberCircleConfig };
export default function App(props: AppProps = {}) {
  const [circleOpen, setCircleOpen] = useState(Boolean(props.circleConfig || props.memberCircle));
  if (circleOpen && props.memberCircle) return <MemberCircleScreen config={props.memberCircle} onClose={() => setCircleOpen(false)}/>;
  if (circleOpen) return <CircleScreen config={props.circleConfig} onClose={() => setCircleOpen(false)}/>;
  return <View style={{ flex: 1 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open member circle" onPress={() => setCircleOpen(true)} style={{ minHeight: 48, padding: 14, backgroundColor: '#101d1a' }}>
      <Text style={{ color: '#f4f2e5', fontSize: 17 }}>Open member circle</Text>
    </Pressable>
    <SyntheticApp {...props}/>
  </View>;
}

const FIXTURE_CONTROL = "Synthetic fixture control. No other person accepted.";
const OPEN_PLAN = new Set(["visibility", "join-pending", "join-ambiguous", "mutual", "revoked", "failed-refresh"]);

function factValue(screen: ScreenModel, label: string): string | undefined {
  return screen.facts.find((fact) => fact.label === label)?.value;
}

function SyntheticApp({ embeddedSynthetic = false, syntheticAutorun = false }: { [key: string]: unknown; embeddedSynthetic?: boolean; syntheticAutorun?: boolean } = {}) {
  const session = useRef<NativeSession | null>(null);
  if (session.current === null) {
    session.current = createNativeSession({
      development: __DEV__,
      mode: process.env.EXPO_PUBLIC_SOE_DEMO_MODE,
      origin: process.env.EXPO_PUBLIC_SOE_DEMO_ORIGIN,
    }, createShellActions);
  }
  const { fixture, client, shell, reporting, discussion, participation, label, detail, activity } = session.current;
  const ticket = useRef(0);
  const [screen, setScreen] = useState<ScreenModel>(() => client.screen());
  const [busy, setBusy] = useState(true);
  const [fixtureStatus, setFixtureStatus] = useState(FIXTURE_CONTROL);
  const [runtimeRows, setRuntimeRows] = useState<string[]>([]);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [report, setReport] = useState<ReportModel>(() => reporting.model());
  const [ended, setEnded] = useState(false);
  const [discussionOpen,setDiscussionOpen]=useState(false);
  const [discussionModel,setDiscussionModel]=useState(()=>discussion.model());
  useEffect(()=>discussion.subscribe(setDiscussionModel),[discussion]);
  const closeDiscussion=useCallback(()=>{discussion.close();setDiscussionOpen(false);},[discussion]);
  const [membershipOpen,setMembershipOpen]=useState(false);
  const [membershipModel,setMembershipModel]=useState(()=>participation.model());
  useEffect(()=>participation.subscribe(m=>{setMembershipModel(m);if(m.busy||m.pending||m.confirmation){setScreen(client.releaseRelay());setReport(reporting.close());}}),[participation,client,reporting]);
  const runtimeChecksEnabled = __DEV__ && process.env.EXPO_PUBLIC_SOE_RUNTIME_CHECKS === "1" && session.current.mode === "local-http";
  const auditEnabled = __DEV__ && process.env.EXPO_PUBLIC_SOE_RUNTIME_AUDIT === "1";
  const lifecycleAutorun = __DEV__ && (process.env.EXPO_PUBLIC_SOE_RUNTIME_JOURNEY === "1" || (embeddedSynthetic && syntheticAutorun));
  const journeyReady = useRef(false);
  const checksStarted = useRef(false);
  const auditOrigin = process.env.EXPO_PUBLIC_SOE_DEMO_ORIGIN ?? "";

  const show = useCallback((start: () => Promise<ScreenModel>) => {
    if(participation.model().pending){setScreen(client.releaseRelay());return;}
    const mine = ++ticket.current;
    session.current!.checkingPlanAccess(true);
    setBusy(true);
    const pending = start();
    setScreen(client.screen());
    void (async () => {
      await Promise.resolve();
      if (ticket.current === mine) setScreen(client.screen());
      try {
        await pending;
      } finally {
        if (ticket.current === mine) {
          session.current!.checkingPlanAccess(false);
          if (client.screen().phase === "expired-session") { reporting.endSession(); discussion.end(); }
          setReport(reporting.model());
          setScreen(client.screen());
          setBusy(false);
          if (auditEnabled) console.info("SOE_APP_SCREEN", JSON.stringify({ phase: client.screen().phase, heldRelay: client.heldRelay() !== null, at: new Date().toISOString() }));
        }
      }
    })();
  }, [client, reporting, discussion, participation, auditEnabled]);
  const closeMembership=useCallback(()=>{participation.close();setMembershipOpen(false);show(()=>client.foregroundRefresh());},[participation,show,client]);

  useEffect(() => {
    // The embedded demo has no live debugger; keep warnings in native logs
    // while removing only the development warning overlay from this app UI.
    if (__DEV__ && embeddedSynthetic) LogBox.ignoreAllLogs(true);
    show(async () => {
      const booted = await client.boot();
      if (lifecycleAutorun) {
        await prepareAndroidLifecycleJourney(auditOrigin, session.current!, () => setScreen(client.screen()));
        journeyReady.current = true;
        await recordAndroidAudit(auditOrigin, { tag: "journey-ready", heldRelay: client.heldRelay() !== null, at: new Date().toISOString() });
        return client.screen();
      }
      return booted;
    });
    const subscription = AppState.addEventListener("change", (nextState) => {
      const decision = activity(nextState);
      setReport(reporting.model());
      if (session.current?.isEnded()) return;
      if (auditEnabled) console.info("SOE_APP_ACTIVITY", JSON.stringify({ state: nextState, decision: decision?.kind ?? "leave", phase: client.screen().phase, heldRelay: client.heldRelay() !== null, at: new Date().toISOString() }));
      if (lifecycleAutorun) void recordAndroidAudit(auditOrigin, { tag: "activity", state: nextState, phase: client.screen().phase, heldRelay: client.heldRelay() !== null, at: new Date().toISOString() });
      if (decision?.kind === "clear") {
        setScreen(decision.screen);
        return;
      }
      if (decision?.kind === "refresh") show(async () => {
        const result = await decision.run();
        if (lifecycleAutorun && journeyReady.current && !checksStarted.current) {
          checksStarted.current = true;
          await recordAndroidAudit(auditOrigin, { tag: "foreground-returned", phase: client.screen().phase, heldRelay: client.heldRelay() !== null, at: new Date().toISOString() });
          void runAndroidRuntimeChecks(auditOrigin, rows => setRuntimeRows(rows.map(row => `${row.passed ? "PASS" : "FAIL"}: ${row.name}`)), embeddedSynthetic);
        }
        return result;
      });
    });
    const blur=Platform.OS==='android'?AppState.addEventListener('blur',()=>{activity('inactive');setReport(reporting.model());setScreen(client.screen());}):null;
    const focus=Platform.OS==='android'?AppState.addEventListener('focus',()=>{discussion.activity('active');participation.activity('active');}):null;
    return () => { subscription.remove(); blur?.remove(); focus?.remove(); reporting.close(); discussion.close(); participation.close(); };
  }, [client, reporting, discussion, participation, show, activity, auditEnabled, lifecycleAutorun, auditOrigin, embeddedSynthetic]);

  function reportRequest(start: () => Promise<ReportModel>) {
    const pending = start(); setReport(reporting.model());
    void pending.then(value => setReport(value));
  }
  function endLocalSession() {
    ticket.current++; setScreen(session.current!.end()); setReport(reporting.model()); setBusy(false); setEnded(true);
  }

  function runJourney(action: ScreenAction): void {
    if (!action.enabled || busy || participation.model().pending) return;
    if (action.id === "review") {
      show(() => client.reviewPlan(PLAN_ID));
      return;
    }
    show(() => shell.run(action, PLAN_ID) ?? Promise.resolve(client.screen()));
  }

  const hostWaiting = factValue(screen, "Host acceptance of the plan") === "Waiting";
  const viewerGranted = factValue(screen, "Your contact grant") === "Active";
  const hostNotGranted = factValue(screen, "Host contact grant") === "Not active";
  const planOpen = OPEN_PLAN.has(screen.phase);
  const loading = busy || screen.phase === "loading";

  if (ended) return <SafeAreaView style={styles.screen}><View style={styles.scroll}>
    <Text style={styles.banner}>SYNTHETIC DEMO</Text><Text style={styles.title}>Local demo session ended</Text>
    <Text style={styles.lede}>The local report draft and receipt tracking were cleared. Restart the app for a new demo session.</Text>
    <Text style={styles.revocation}>This does not delete submitted reports or revoke a token already issued by the local test server.</Text>
  </View></SafeAreaView>;
  if (report.open) return <ReportScreen model={report}
    onCategory={value => setReport(reporting.setCategory(value))} onDetails={value => setReport(reporting.setDetails(value))}
    onSubmit={() => reportRequest(() => reporting.submit())} onCheck={() => reportRequest(() => reporting.check())}
    onRetry={() => reportRequest(() => reporting.retry())} onClose={() => setReport(reporting.close())} onEnd={endLocalSession} />;
  if(discussionOpen)return <DiscussionScreen model={discussionModel} controller={discussion} onClose={closeDiscussion}/>;
  if(membershipOpen)return <PlanAccessScreen model={membershipModel} controller={participation} onClose={closeMembership}/>;
  if(membershipModel.pending)return <SafeAreaView style={styles.screen}><View style={styles.scroll}>
    <Text accessibilityRole="header" style={styles.title}>Withdrawal outcome unconfirmed</Text>
    <Text accessibilityLiveRegion="polite" style={styles.lede}>Private plan views are paused. Check the original receipt before another participation change.</Text>
    <ActionButton label="Check withdrawal status" tone="journey" onPress={()=>{setMembershipOpen(true);void participation.open();}}/>
    <ActionButton label="End local demo session" tone="journey" onPress={endLocalSession}/>
    <Text style={styles.revocation}>Ending this local session does not cancel a request already sent or erase stored history.</Text>
  </View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text accessibilityRole="header" style={styles.banner}>
          {screen.demoLabel}
        </Text>
        <Text style={styles.bannerNote}>{screen.banner}</Text>
        {embeddedSynthetic ? <Text style={styles.fixtureCopy}>EMBEDDED SYNTHETIC DEMO · No Metro · Local backend required</Text> : null}
        <Text accessibilityRole="header" style={styles.section}>{label}</Text>
        <Text style={styles.bannerNote}>{detail}</Text>
        {__DEV__ && session.current.mode === "local-http" ? <View style={styles.utilities}>
          <View style={styles.utility}><ActionButton disabled={busy} label="Plan membership" tone="journey" onPress={()=>{setMembershipOpen(true);void participation.open();}}/></View>
          <View style={styles.utility}><ActionButton disabled={busy||Boolean(membershipModel.pending)} label="Plan discussion" tone="journey" onPress={()=>{setDiscussionOpen(true);void discussion.open();}}/></View>
          <View style={styles.utility}><ActionButton disabled={busy || !report.enabled} label="Report a concern" tone="journey"
            onPress={() => setReport(reporting.open({ otherId: HOST.id, displayName: HOST.displayName, planId: PLAN_ID }))} /></View>
          <View style={styles.utility}><ActionButton disabled={busy} label="End local demo" tone="journey" onPress={endLocalSession} /></View>
        </View> : null}
        <Text style={styles.eyebrow}>{screen.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {screen.title}
        </Text>
        <Text style={styles.lede}>{screen.lede}</Text>
        <Text style={styles.outcome}>Outcome: {screen.truthful}</Text>
        {loading ? (
          <ActivityIndicator
            accessibilityLabel="Synthetic demo. Loading the synthetic plan"
            color="#2f6a45"
            size="large"
            style={styles.spinner}
          />
        ) : null}
        {screen.facts.map((fact) => (
          <View key={`${fact.label}:${fact.value}`} style={styles.fact}>
            <Text style={styles.factLabel}>{fact.label}</Text>
            <Text style={styles.factValue}>{fact.value}</Text>
          </View>
        ))}
        <View accessibilityLabel={`Synthetic demo. ${screen.relay.note}`} style={styles.relay}>
          <Text style={styles.factLabel}>Relay</Text>
          <Text style={styles.factValue}>{screen.relay.note}</Text>
          {screen.relay.value ? <Text style={styles.relayValue}>{screen.relay.value}</Text> : null}
        </View>
        {screen.blockers.map((blocker) => (
          <Text key={blocker} style={styles.blocker}>
            {blocker}
          </Text>
        ))}
        <Text accessibilityLabel={screen.revocationNote} style={styles.revocation}>
          {screen.revocationNote}
        </Text>

        <Text style={styles.section}>Journey</Text>
        {screen.actions.map((action) => (
          <ActionButton
            key={action.id}
            disabled={!action.enabled || busy || Boolean(membershipModel.pending)}
            label={action.label}
            tone="journey"
            onPress={() => runJourney(action)}
          />
        ))}
        <ActionButton
          disabled={busy}
          label="Refresh the synthetic read"
          tone="journey"
          onPress={() => show(() => client.foregroundRefresh())}
        />

        {runtimeChecksEnabled ? <View style={styles.fixture}>
          <Text style={styles.section}>Android runtime validation</Text>
          <Text style={styles.fixtureCopy}>Development tests only. Resets the local synthetic backend. Restart the app before another manual journey.</Text>
          <ActionButton
            disabled={busy || runtimeBusy}
            label={runtimeBusy ? "Running synthetic runtime checks" : "Run synthetic Android runtime checks"}
            tone="fixture"
            onPress={() => {
              setBusy(true); setRuntimeBusy(true); setScreen(client.releaseRelay());
              setRuntimeRows(["Starting Android runtime checks"]);
              void runAndroidRuntimeChecks(process.env.EXPO_PUBLIC_SOE_DEMO_ORIGIN ?? "", rows =>
                setRuntimeRows(rows.map(row => `${row.passed ? "PASS" : "FAIL"}: ${row.name}${row.error ? ` — ${row.error}` : ""}`)), embeddedSynthetic)
                .catch(error => setRuntimeRows(rows => [...rows, `Runner failed: ${error instanceof Error ? error.message : "unknown failure"}`]))
                .finally(() => { setRuntimeBusy(false); setBusy(false); });
            }}
          />
          {runtimeRows.map(row => <Text key={row} style={styles.fixtureStatus}>{row}</Text>)}
        </View> : null}

        {fixture ? <View style={styles.fixture}>
          <Text style={styles.section}>Fixture controls</Text>
          <Text style={styles.fixtureCopy}>{FIXTURE_CONTROL}</Text>
          <Text style={styles.fixtureStatus}>{fixtureStatus}</Text>
          <ActionButton
            disabled={busy || !hostWaiting}
            label="Fixture: record host plan acceptance"
            tone="fixture"
            onPress={() => {
              fixture.scriptHostAcceptsPlan();
              setFixtureStatus(`${FIXTURE_CONTROL} The fixture recorded host plan acceptance.`);
              show(() => client.refresh());
            }}
          />
          <ActionButton
            disabled={busy || !viewerGranted || !hostNotGranted}
            label="Fixture: record host contact grant"
            tone="fixture"
            onPress={() => {
              fixture.scriptHostGrantsContact();
              setFixtureStatus(`${FIXTURE_CONTROL} The fixture recorded a host contact grant.`);
              show(() => client.refresh());
            }}
          />
          <ActionButton
            disabled={busy}
            label="Fixture: mark the device offline"
            tone="fixture"
            onPress={() => {
              client.setOnline(false);
              setBusy(false);
              setScreen(client.screen());
              setFixtureStatus(`${FIXTURE_CONTROL} The device is offline. No write was sent.`);
            }}
          />
          <ActionButton
            disabled={busy}
            label="Fixture: mark online and refresh"
            tone="fixture"
            onPress={() => {
              client.setOnline(true);
              setFixtureStatus(`${FIXTURE_CONTROL} Online refresh is a read and does not resend a write.`);
              show(() => client.refresh());
            }}
          />
          <ActionButton
            disabled={busy}
            label="Fixture: expire the demo session"
            tone="fixture"
            onPress={() => {
              client.setOnline(true);
              fixture.expireSession();
              setFixtureStatus(`${FIXTURE_CONTROL} The demo session is expired. This screen does not collect a passcode.`);
              show(() => client.refresh());
            }}
          />
          <ActionButton
            disabled={busy || !planOpen}
            label="Fixture: reject the next plan refresh"
            tone="fixture"
            onPress={() => {
              const original = fixture.plan.bind(fixture);
              fixture.plan = (planId: string) => {
                fixture.plan = original;
                void planId;
                return Promise.reject(new Error("synthetic transport loss"));
              };
              setFixtureStatus(`${FIXTURE_CONTROL} The next plan read is rejected. No write was sent.`);
              show(() => client.refresh());
            }}
          />
          <ActionButton
            disabled={busy || !planOpen}
            label="Fixture: return an older plan read"
            tone="fixture"
            onPress={() => {
              fixture.pushStaleRead({ version: 0, title: "Older riverside walk", contact: null });
              setFixtureStatus(`${FIXTURE_CONTROL} The next plan read is older than the latest version.`);
              show(() => client.refresh());
            }}
          />
          <ActionButton
            label="Fixture: next join stays pending"
            tone="fixture"
            onPress={() => {
              fixture.failNext("join", "pending");
              setFixtureStatus(`${FIXTURE_CONTROL} Press Request to join to send the pending request once.`);
            }}
          />
          <ActionButton
            label="Fixture: next join stays unknown"
            tone="fixture"
            onPress={() => {
              fixture.failNext("join", "drop-before");
              setFixtureStatus(`${FIXTURE_CONTROL} Press Request to join once. The outcome stays unknown.`);
            }}
          />
        </View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  disabled,
  onPress,
  tone,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  tone: "journey" | "fixture";
}) {
  const unavailable = Boolean(disabled);
  const fixtureLabel = tone === "fixture" ? `Synthetic fixture control. ${label}. No other person accepted.` : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Synthetic demo. ${fixtureLabel}`}
      accessibilityState={{ disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={[styles.button, tone === "fixture" ? styles.fixtureButton : styles.journeyButton, unavailable ? styles.buttonDisabled : null]}
    >
      <Text style={[styles.buttonText, unavailable ? styles.buttonTextDisabled : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  utilities: { flexDirection: "row", flexWrap:"wrap", gap: 8 }, utility: { flexBasis:'45%',flexGrow:1 },
  screen: { flex: 1, backgroundColor: "#f6f3e9" },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, width: "100%", maxWidth: 520, alignSelf: "center" },
  banner: { color: "#8f3d24", fontSize: 13, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  bannerNote: { marginTop: 4, color: "#8f3d24", fontSize: 16, lineHeight: 22 },
  eyebrow: { marginTop: 18, color: "#2f6a45", fontSize: 13, fontWeight: "700" },
  title: { marginTop: 4, color: "#24352c", fontSize: 28, lineHeight: 34, fontWeight: "700" },
  lede: { marginTop: 10, color: "#24352c", fontSize: 17, lineHeight: 24 },
  outcome: { marginTop: 10, color: "#24352c", fontSize: 15, fontWeight: "700" },
  spinner: { marginTop: 16 },
  fact: { marginTop: 12 },
  factLabel: { color: "#2f6a45", fontSize: 13, fontWeight: "700" },
  factValue: { marginTop: 2, color: "#24352c", fontSize: 16, lineHeight: 22 },
  relay: { marginTop: 16, padding: 12, backgroundColor: "#fffdf8", borderRadius: 8 },
  relayValue: { marginTop: 6, color: "#24352c", fontSize: 16, lineHeight: 22 },
  blocker: { marginTop: 10, color: "#8f3d24", fontSize: 15, lineHeight: 22 },
  revocation: { marginTop: 16, color: "#24352c", fontSize: 15, lineHeight: 22 },
  section: { marginTop: 8, color: "#24352c", fontSize: 18, fontWeight: "700" },
  button: { marginTop: 10, minHeight: 48, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8 },
  journeyButton: { backgroundColor: "#2f6a45" },
  fixtureButton: { backgroundColor: "#8f3d24" },
  buttonDisabled: { backgroundColor: "#cfc6b6" },
  buttonText: { color: "#f6f3e9", fontSize: 16, lineHeight: 22, fontWeight: "600" },
  buttonTextDisabled: { color: "#5c675f" },
  fixture: { marginTop: 28, padding: 14, borderWidth: 1, borderColor: "#8f3d24", borderRadius: 8 },
  fixtureCopy: { marginTop: 8, color: "#8f3d24", fontSize: 16, lineHeight: 22, fontWeight: "700" },
  fixtureStatus: { marginTop: 8, color: "#24352c", fontSize: 15, lineHeight: 22 },
});
