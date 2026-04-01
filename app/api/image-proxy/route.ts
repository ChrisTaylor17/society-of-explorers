import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url || !url.startsWith('https://www.giovannidecunto.com/')) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const res = await fetch(url, {
    headers: { 'Referer': 'https://www.giovannidecunto.com/' }
  });
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      'Content-Type': res.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    }
  });
}
