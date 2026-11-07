import type { Metadata } from 'next';
import Link from 'next/link';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import { PRIVACY_POLICY_PATH } from '@/lib/account/privacy-policy';
import CircleSafetyNav from '../circles/messages/CircleSafetyNav';
import { body, button, h1, lead, main, page } from '@/lib/circles/ui';

export const metadata: Metadata = { title: 'Quest Browser', description: 'Read and discuss with your Circle in Meta Quest Browser.' };

export default function QuestPage() {
  return <div style={page}><CircleSafetyNav /><main id="main" style={{ ...main, paddingTop: '2.5rem' }}>
    <h1 style={h1}>Your Circle in Quest Browser</h1>
    <p style={lead}>Read, reflect and share with your Circle from the regular Meta Quest Browser window.</p>
    <p style={body}>Choose a Circle, load current access, then choose “Open in Quest Browser.” Sign in with the same account you use on the web.</p>
    <p style={body}>On a compatible headset, open the immersive room to read recent Circle discussion and write short posts or replies. Choose Read selection for the current assignment when a supported edition is available. The regular Circle view has the full editions, discussion archive, live meeting links and safety controls.</p>
    <p><Link href={ONLINE_CIRCLES_HREF} style={button}>Find an online Circle</Link></p>
    <p><Link href="/circles/mine" style={button}>My Circles</Link></p>
    <p><Link href="/quest/contributions" style={button}>My posted messages across Circles</Link></p>
    <p><Link href="/quest/contributions#member-blocks" style={button}>Blocked members</Link></p>
    <p><Link href="/quest/reviews" style={button}>Assigned message reviews</Link></p>
    <p><Link href={PRIVACY_POLICY_PATH} prefetch={false} style={button}>Privacy policy</Link></p>
  </main></div>;
}
