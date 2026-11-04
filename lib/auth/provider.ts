import 'server-only';
import type { NextResponse } from 'next/server';

export const AUTH_PROVIDER_COOKIE = 'soe_auth_provider';
export type AuthProvider = 'supabase' | 'wallet';

export function selectAuthProvider(response: NextResponse, provider: AuthProvider) {
  // This choice grants nothing without that provider's independently verified
  // credential. Match the existing wallet's mobile browser cookie attributes.
  response.cookies.set(AUTH_PROVIDER_COOKIE, provider, {
    httpOnly: true, path: '/', maxAge: 30 * 24 * 60 * 60,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
