'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { getSupabaseAccessToken } from '@/lib/auth/getSession';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory85 = 'rgba(245,240,232,0.85)';
const muted = '#9a8f7a';
const panel = '#0d0d0d';
const border = `1px solid ${gold}18`;

type WindowKit = {
  generatedAt: string;
  status: string;
  noExternalActionBoundary: string;
  qr: {
    url: string;
    asset: string;
  };
  sign: {
    eyebrow: string;
    headline: string;
    subhead: string;
    campaign: string;
    cta: string;
    displayUrl: string;
    footer: string;
  };
  patronNote: string[];
  approvalChecklist: string[];
  docs: Array<{
    label: string;
    path: string;
  }>;
  readiness: {
    mode: 'draft_for_approval' | string;
    externalActions: 'none' | string;
    approvalRequiredBeforeExternalAction: boolean;
    receiptRequiredForPrep: boolean;
    exactApprovalRequiredFor: string[];
    localOnlySurfaces: string[];
    boundary: string;
  };
  prepReceipt: {
    action: string;
    generatedAt: string;
    mode: 'local_draft_only' | string;
    externalActions: 'none' | string;
    approvalRequiredBeforeExternalAction: boolean;
    allowedUse: string;
    blockedActions: string[];
    detail: string;
  };
};

function statusLabel(value: string): string {
  return value.replace(/_/g, ' ').toUpperCase();
}

