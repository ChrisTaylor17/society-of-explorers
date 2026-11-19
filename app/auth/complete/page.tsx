import Completion from './Completion';
import { getSafeAuthRedirectPath } from '@/lib/auth/redirectPath';
import { parseBrowserIntent } from '@/lib/auth/browserIntent';

export const metadata = { title: 'Completing sign-in | Society of Explorers', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function AuthCompletePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requested = typeof query.next === 'string' ? query.next : null;
  return <Completion nextPath={getSafeAuthRedirectPath(requested)} intent={parseBrowserIntent(query.intent)} />;
}
