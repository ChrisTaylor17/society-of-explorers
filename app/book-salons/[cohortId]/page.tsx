import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isUuid } from '@/lib/ids/uuid';
import { CIRCLE_BOOK_ID } from '@/lib/circles/path';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import LegacySalon from './LegacySalon';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Classify the legacy URL before any client/session component can mount. */
export default async function CohortPage({ params }: { params: Promise<{ cohortId: string }> }) {
  const { cohortId: requestedId } = await params;
  if (!isUuid(requestedId)) notFound();
  const cohortId = requestedId.toLowerCase();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let result;
  try {
    const query = getSupabaseAdmin().from('book_cohorts').select('id,book_id').eq('id', cohortId)
      .abortSignal(controller.signal).maybeSingle();
    result = await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Lookup unavailable')); }, 5_000);
      }),
    ]);
  } catch { result = null; }
  finally { if (timer) clearTimeout(timer); }

  if (!result || result.error || !('data' in result)
    || (result.data && (result.data.id !== cohortId || typeof result.data.book_id !== 'string'))) {
    return <main style={{ maxWidth: '48rem', padding: '2rem', margin: 'auto' }}>
      <h1>Discussion unavailable</h1><p role="alert">The discussion could not be opened. Try again later.</p>
      <Link href="/circles">Find a Circle</Link>
    </main>;
  }
  if (!result.data) notFound();
  if (result.data.book_id === CIRCLE_BOOK_ID) redirect(`/circles/${cohortId}`);
  return <LegacySalon />;
}
