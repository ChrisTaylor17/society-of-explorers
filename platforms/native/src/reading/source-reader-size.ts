/** Per-reader presentation preference; never a saved position or account setting. */
export const DEFAULT_READER_SIZE = 100, MIN_READER_SIZE = 80, MAX_READER_SIZE = 150, READER_SIZE_STEP = 10;
export function boundedReaderSize(value: number): number {
  return Number.isFinite(value) ? Math.max(MIN_READER_SIZE, Math.min(MAX_READER_SIZE, Math.round(value))) : DEFAULT_READER_SIZE;
}
