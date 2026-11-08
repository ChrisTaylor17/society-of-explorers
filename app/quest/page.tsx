import type { Metadata } from 'next';
import Link from 'next/link';
import { ONLINE_CIRCLES_HREF } from '@/lib/circles/discovery';
import { PRIVACY_POLICY_PATH } from '@/lib/account/privacy-policy';
import CircleSafetyNav from '../circles/messages/CircleSafetyNav';
import { body, button, card, h1, h2, lead, main, page } from '@/lib/circles/ui';
import { FELLOWSHIP_TOPICS, fellowshipDiscoveryHref } from '@/lib/fellowship/topics';

export const metadata: Metadata = { title: 'Quest Browser', description: 'Read and discuss with your Circle in Meta Quest Browser.' };

export default function QuestPage() {
  return <div style={page}><CircleSafetyNav /><main id="main" style={{ ...main, paddingTop: '2.5rem' }}>
    <h1 style={h1}>Your Circle in Quest Browser</h1>
    <p style={lead}>Read, reflect and share with your Circle from the regular Meta Quest Browser window.</p>
    <p style={body}>Choose a Circle, load current access, then choose “Open in Quest Browser.” Sign in with the same account you use on the web.</p>
    <p style={body}>On a compatible headset, open the immersive room to read recent Circle discussion and write short posts or replies. Choose Read selection for the current assignment when a supported edition is available. The regular Circle view has the full editions, discussion archive, live meeting links and safety controls.</p>
    <section aria-labelledby="quest-fellowship" style={card}>
      <h2 id="quest-fellowship" style={h2}>Christian fellowship in Quest</h2>
      <p style={body}>Read in context, bring an honest question, and meet real people. Choose a topic, find a suitable Circle, then open its Quest view. The study brief and question travel into the immersive discussion; you choose whether to draft a post.</p>
      <ul>{FELLOWSHIP_TOPICS.map(topic => <li key={topic.id}><Link href={fellowshipDiscoveryHref(topic.id)} style={button}>{topic.title} · find a Circle</Link></li>)}</ul>
      <p style={body}>Check the Circle’s purpose, host and actual dates before joining or RSVPing. Where shared salon check-in is enabled, the headset shows a member count and recent discussion. Open the host’s live meeting in the browser for conversation.</p>
      <p style={body}><Link href="/fellowship">Read the Fellowship studies and covenant</Link></p>
    </section>
    <p><Link href={ONLINE_CIRCLES_HREF} style={button}>Find an online Circle</Link></p>
    <p><Link href="/circles/mine" style={button}>My Circles</Link></p>
    <p><Link href="/quest/contributions" style={button}>My posted messages across Circles</Link></p>
    <p><Link href="/quest/contributions#member-blocks" style={button}>Blocked members</Link></p>
    <p><Link href="/quest/reviews" style={button}>Assigned message reviews</Link></p>
    <p><Link href={PRIVACY_POLICY_PATH} prefetch={false} style={button}>Privacy policy</Link></p>
  </main></div>;
}
