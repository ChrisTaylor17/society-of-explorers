import { clipResource } from '@/lib/clips/server';
export const runtime = 'nodejs';
type Props = { params: Promise<{ clipId: string }> };
export async function GET(request: Request, { params }: Props) { return clipResource(request, (await params).clipId, 'captions'); }
export const HEAD = GET;
