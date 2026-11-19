import { reelAppAssociation } from '@/lib/clips/app-links';

export function GET(req: Request) {
  return reelAppAssociation('ios', req);
}
