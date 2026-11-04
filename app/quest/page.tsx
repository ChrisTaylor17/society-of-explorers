import type { Metadata } from 'next';
import Link from 'next/link';
import CircleSafetyNav from '../circles/messages/CircleSafetyNav';
import { body, button, h1, lead, main, page } from '@/lib/circles/ui';

export const metadata: Metadata = { title: 'Quest Browser', description: 'Read and discuss with your Circle in Meta Quest Browser.' };

export default function QuestPage() {
  return <div style={page}><CircleSafetyNav /><main id="main" style={{ ...main, paddingTop: '2.5rem' }}>
    <h1 style={h1}>Your Circle in Quest Browser</h1>
    <p style={lead}>Read, reflect and share with your Circle from the regular Meta Quest Browser window.</p>
    <p style={body}>Choose a Circle, load current access, then choose “Open in Quest Browser.” Sign in with the same account you use on the web.</p>
    <p style={body}>The discussion archive, source readings and safety controls remain available in the regular Circle view. Immersive viewing is still being verified.</p>
    <p><Link href="/circles" style={button}>Find a Circle</Link></p>
    <p><Link href="/circles/mine" style={button}>My Circles</Link></p>
  </main></div>;
}
