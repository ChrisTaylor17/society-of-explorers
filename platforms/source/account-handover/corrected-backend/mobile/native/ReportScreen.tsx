import { useEffect } from "react";
import { ActivityIndicator, BackHandler, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { REPORT_CATEGORIES, REPORT_DETAILS_LIMIT, REPORT_NOTICE, validReportDetails, type ReportCategory } from "../src/report-contract.ts";
import type { ReportModel } from "../src/reporting.ts";

type Props = {
  model: ReportModel;
  onCategory: (value: ReportCategory) => void; onDetails: (value: string) => void;
  onSubmit: () => void; onCheck: () => void; onRetry: () => void;
  onClose: () => void; onEnd: () => void;
};
const labels: Record<ReportCategory, string> = { harassment: "Harassment", safety: "Safety concern", spam: "Spam", other: "Other" };

/** Pure view: text stays in the reporting controller; no analytics or logging. */
export function ReportScreen({ model, onCategory, onDetails, onSubmit, onCheck, onRetry, onClose, onEnd }: Props) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose]);
  const busy = model.phase === "submitting" || model.phase === "checking";
  const editable = model.enabled && !model.unresolved && ["editing", "rejected"].includes(model.phase);
  const invalidText = model.details.length > 0 && !validReportDetails(model.details);
  return <SafeAreaView testID="report-screen" collapsable={false} style={styles.screen}>
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.banner}>SYNTHETIC LOCAL DEMO</Text>
      <Text accessibilityRole="header" style={styles.title}>{model.phase === "submitted" ? "Report saved to local storage" : "Report a concern"}</Text>
      {model.subject ? <Text style={styles.lede}>About {model.subject.displayName} · fictional participant</Text> : null}
      <Text style={styles.notice}>Use fictional details only. No human review, response time, or automatic block is provided.</Text>
      <Text accessibilityLiveRegion="polite" style={styles.message}>{model.message}</Text>
      {busy ? <ActivityIndicator accessibilityLabel="Synthetic report request in progress" color="#2f6a45" style={styles.spinner} /> : null}
      {model.subject && model.phase !== "submitted" ? <>
        <Text style={styles.label}>Reason</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Report reason" style={styles.reasons}>
          {REPORT_CATEGORIES.map(value => <Pressable key={value} accessibilityRole="radio"
            accessibilityLabel={labels[value]} accessibilityState={{ checked: model.category === value, disabled: !editable }}
            disabled={!editable} onPress={() => onCategory(value)} style={[styles.reason, model.category === value && styles.selected]}>
            <Text style={[styles.reasonText, model.category === value && styles.selectedText]}>{labels[value]}</Text>
          </Pressable>)}
        </View>
        <Text style={styles.label}>Details</Text>
        <Text style={styles.hint}>Avoid unnecessary personal details. The draft is cleared when you close this screen or leave the app.</Text>
        <TextInput accessibilityLabel="Fictional report details" testID="report-details" value={model.details}
          onChangeText={onDetails} editable={editable} multiline maxLength={REPORT_DETAILS_LIMIT}
          placeholder="Describe a fictional concern for this test." placeholderTextColor="#6b746c"
          autoCorrect={false} spellCheck={false} autoComplete="off" textContentType="none" importantForAutofill="no"
          style={styles.input} textAlignVertical="top" />
        <Text style={styles.counter}>{model.details.length}/{REPORT_DETAILS_LIMIT}</Text>
        {invalidText ? <Text accessibilityRole="alert" style={styles.error}>Enter valid text without control characters.</Text> : null}
        {!model.unresolved ? <Button label="Submit synthetic report" disabled={!model.canSubmit} onPress={onSubmit} /> : null}
      </> : null}
      {model.unresolved ? <View style={styles.card}>
        <Text style={styles.hint}>Checking reads the original receipt. Retry sends the same report with the same key; it does not start a new intent.</Text>
        <Button label="Check submission status" disabled={!model.canCheck} onPress={onCheck} />
        {model.canRetry ? <Button label="Retry the same report" onPress={onRetry} /> : null}
      </View> : null}
      {model.receipt ? <View style={styles.card}>
        <Text style={styles.label}>Storage receipt</Text>
        <Text selectable style={styles.receipt}>{model.receipt.reportId}</Text>
        <Text style={styles.lede}>{REPORT_NOTICE}</Text>
        <Text style={styles.hint}>The report remains in the unencrypted local test database. Closing this screen does not delete it.</Text>
      </View> : null}
      <Button label={model.phase === "submitted" ? "Return to plan" : "Close and clear draft"} secondary onPress={onClose} />
      {model.unresolved ? <Text style={styles.hint}>A request already sent may still be saved after you close. Only its key/hash stays in this local session for status checking; the text is cleared.</Text> : null}
      <Button label="End local demo session" secondary onPress={onEnd} />
    </ScrollView>
  </SafeAreaView>;
}

function Button({ label, disabled = false, secondary = false, onPress }: {label: string; disabled?: boolean; secondary?: boolean; onPress: () => void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f6f3e9" },
  scroll: { padding: 20, paddingBottom: 40, maxWidth: 520, width: "100%", alignSelf: "center" },
  banner: { fontSize: 13, fontWeight: "700", color: "#8f3d24", letterSpacing: 0.4 },
  title: { marginTop: 16, fontSize: 28, fontWeight: "700", color: "#24352c" },
  lede: { marginTop: 10, fontSize: 16, lineHeight: 23, color: "#24352c" },
  notice: { marginTop: 12, fontSize: 15, lineHeight: 22, color: "#8f3d24" },
  message: { marginTop: 12, fontSize: 15, lineHeight: 22, color: "#24352c" },
  spinner: { marginTop: 12 }, label: { marginTop: 18, fontSize: 16, fontWeight: "700", color: "#2f6a45" },
  hint: { marginTop: 8, fontSize: 14, lineHeight: 20, color: "#4d5d50" },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  reason: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: "#9eac9d", borderRadius: 8 },
  selected: { backgroundColor: "#2f6a45", borderColor: "#2f6a45" }, reasonText: { fontSize: 15, color: "#24352c" }, selectedText: { color: "#fffdf8" },
  input: { marginTop: 12, minHeight: 144, borderWidth: 1, borderColor: "#8d9b8c", borderRadius: 8, padding: 12, fontSize: 16, lineHeight: 23, color: "#24352c", backgroundColor: "#fffdf8" },
  counter: { marginTop: 6, textAlign: "right", fontSize: 13, color: "#4d5d50" }, error: { marginTop: 8, color: "#8f3d24", fontSize: 14 },
  button: { marginTop: 12, minHeight: 48, padding: 14, backgroundColor: "#2f6a45", borderRadius: 8, justifyContent: "center" },
  secondary: { backgroundColor: "#e5e0d2" }, disabled: { backgroundColor: "#b5bcae" }, buttonText: { fontSize: 16, fontWeight: "600", color: "#fffdf8", textAlign: "center" }, secondaryText: { color: "#24352c" },
  card: { marginTop: 16, padding: 14, borderRadius: 8, backgroundColor: "#fffdf8" }, receipt: { marginTop: 8, fontSize: 14, color: "#24352c" },
});
