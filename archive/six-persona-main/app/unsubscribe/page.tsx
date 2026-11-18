import { createClient } from '@supabase/supabase-js';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let status: 'ok' | 'invalid' | 'already' = 'invalid';

  if (token && /^[0-9a-f-]{36}$/i.test(token)) {
    const { data } = await supabase
      .from('daily_email_subscriptions')
      .select('id, unsubscribed_at')
      .eq('unsubscribe_token', token)
      .maybeSingle();
    if (data) {
      if (data.unsubscribed_at) {
        status = 'already';
      } else {
        await supabase
          .from('daily_email_subscriptions')
          .update({ unsubscribed_at: new Date().toISOString() })
          .eq('id', data.id);
        status = 'ok';
      }
    }
  }

  const message =
    status === 'ok'
      ? 'You\u2019ve been unsubscribed. No more morning emails.'
      : status === 'already'
      ? 'You\u2019re already unsubscribed.'
      : 'This link is invalid or expired.';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f5f0e8', fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />
      <section style={{ padding: '10rem 2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.4em', color: '#c9a84c', marginBottom: '1.5rem' }}>
          UNSUBSCRIBE
        </div>
        <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '20px', fontStyle: 'italic', color: '#f5f0e8', maxWidth: '440px', margin: '0 auto 2rem' }}>
          {message}
        </p>
        <a
          href="/practice"
          style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.2em', color: '#c9a84c', textDecoration: 'none' }}
        >
          TODAY&apos;S QUESTION &rarr;
        </a>
      </section>
      <PublicFooter />
    </div>
  );
}
