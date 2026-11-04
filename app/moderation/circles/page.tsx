import type { Metadata } from 'next';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { h1, label, lead, main, page } from '@/lib/circles/ui';
import CircleReviews from './CircleReviews';

export const metadata: Metadata = { title: 'Circle Review', robots: { index: false, follow: false, nocache: true } };
export default function CircleReviewPage() {
  return <div style={page}><PublicNav /><main id="main" style={main}>
    <p style={label}>Assigned reviewers</p><h1 style={h1}>Review Circle reports</h1>
    <p style={lead}>Check the listing and reports before deciding. A report is an allegation, not a finding. Political or religious disagreement alone is not a reason to restrict a Circle.</p>
    <CircleReviews />
  </main><PublicFooter /></div>;
}
