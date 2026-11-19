import type { NextRequest } from 'next/server';
import { coverageDecide } from '@/lib/circles/review-coverage-server';
export async function POST(req: NextRequest, { params }: { params: Promise<{ circleId: string; messageId: string }> }) {
  return coverageDecide(req, params);
}
