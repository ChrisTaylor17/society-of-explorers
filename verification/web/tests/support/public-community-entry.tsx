import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import CommunityDashboard from '@/app/c/[slug]/page';

declare global { interface Window { publicProfileQa: { mount(slug: string): void; unmount(): void } } }
const root = createRoot(document.getElementById('root')!);
window.publicProfileQa = {
  mount(slug) { const params = Promise.resolve({ slug }); root.render(<Suspense fallback={<p>Loading community…</p>}><CommunityDashboard params={params}/></Suspense>); },
  unmount() { root.unmount(); },
};
window.publicProfileQa.mount('alpha');
