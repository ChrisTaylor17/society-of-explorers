import { getSupabaseAccessToken } from '@/lib/auth/getSession';

export async function circleHeaders(json = false): Promise<Record<string, string>> {
  const token = await getSupabaseAccessToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
