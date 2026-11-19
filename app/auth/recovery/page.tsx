import type { Metadata } from 'next';
import Recovery from './Recovery';
export const metadata: Metadata = { title: 'Recover your password — Society of Explorers', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function RecoveryPage() { return <Recovery />; }
