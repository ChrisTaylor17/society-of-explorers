import Link from 'next/link';
import { isUuid } from '@/lib/ids/uuid';
import CircleSafetyNav from '../../circles/messages/CircleSafetyNav';
import SupporterBilling from '../SupporterBilling';
import { body, h1, main, page } from '@/lib/circles/ui';
import styles from '../supporter.module.css';
export default async function BillingReturnPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams ?? {}, raw = query.attempt;
  const attempt = typeof raw === 'string' && isUuid(raw) ? raw.toLowerCase() : null;
  return <div style={page}><CircleSafetyNav /><main id="main" className={styles.scope} style={{ ...main, paddingTop: '2.5rem' }}><h1 style={h1}>Check your billing return</h1><p style={body}>Returning here does not confirm payment or a subscription change. Explicitly check this attempt against your own current billing state.</p><SupporterBilling key={attempt || 'invalid'} mode="return" attemptId={attempt} /><p style={{ ...body, marginTop: '2rem' }}><Link href="/billing">Your billing</Link> · <Link href="/great-books">Return to the free library</Link></p></main></div>;
}
