/** Small synthetic limits, not a staffed incident-response policy. */
export const REPORT_CATEGORIES = Object.freeze(["harassment", "safety", "spam", "other"]);
export const MAX_REPORT_DETAILS = 2000; // Raw UTF-16 code units; stored text is trimmed.
export const MAX_REPORTS_PER_PERSON = 25; // Lifetime cap; no implicit reset on restart.
export const MAX_REPORT_REQUEST_BYTES = 8192;
export const REPORT_RECEIPT = "Report submitted to local storage. This prototype provides no human review or response-time service. Submitting does not block contact.";
export function validReportText(value) {
  return typeof value === "string" && value.isWellFormed() && value.trim().length >= 1 && value.trim().length <= MAX_REPORT_DETAILS && value.length <= MAX_REPORT_DETAILS && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
export function validReportBody(body) {
  return body && typeof body === "object" && !Array.isArray(body) &&
    ["otherId", "category", "details"].every(key => Object.hasOwn(body, key)) &&
    Object.keys(body).every(key => ["otherId", "category", "details", "planId"].includes(key)) &&
    typeof body.otherId === "string" && REPORT_CATEGORIES.includes(body.category) && validReportText(body.details) &&
    (!Object.hasOwn(body, "planId") || (typeof body.planId === "string" && body.planId.length > 0));
}
