import { ImageResponse } from 'next/og';
import { SHARE_CARD } from '@/lib/site/shareCard';

// Default link-preview image for every page that does not set its own.
// Rendered at build time from text only: no external fonts or fetches.
export const alt = SHARE_CARD.alt;
export const size = { width: SHARE_CARD.width, height: SHARE_CARD.height };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '80px', background: '#0a0a0a',
          backgroundImage: 'radial-gradient(circle at 85% 20%, rgba(201,168,76,0.25), transparent 55%)',
          color: '#f5f0e8', fontFamily: 'serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 26, letterSpacing: 10, color: '#c9a84c' }}>{SHARE_CARD.eyebrow}</div>
        <div style={{ display: 'flex', fontSize: 76, marginTop: 36, lineHeight: 1.1 }}>{SHARE_CARD.title}</div>
        <div style={{ display: 'flex', fontSize: 34, marginTop: 28, color: '#c8bca6', maxWidth: 940, lineHeight: 1.35 }}>
          {SHARE_CARD.subtitle}
        </div>
        <div style={{ display: 'flex', marginTop: 56, width: 160, height: 4, background: '#c9a84c' }} />
      </div>
    ),
    { ...size },
  );
}
