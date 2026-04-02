'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const TempleScene = dynamic(() => import('@/components/temple/TempleScene'), { ssr: false });

export default function TemplePage() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0A0A0A', overflow: 'hidden', position: 'relative' }}>
      <Suspense fallback={
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', color: '#C9A84C', fontFamily: 'Cinzel, serif', gap: '1rem',
        }}>
          <div style={{ fontSize: '2rem', opacity: 0.3 }}>⬡</div>
          <div style={{ fontSize: '14px', letterSpacing: '4px' }}>ENTERING THE TEMPLE...</div>
        </div>
      }>
        <TempleScene />
      </Suspense>

      {/* HUD overlay */}
      <div style={{
        position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
        fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em',
        color: '#C9A84C', opacity: 0.3, pointerEvents: 'none',
      }}>
        CLICK TO LOOK · WALK TO A THINKER · CLICK THEIR ORB TO SPEAK
      </div>

      {/* Back to Salon */}
      <a href="/salon" style={{
        position: 'absolute', top: '1.5rem', left: '1.5rem',
        fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em',
        color: '#C9A84C', textDecoration: 'none', opacity: 0.5, zIndex: 10,
      }}>
        ← RETURN TO SALON
      </a>
    </div>
  );
}
