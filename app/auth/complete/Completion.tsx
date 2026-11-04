'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { notifyAuthProviderChanged } from '@/lib/auth/providerSelection';

export default function Completion({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  useEffect(() => {
    notifyAuthProviderChanged();
    router.replace(nextPath);
  }, [router, nextPath]);
  return <main style={{ padding: '3rem', maxWidth: '40rem', margin: 'auto' }}>
    <h1>Completing sign-in</h1>
    <p role="status">Opening your selected account…</p>
    <p><a href={nextPath}>Continue to Society of Explorers</a></p>
  </main>;
}
