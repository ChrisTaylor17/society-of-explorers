import { NextRequest } from 'next/server';
import { circleMine } from '@/lib/circles/membership-server';

export async function GET(req: NextRequest) {
  return circleMine(req);
}
