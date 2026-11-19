import type { Metadata } from 'next';
import Link from 'next/link';
import { ACCOUNT_DELETION_PATH } from '@/lib/account/deletion-contract';
import { deletionReviewDays } from '@/lib/account/deletion-config';
import styles from '../profile/profile.module.css';
import AccountDeletionForm from './AccountDeletionForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Account deletion | Society of Explorers',
  robots: { index: false, follow: false },
};

export default function AccountDeletionPage() {
  const intakeEnabled = deletionReviewDays() !== null;
  return <main className={styles.page}>
    <nav aria-label="Account navigation"><Link href="/">Society of Explorers</Link></nav>
    <h1>Account deletion</h1>
    <p>Use this page to ask Society of Explorers to delete your account and associated data, or to check a request you already submitted.</p>
    {intakeEnabled
      ? <p><Link href={`/login?next=${encodeURIComponent(ACCOUNT_DELETION_PATH)}`} prefetch={false}>Sign in on this website</Link></p>
      : <p>New deletion requests are currently unavailable here. You can still check a saved status code below.</p>}
    <AccountDeletionForm intakeEnabled={intakeEnabled}/>
  </main>;
}
