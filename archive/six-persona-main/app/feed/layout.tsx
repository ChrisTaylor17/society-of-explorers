import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: todayQuestion } = await supabase
      .from('daily_questions')
      .select('id')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    let todayCount = 0;
    if (todayQuestion) {
      const { count } = await supabase
        .from('question_responses')
        .select('*', { count: 'exact', head: true })
        .eq('question_id', todayQuestion.id);
      todayCount = count || 0;
    }

    const title = 'Live Feed — Society of Explorers';
    const description = `${todayCount} ${todayCount === 1 ? 'person' : 'people'} answered today\u2019s philosophical question. See what real humans are thinking — live.`;

    return {
      title, description,
      openGraph: { title, description, type: 'website' },
      twitter: { card: 'summary_large_image', title, description },
    };
  } catch {
    return {
      title: 'Live Feed — Society of Explorers',
      description: 'Real-time philosophical reflection from the Society of Explorers community.',
    };
  }
}

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
