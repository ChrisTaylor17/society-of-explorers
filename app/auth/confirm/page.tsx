import type { Metadata } from 'next';
import Confirmation from './Confirmation';
export const metadata: Metadata = { title: 'Confirm your email — Society of Explorers', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function ConfirmationPage() { return <Confirmation />; }
