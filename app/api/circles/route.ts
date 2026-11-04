import { NextRequest } from 'next/server';
import { discoverPublicCircles } from '@/lib/circles/discovery-server';
import { circleCreate } from '@/lib/circles/membership-server';

export async function GET(req: NextRequest) { return discoverPublicCircles(req); }

// Creation is one receipt-bound database transaction; public discovery above
// retains its existing bounded inventory and private projection.
export async function POST(req: NextRequest) { return circleCreate(req); }
