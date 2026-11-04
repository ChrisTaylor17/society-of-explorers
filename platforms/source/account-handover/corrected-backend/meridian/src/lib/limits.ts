import type { Repository } from "./db";

export const LOGIN_LIMIT = 8;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;
export const SIGNUP_LIMIT = 5;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

export async function takeAttempt(
  repo: Repository,
  bucket: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  const row = await repo.rateBucket(bucket);
  const start = row ? Date.parse(row.window_start) : Number.NaN;
  if (!row || Number.isNaN(start) || now - start >= windowMs) {
    await repo.setRateBucket(bucket, 1, new Date(now).toISOString());
    return true;
  }
  if (row.hits >= limit) return false;
  await repo.setRateBucket(bucket, Number(row.hits) + 1, row.window_start);
  return true;
}
