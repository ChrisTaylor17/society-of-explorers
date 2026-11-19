import type { MeridianPort } from "./port.ts";
import { payloadHash } from "./hash.ts";
import { validLookup, validWrite } from "./validation.ts";
import { REPORT_CATEGORIES, REPORT_NOTICE, validReportDetails, type ReportBody, type ReportCategory, type ReportReceipt, type ReportSubject } from "./report-contract.ts";
import type { LookupResult, WriteResult } from "./types.ts";

export type ReportPhase = "closed" | "editing" | "submitting" | "unknown" | "checking" | "retryable" | "submitted" | "rejected" | "expired";
export type ReportModel = {
  enabled: boolean; open: boolean; phase: ReportPhase;
  subject: ReportSubject | null; category: ReportCategory | null; details: string;
  message: string; receipt: ReportReceipt | null;
  canSubmit: boolean; canCheck: boolean; canRetry: boolean; unresolved: boolean;
};
type Attempt = { key: string; hash: string; body: ReportBody | null };
const UNKNOWN = "Submission is not confirmed. Check its status before starting another report. No human review is promised.";
const CLEARED = "Your local text was cleared. This submission is still unconfirmed; checking status does not send another report.";
let scopeSerial = 0;

/** One in-memory report intent. No draft, report text, or receipt is logged/persisted. */
export function createReporting(port: MeridianPort, developmentEnabled: boolean, scope = `report-${Date.now().toString(36)}-${++scopeSerial}-${Math.random().toString(36).slice(2)}`) {
  let ended = false, open = false, epoch = 0, serial = 0, pending = false;
  let phase: ReportPhase = "closed", subject: ReportSubject | null = null, category: ReportCategory | null = null, details = "", message = "";
  let attempt: Attempt | null = null, receipt: ReportReceipt | null = null;
  const enabled = () => developmentEnabled && !ended && port.name === "http-boundary" && port.writesEnabled && Boolean(port.submitReport);
  const editable = () => !attempt && ["editing", "rejected"].includes(phase);
  const valid = () => Boolean(subject && category && validReportDetails(details));
  function model(): ReportModel {
    return { enabled: enabled(), open, phase, subject: subject ? { ...subject } : null, category, details, message, receipt: receipt ? { ...receipt } : null,
      canSubmit: enabled() && open && !pending && editable() && valid(),
      canCheck: enabled() && open && !pending && Boolean(attempt),
      canRetry: enabled() && open && !pending && phase === "retryable" && Boolean(attempt?.body), unresolved: Boolean(attempt) };
  }
  function eraseText() { subject = null; category = null; details = ""; if (attempt) attempt.body = null; }
  function close() {
    epoch++; open = false; eraseText(); receipt = null; message = ""; phase = "closed";
    return model();
  }
  function endSession() { close(); ended = true; attempt = null; phase = "expired"; pending = false; return model(); }
  function unknown() { phase = "unknown"; message = attempt?.body ? UNKNOWN : CLEARED; }
  function finish(result: WriteResult<ReportReceipt>, mine: number): ReportModel {
    if (mine !== epoch || ended) return model();
    if (!validWrite(result, "report")) { unknown(); return model(); }
    if (result.status === "committed") {
      receipt = { reportId: result.data.reportId, submitted: true, notice: REPORT_NOTICE };
      attempt = null; eraseText(); phase = "submitted"; message = "Saved to the local prototype. This is a storage receipt.";
    } else if (result.status === "expired-session") {
      endSession(); open = true; message = "The local session expired. Your draft was cleared. Restart the demo to sign in again.";
    } else if (result.status === "conflict") {
      unknown(); message = "This key conflicts with a stored intent. No new report is confirmed. Keep checking this intent or end the local session.";
    } else if (result.status === "rejected") {
      attempt = null; phase = "rejected"; message = "No report was accepted. Check the fields or the local submission limit before trying again.";
    } else if (result.status === "unavailable" && result.blocker === "Report submission requires the configured local database. No report was submitted.") {
      attempt = null; phase = "rejected"; message = "Reporting requires the local SQLite test backend. No report was submitted.";
    } else unknown();
    return model();
  }
  function send(): Promise<ReportModel> {
    if (!enabled() || pending || !attempt?.body) return Promise.resolve(model());
    pending = true; phase = "submitting"; message = "Submitting to the local prototype…";
    const mine = epoch;
    // Do not capture the request body in completion handlers. Transport buffers
    // may outlive a background clear; already-sent bytes cannot be recalled.
    let sent: Promise<WriteResult<ReportReceipt>>;
    try { sent = port.submitReport!({ personId: port.viewerId, idempotencyKey: attempt.key, payloadHash: attempt.hash, body: attempt.body }); }
    catch { sent = Promise.reject(new Error("Report transport failed")); }
    return sent.then(result => { pending = false; return finish(result, mine); }, () => {
      pending = false; if (mine === epoch && !ended) unknown(); return model();
    });
  }
  return {
    model,
    open(target: ReportSubject): ReportModel {
      if (!enabled()) return model();
      open = true; receipt = null;
      if (attempt) { unknown(); return model(); }
      if (!["ada", "jules", "mina"].includes(target.otherId) || target.otherId === port.viewerId || (target.planId !== undefined && target.planId !== "plan-riverside")) {
        subject = null; category = null; details = ""; phase = "rejected"; message = "That synthetic report target is unavailable."; return model();
      }
      subject = { ...target }; category = null; details = ""; phase = "editing";
      message = "Synthetic local reporting only. No human review, response time, or automatic block is provided."; return model();
    },
    setCategory(value: ReportCategory): ReportModel { if (editable() && REPORT_CATEGORIES.includes(value)) category = value; return model(); },
    setDetails(value: string): ReportModel { if (editable()) details = value.slice(0, 2000); return model(); },
    submit(): Promise<ReportModel> {
      if (!model().canSubmit || !subject || !category) return Promise.resolve(model());
      const body: ReportBody = { otherId: subject.otherId, category, details, ...(subject.planId ? { planId: subject.planId } : {}) };
      attempt = { key: `${scope.slice(0, 120)}:report-${++serial}`, hash: payloadHash(body), body };
      return send();
    },
    retry(): Promise<ReportModel> { return model().canRetry ? send() : Promise.resolve(model()); },
    check(): Promise<ReportModel> {
      if (!model().canCheck || !attempt) return Promise.resolve(model());
      pending = true; phase = "checking"; message = "Checking the original submission receipt…";
      const mine = epoch, tracked = attempt;
      let checked: Promise<LookupResult>;
      try { checked = port.lookup({ personId: port.viewerId, endpoint: "report", key: tracked.key, payloadHash: tracked.hash }); }
      catch { checked = Promise.reject(new Error("Receipt check failed")); }
      return checked.then(result => {
        pending = false; if (mine !== epoch || ended) return model();
        if (!validLookup(result, "report")) { unknown(); return model(); }
        if (result.status === "recorded" && result.result.status === "committed") return finish(result.result as WriteResult<ReportReceipt>, mine);
        if (result.status === "absent") {
          phase = tracked.body ? "retryable" : "unknown";
          message = tracked.body ? "No receipt was found. You may retry this same report with its original key." : "No receipt was found. The text was cleared, so it cannot be resent. Keep checking this intent; no new report is sent automatically.";
        } else if (result.status === "unavailable" && result.blocker === "Session expired.") {
          endSession(); open = true; message = "The local session expired. Your draft was cleared.";
        } else unknown();
        return model();
      }, () => { pending = false; if (mine === epoch && !ended) unknown(); return model(); });
    },
    close,
    activity(state: string): ReportModel { return state === "inactive" || state === "background" ? close() : model(); },
    endSession,
  };
}
export type Reporting = ReturnType<typeof createReporting>;
