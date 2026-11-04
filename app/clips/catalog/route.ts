import { clipCatalog } from '@/lib/clips/catalog';
import { clipHeaders } from '@/lib/clips/server';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const headers = clipHeaders('application/json; charset=utf-8');
  if (new URL(request.url).search) return Response.json({ error: 'Use the reviewed clip catalog.' }, { status: 400, headers });
  try { return Response.json(await clipCatalog(), { headers }); }
  catch { return Response.json({ error: 'The reviewed clip catalog is unavailable.' }, { status: 503, headers }); }
}
