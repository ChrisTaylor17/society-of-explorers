import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import PublicFooter from '@/components/PublicFooter';
import PublicNav from '@/components/PublicNav';
import { getPersonality } from '@/lib/movement/personalities';
import type { PersonalityKind } from '@/lib/movement/personalities/types';

export const dynamic = 'force-dynamic';

const CINZEL = 'Cinzel, serif';
const CORMORANT = 'Cormorant Garamond, serif';
const PLAYFAIR = 'Playfair Display, serif';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const muted = '#9a8f7a';
const border = '1px solid rgba(201,168,76,0.15)';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface PersonalityOutput {
  id: string;
  kind: PersonalityKind;
  topic: string | null;
  content: string;
  created_at: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const personality = getPersonality(slug);

  if (!personality) {
    return {
      title: 'Personality Not Found - Society of Explorers',
    };
  }

  return {
    title: `${personality.name} - Society of Explorers`,
    description: personality.bio,
  };
}

export default async function MovementPersonalityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const personality = getPersonality(slug);
  if (!personality) notFound();

  const { data } = await supabase
    .from('personality_outputs')
    .select('id, kind, topic, content, created_at')
    .eq('personality_slug', slug)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(20);

  const outputs = (data || []) as PersonalityOutput[];

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: CORMORANT }}>
      <PublicNav />
      <main>
        <style>{`
          .personality-shell {
            max-width: 720px;
            margin: 0 auto;
            padding: 96px 24px 64px;
          }
          @media (max-width: 768px) {
            .personality-shell { padding: 64px 16px 48px; }
          }
        `}</style>

        <section className="personality-shell">
          <header style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{ fontFamily: CINZEL, fontSize: '10px', letterSpacing: '0.25em', color: personality.color, marginBottom: '18px' }}>
              PERSONALITY
            </div>
            <h1
              style={{
                fontFamily: PLAYFAIR,
                fontStyle: 'italic',
                fontSize: 'clamp(32px, 6vw, 52px)',
                color: parchment,
                textAlign: 'center',
                fontWeight: 400,
                lineHeight: 1.12,
                margin: 0,
              }}
            >
              {personality.name}
            </h1>
            <div style={{ width: '40px', height: '1px', background: gold, opacity: 0.4, margin: '28px auto 22px' }} />
            <p style={{ fontFamily: CORMORANT, fontStyle: 'italic', fontSize: '18px', lineHeight: 1.7, color: muted, textAlign: 'center', margin: 0 }}>
              {personality.bio}
            </p>
          </header>

          <section>
            <div style={{ fontFamily: CINZEL, fontSize: '10px', letterSpacing: '0.25em', color: gold, marginBottom: '28px', textAlign: 'center' }}>
              RECENT OUTPUTS
            </div>

            {outputs.length === 0 ? (
              <p style={{ color: muted, fontStyle: 'italic', textAlign: 'center', fontSize: '18px', margin: 0 }}>
                This voice has yet to speak.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {outputs.map((output) => (
                  <article key={output.id} style={{ borderTop: border, paddingTop: '24px' }}>
                    <div style={{ fontFamily: CINZEL, fontSize: '9px', letterSpacing: '0.22em', color: personality.color, marginBottom: '10px' }}>
                      {output.kind.toUpperCase()}
                    </div>
                    {output.topic && (
                      <p style={{ color: parchment, fontFamily: PLAYFAIR, fontStyle: 'italic', fontSize: '22px', lineHeight: 1.25, margin: '0 0 14px' }}>
                        {output.topic}
                      </p>
                    )}
                    <p style={{ color: 'rgba(245,240,232,0.82)', fontFamily: CORMORANT, fontSize: '18px', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>
                      {output.content}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