export default function CapitalWindowKitPage() {
  const [kit, setKit] = useState<WindowKit | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const token = await getSupabaseAccessToken();
        const res = await fetch('/api/admin/capital/window-kit', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Window kit unavailable');
        setKit(payload.kit || null);
        setGeneratedAt(payload.generatedAt || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Window kit unavailable');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '1180px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <Link href="/capital" style={{ color: muted, fontSize: '14px', textDecoration: 'none' }}>
          Back to command center
        </Link>

        <header style={{ margin: '1.5rem 0 2rem' }}>
          <div style={eyebrowStyle}>92B WINDOW KIT</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 400, lineHeight: 1.1, margin: '0 0 1rem' }}>
            Make the storefront signal real, carefully.
          </h1>
          <p style={{ fontSize: '19px', color: ivory85, lineHeight: 1.8, maxWidth: '760px', margin: 0 }}>
            A private draft package for the 92B window: QR destination, sign copy, patron note, and approval gates. This prepares the move without printing, placing, sending, or contacting anyone.
          </p>
        </header>

        {loading && <div style={{ color: muted, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em' }}>LOADING...</div>}

        {!loading && error && (
          <section style={{ border, background: panel, padding: '2rem', color: muted }}>
            {error}. Sign in as an approved admin account to view this draft package.
          </section>
        )}

        {kit && (
          <>
            <section style={{ background: panel, border, padding: '1.5rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <div style={eyebrowStyle}>{statusLabel(kit.status)}</div>
                  <p style={{ color: muted, fontSize: '16px', lineHeight: 1.7, margin: 0, maxWidth: '740px' }}>
                    {kit.noExternalActionBoundary}
                  </p>
                </div>
                <div style={{ color: muted, fontSize: '13px' }}>
                  Generated {generatedAt ? new Date(generatedAt).toLocaleString() : 'locally'}
                </div>
              </div>
            </section>

            <section style={{ ...sectionStyle, marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                <div>
                  <div style={eyebrowStyle}>CAPITAL PREP READINESS</div>
                  <p style={{ color: parchment, fontFamily: 'Cinzel, serif', fontSize: '18px', letterSpacing: '0.08em', margin: '0 0 0.6rem' }}>
                    {kit.readiness.mode.replace(/_/g, ' ')}
                  </p>
                  <p style={{ color: muted, fontSize: '14px', lineHeight: 1.6, margin: '0 0 0.55rem' }}>{kit.readiness.boundary}</p>
                  <p style={{ color: '#d17b7b', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
                    External actions: {kit.readiness.externalActions.toUpperCase()} / Approval required: {kit.readiness.approvalRequiredBeforeExternalAction ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <div style={eyebrowStyle}>EXACT APPROVAL REQUIRED FOR</div>
                  {kit.readiness.exactApprovalRequiredFor.map((item) => (
                    <p key={item} style={{ color: muted, fontSize: '14px', lineHeight: 1.5, margin: '0 0 0.35rem' }}>
                      {item}
                    </p>
                  ))}
                </div>
                <div>
                  <div style={eyebrowStyle}>LAST PREP RECEIPT</div>
                  <p style={{ color: ivory85, fontSize: '14px', lineHeight: 1.55, margin: '0 0 0.45rem' }}>
                    {kit.prepReceipt.detail}
                  </p>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.45, margin: 0 }}>
                    {kit.prepReceipt.mode.replace(/_/g, ' ')} / {new Date(kit.prepReceipt.generatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
              <section style={sectionStyle}>
                <div style={eyebrowStyle}>WINDOW SIGN PREVIEW</div>
                <article style={signPreviewStyle}>
                  <div>
                    <div style={{ fontFamily: 'Cinzel, serif', color: gold, fontSize: '11px', letterSpacing: '0.22em', marginBottom: '1.5rem' }}>
                      {kit.sign.eyebrow.toUpperCase()}
                    </div>
                    <h2 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 400, fontSize: 'clamp(32px, 6vw, 54px)', lineHeight: 1.02, margin: '0 0 1rem' }}>
                      {kit.sign.headline}
                    </h2>
                    <p style={{ color: ivory85, fontSize: '18px', lineHeight: 1.55, margin: '0 auto', maxWidth: '560px' }}>
                      {kit.sign.subhead}
                    </p>
                    <p style={{ color: muted, fontSize: '16px', lineHeight: 1.6, margin: '1.5rem auto 0', borderTop: `1px solid ${gold}33`, borderBottom: `1px solid ${gold}33`, padding: '1rem 0', maxWidth: '620px' }}>
                      {kit.sign.campaign}
                    </p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: '1rem', alignItems: 'center', textAlign: 'left', maxWidth: '520px', margin: '2rem auto' }}>
                    <Image src={kit.qr.asset} alt="QR code for 92B founding patron campaign" width={150} height={150} style={{ background: '#fff', padding: '0.4rem' }} />
                    <div>
                      <div style={{ fontFamily: 'Cinzel, serif', color: gold, fontSize: '11px', letterSpacing: '0.18em', marginBottom: '0.5rem' }}>
                        {kit.sign.cta.toUpperCase()}
                      </div>
                      <div style={{ color: parchment, fontFamily: 'Arial, sans-serif', fontSize: '22px', lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                        {kit.sign.displayUrl}
                      </div>
                    </div>
                  </div>
                  <div style={{ color: 'rgba(201,168,76,0.88)', fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.14em', lineHeight: 1.7 }}>
                    {kit.sign.footer}
                  </div>
                </article>
              </section>

              <aside style={{ display: 'grid', gap: '1.25rem' }}>
                <section style={sectionStyle}>
                  <div style={eyebrowStyle}>QR DESTINATION</div>
                  <Image src={kit.qr.asset} alt="92B campaign QR code" width={180} height={180} style={{ background: '#fff', padding: '0.5rem', marginBottom: '1rem' }} />
                  <p style={{ color: ivory85, fontSize: '15px', lineHeight: 1.6, overflowWrap: 'anywhere', margin: 0 }}>
                    {kit.qr.url}
                  </p>
                  <p style={{ color: muted, fontSize: '13px', lineHeight: 1.55, margin: '0.75rem 0 0' }}>
                    QR asset: {kit.qr.asset}
                  </p>
                </section>

                <section style={sectionStyle}>
                  <div style={eyebrowStyle}>APPROVAL CHECKLIST</div>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {kit.approvalChecklist.map((item) => (
                      <div key={item} style={{ borderTop: `1px solid ${gold}12`, paddingTop: '0.75rem', color: muted, fontSize: '15px', lineHeight: 1.55 }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </div>

            <section style={{ ...sectionStyle, marginTop: '1.25rem' }}>
              <div style={eyebrowStyle}>PATRON NOTE</div>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {kit.patronNote.map((paragraph) => (
                  <p key={paragraph} style={{ color: ivory85, fontSize: '17px', lineHeight: 1.75, margin: 0 }}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>

            <section style={{ ...sectionStyle, marginTop: '1.25rem' }}>
              <div style={eyebrowStyle}>LOCAL DRAFT FILES</div>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {kit.docs.map((doc) => (
                  <div key={doc.path} style={{ borderTop: `1px solid ${gold}12`, paddingTop: '0.75rem' }}>
                    <div style={{ color: parchment, fontSize: '16px', marginBottom: '0.25rem' }}>{doc.label}</div>
                    <div style={{ color: muted, fontSize: '13px', lineHeight: 1.5, wordBreak: 'break-word' }}>{doc.path}</div>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${gold}12`, paddingTop: '0.75rem' }}>
                  <div style={{ color: parchment, fontSize: '16px', marginBottom: '0.25rem' }}>QR asset</div>
                  <div style={{ color: muted, fontSize: '13px', lineHeight: 1.5, wordBreak: 'break-word' }}>
                    /Users/christaylor/society-of-explorers/public/images/92b-window-qr.svg
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

const eyebrowStyle: CSSProperties = {
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.22em',
  color: gold,
  marginBottom: '0.75rem',
};

const sectionStyle: CSSProperties = {
  background: panel,
  border,
  padding: '1.5rem',
};

const signPreviewStyle: CSSProperties = {
  border: `2px solid ${gold}66`,
  padding: 'clamp(1.25rem, 4vw, 2.75rem)',
  minHeight: '720px',
  background: 'radial-gradient(circle at 50% 12%, rgba(201,168,76,0.18), transparent 34%), #050505',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  textAlign: 'center',
};
