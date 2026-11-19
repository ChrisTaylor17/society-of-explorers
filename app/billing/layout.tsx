import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Billing and existing subscriptions', description: 'Explicitly check your own supporter or existing subscription status and billing management options.', robots: { index: false, follow: false } };
export default function BillingLayout({ children }: { children: React.ReactNode }) { return children; }
