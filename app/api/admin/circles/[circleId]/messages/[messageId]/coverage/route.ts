import type { NextRequest } from 'next/server';
import { coverageRead, coverageWrite } from '@/lib/circles/review-coverage-server';
type Context = { params: Promise<{ circleId: string; messageId: string }> };
export async function GET(req: NextRequest, { params }: Context) { return coverageRead(req, params); }
export async function POST(req: NextRequest, { params }: Context) { return coverageWrite(req, params); }
