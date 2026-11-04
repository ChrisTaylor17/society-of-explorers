export const REPORT_REASONS = ['safety', 'harassment', 'spam', 'misleading', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_LABELS: Record<ReportReason, string> = {
  safety: 'Someone may be unsafe',
  harassment: 'Harassment or hateful conduct',
  spam: 'Spam or selling',
  misleading: 'Fake or misleading circle',
  inappropriate: 'Inappropriate content',
  other: 'Something else',
};
/** Distinct open reports that hide a circle from the listing until someone reviews it. */
export const AUTO_HIDE_AT = 3;
