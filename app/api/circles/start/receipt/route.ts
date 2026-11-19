import type { NextRequest } from 'next/server';
import { circleCreationReceipt } from '@/lib/circles/hosting-recovery-server';

export async function GET(req: NextRequest) {
  return circleCreationReceipt(req);
}
