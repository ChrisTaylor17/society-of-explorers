import type { Metadata } from 'next';
import Link from 'next/link';
import { ACCOUNT_DELETION_PATH } from '@/lib/account/deletion-contract';
import { PRIVACY_CONTACT, PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_STATUS } from '@/lib/account/privacy-policy';
import styles from '../account/profile/profile.module.css';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'Learn how Society of Explorers handles member information and how to use your account controls.',
};

export default function PrivacyPage() {
  return <main id="main" className={styles.page}>
    <nav aria-label="Privacy navigation"><Link href="/" prefetch={false}>Society of Explorers</Link></nav>
    <h1>Privacy policy</h1>
    <p>{PRIVACY_POLICY_STATUS}</p>
    {PRIVACY_POLICY_SECTIONS.map(({ title, text }) => <section key={title}>
      <h2>{title}</h2>
      <p>{text}</p>
    </section>)}
    <nav aria-label="Privacy requests">
      <Link href={ACCOUNT_DELETION_PATH} prefetch={false}>Open account deletion</Link>
      <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>
    </nav>
  </main>;
}
