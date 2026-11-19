import { isUuid } from '@/lib/ids/uuid';

export type ThinkerRewardReceipt = { requestId: string; amount: 4 | 8; eventId: string; replayed: boolean };
export function parseThinkerRewardReceipt(value: unknown): ThinkerRewardReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'amount,eventId,replayed,requestId'
    || !isUuid(row.requestId) || !isUuid(row.eventId) || (row.amount !== 4 && row.amount !== 8)
    || typeof row.replayed !== 'boolean') return null;
  return { requestId: row.requestId.toLowerCase(), amount: row.amount, eventId: row.eventId.toLowerCase(), replayed: row.replayed };
}
