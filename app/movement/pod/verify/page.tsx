'use client';

import { useState, type CSSProperties } from 'react';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import {
  verifyPodExportText,
  type PodExportVerificationResult,
  type PodExportVerificationStatus,
} from '@/lib/movement/podExportVerification';

const gold = '#c9a84c';
const parchment = '#f5f0e8';
const ivory75 = 'rgba(245,240,232,0.75)';
const muted = '#888';
const card = '#0d0d0d';
const border = '1px solid rgba(201,168,76,0.15)';

export default function PodVerifyPage() {
  const [rawJson, setRawJson] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PodExportVerificationResult>({
    status: 'idle',
    title: 'Awaiting pod artifact',
    detail: 'Paste an exported pod or seal receipt JSON to verify it locally.',
  });

  async function verify() {
    setChecking(true);
    try {
      setResult(await verifyPodExportText(rawJson));
    } finally {
      setChecking(false);
    }
  }

  const resultColor = statusColor(result.status);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' }}>
      <PublicNav />

      <main style={{ maxWidth: '940px', margin: '0 auto', padding: '8rem 2rem 6rem' }}>
        <header style={{ textAlign: 'center', marginBottom: '2.25rem' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.3em', color: gold, marginBottom: '1.25rem' }}>
            POD VERIFIER
          </div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px, 6vw, 52px)', fontStyle: 'italic', fontWeight: 400, lineHeight: 1.12, margin: '0 0 1.25rem' }}>
            Trust the ciphertext.
          </h1>
          <p style={{ fontSize: '18px', lineHeight: 1.75, color: ivory75, maxWidth: '640px', margin: '0 auto' }}>
            Verify a Society of Explorers pod export or seal receipt in your browser. The file is not uploaded; hashes are recomputed locally.
          </p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1rem', alignItems: 'stretch' }}>
          <div style={{ background: card, border, padding: '1.25rem', minHeight: '390px' }}>
            <label htmlFor="pod-json" style={labelStyle}>
              POD EXPORT OR RECEIPT JSON
            </label>
            <textarea
              id="pod-json"
              value={rawJson}
              onChange={(event) => setRawJson(event.target.value)}
              placeholder='{"kind":"society-of-explorers.encrypted-pod", ...}'
              spellCheck={false}
              style={textareaStyle}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <button onClick={verify} disabled={checking || rawJson.trim().length === 0} style={buttonStyle(checking || rawJson.trim().length === 0)}>
                {checking ? 'VERIFYING' : 'VERIFY JSON'}
              </button>
              <a href="/movement/pod" style={linkButtonStyle}>
                BACK TO POD
              </a>
            </div>
          </div>

          <aside style={{ background: '#111', border, padding: '1.25rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.22em', color: gold, marginBottom: '0.75rem' }}>
              RESULT
            </div>
            <div style={{ color: resultColor, fontFamily: 'Playfair Display, serif', fontSize: '28px', lineHeight: 1.1, marginBottom: '0.85rem' }}>
              {result.title}
            </div>
            <p style={{ color: ivory75, fontSize: '15px', lineHeight: 1.65, margin: 0 }}>
              {result.detail}
            </p>

            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.25rem' }}>
              <ProofRow label="EXPECTED" value={result.expectedHash || 'Not available'} />
              <ProofRow label="COMPUTED" value={result.computedHash || 'Not computed'} />
              <ProofRow label="CUSTODY" value={result.custody || 'Unknown'} />
              <ProofRow label="ATTESTATION" value={result.attestation || 'Unknown'} />
            </div>
          </aside>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

function statusColor(status: PodExportVerificationStatus): string {
  switch (status) {
    case 'valid':
      return '#9ddfbd';
    case 'mismatch':
    case 'invalid':
      return '#e17f7f';
    case 'incomplete':
      return '#dfc56f';
    default:
      return parchment;
  }
}

function ProofRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderTop: '1px solid rgba(201,168,76,0.12)', paddingTop: '0.7rem' }}>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.18em', color: gold, marginBottom: '0.35rem' }}>
        {label}
      </div>
      <div style={{ color: muted, fontSize: '13px', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
        {value}
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.22em',
  color: gold,
  marginBottom: '0.75rem',
};

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: '280px',
  resize: 'vertical',
  border,
  background: '#080808',
  color: parchment,
  padding: '1rem',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '13px',
  lineHeight: 1.55,
  outline: 'none',
  boxSizing: 'border-box',
};

function buttonStyle(disabled: boolean): CSSProperties {
  return {
    height: '44px',
    border: 'none',
    background: gold,
    color: '#0a0a0a',
    fontFamily: 'Cinzel, serif',
    fontSize: '9px',
    letterSpacing: '0.16em',
    padding: '0 18px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
  };
}

const linkButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '44px',
  border,
  background: 'transparent',
  color: gold,
  fontFamily: 'Cinzel, serif',
  fontSize: '9px',
  letterSpacing: '0.16em',
  padding: '0 16px',
  textDecoration: 'none',
};
