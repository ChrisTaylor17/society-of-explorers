import { NextResponse } from 'next/server';
import { getOrCreateTodayQuestion } from '@/lib/practice/todayQuestion';

export async function GET() {
  const question = await getOrCreateTodayQuestion();
  if (!question) {
    return NextResponse.json({ question: null, error: 'Failed to generate question' }, { status: 500 });
  }
  return NextResponse.json({ question });
}
