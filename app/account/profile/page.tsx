import type { Metadata } from 'next';
import Link from 'next/link';
import ProfileEditor from './ProfileEditor';
import styles from './profile.module.css';

export const metadata: Metadata = {
  title: 'Your profile | Society of Explorers',
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <main className={styles.page}>
    <nav aria-label="Account navigation"><Link href="/dashboard">Account</Link><Link href="/circles">Circles</Link></nav>
    <p className={styles.eyebrow}>Society of Explorers</p>
    <h1>Your profile</h1>
    <p>Choose what you share. Profiles start private. Publishing makes the fields below visible to anyone who opens your profile and to the member directory.</p>
    <p>This controls your profile page and directory listing. Names on contributions you choose to post stay with those contributions.</p>
    <ProfileEditor />
  </main>;
}
