import 'server-only';

export function deletionReviewDays(): number | null {
  const days = process.env.SOE_ACCOUNT_DELETION_REVIEW_DAYS;
  return process.env.SOE_ACCOUNT_DELETION_REQUESTS_ENABLED === 'true' && days && /^(?:[1-9]|[12][0-9]|30)$/.test(days)
    ? Number(days) : null;
}
