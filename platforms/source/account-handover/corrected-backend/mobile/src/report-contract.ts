export const REPORT_CATEGORIES = ["harassment", "safety", "spam", "other"] as const;
export type ReportCategory = typeof REPORT_CATEGORIES[number];
export const REPORT_DETAILS_LIMIT = 2000;
export const REPORT_NOTICE = "Report submitted to local storage. This prototype provides no human review or response-time service. Submitting does not block contact.";
export type ReportBody = { otherId: string; category: ReportCategory; details: string; planId?: string };
export type ReportReceipt = { reportId: string; submitted: true; notice: typeof REPORT_NOTICE };
export type ReportSubject = { otherId: string; displayName: string; planId?: string };

export function validReportDetails(value: string): boolean {
  if (!value.trim() || value.length > REPORT_DETAILS_LIMIT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return false;
  // Same UTF-16/well-formed boundary as the local API, without requiring ES2024.
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

export function validReportReceipt(value: unknown): value is ReportReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).length === 3 && typeof row.reportId === "string" && /^report-[a-f0-9]{32}$/.test(row.reportId) && row.submitted === true && row.notice === REPORT_NOTICE;
}
