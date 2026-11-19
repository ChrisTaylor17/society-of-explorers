import { NextRequest } from 'next/server';
import { circleStart } from '@/lib/circles/membership-server';

export async function GET(req: NextRequest) {
  return circleStart(req);
}
