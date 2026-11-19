import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { loadPublicExplorerProfile } from '@/lib/explorer/publicProfile';
import { SHARE_OG_IMAGES, SHARE_TWITTER_IMAGES } from '@/lib/site/shareCard';

export const dynamic = 'force-dynamic';

// Keep link previews generic, including when publication changes while a page
// renders. Publishing a profile does not opt the member into search indexing.
export function generateMetadata(): Metadata {
  const title = 'Explorer profile — Society of Explorers';
  const description = 'Authored profile details explicitly shared by an explorer.';
  return {
    title: { absolute: title }, description, robots: { index: false, follow: false },
    openGraph: { title, description, siteName: 'Society of Explorers', type: 'website', images: SHARE_OG_IMAGES },
    twitter: { card: 'summary_large_image', title, description, images: SHARE_TWITTER_IMAGES },
  };
}

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const muted = '#9a8f7a';

export default async function ExplorerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await loadPublicExplorerProfile(id).catch(() => null);
  // Private, missing, malformed and unavailable profiles share the same generic
  // not-found presentation; no identity or activity enters the page metadata.
  if (!profile) notFound();
  const sections = [
    ['About', profile.bio], ['Discipline', profile.discipline],
    ['Current project', profile.project_description], ['Seeking', profile.seeking],
    ['Philosophy', profile.philosophy],
  ].filter((section): section is [string, string] => typeof section[1] === 'string' && !!section[1]);
  const name = profile.display_name || 'Explorer';
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />
      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '8rem 1.5rem 4rem', overflowWrap: 'anywhere' }}>
        <p style={{ color: gold, fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.15em' }}>PUBLIC EXPLORER PROFILE</p>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 400 }}>{name}</h1>
        <p style={{ color: muted, fontSize: '1.1rem', lineHeight: 1.6 }}>Profile details this explorer chose to publish.</p>
        {sections.map(([heading, text]) => (
          <section key={heading} style={{ borderTop: `1px solid ${gold}33`, padding: '1rem 0' }}>
            <h2 style={{ color: gold, fontSize: '1.25rem', fontWeight: 400 }}>{heading}</h2>
            <p style={{ fontSize: '1.15rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{text}</p>
          </section>
        ))}
        {profile.skills.length > 0 && <section style={{ borderTop: `1px solid ${gold}33`, padding: '1rem 0' }}>
          <h2 style={{ color: gold, fontSize: '1.25rem', fontWeight: 400 }}>Skills</h2>
          <ul style={{ fontSize: '1.15rem', lineHeight: 1.7 }}>{profile.skills.map((skill, index) => <li key={index}>{skill}</li>)}</ul>
        </section>}
        <p style={{ marginTop: '2rem' }}><a href="/account/profile" style={{ color: gold, minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}>Manage your profile</a></p>
      </main>
      <PublicFooter />
    </div>
  );
}
