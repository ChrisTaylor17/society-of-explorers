import Link from 'next/link';
import CircleSafetyNav from '../circles/messages/CircleSafetyNav';
import SupporterBilling from './SupporterBilling';
import { body, h1, main, page } from '@/lib/circles/ui';
import styles from './supporter.module.css';
export default function BillingPage() {
  return <div style={page}><CircleSafetyNav /><main id="main" className={styles.scope} style={{ ...main, paddingTop: '2.5rem' }}><h1 style={h1}>Your billing</h1><p style={body}>Explicitly check your own subscription before opening billing management. New supporter sales and existing subscription management are separate.</p><SupporterBilling mode="billing" /><p style={{ ...body, marginTop: '2rem' }}><Link href="/join">Free community and optional support</Link> · <Link href="/great-books">Return to the free library</Link></p></main></div>;
}
