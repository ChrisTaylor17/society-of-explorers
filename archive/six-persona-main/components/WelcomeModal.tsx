'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';

type WelcomeModalProps = {
  displayName: string;
  onEnterSalon: () => void;
  onDismiss: () => void;
};

type ParticleConfig = {
  id: number;
  left: string;
  top: string;
  size: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
  opacity: number;
};

function createParticles(): ParticleConfig[] {
  return [
    { id: 1, left: '12%', top: '18%', size: 4, duration: 11, delay: 0.2, driftX: 10, driftY: -14, opacity: 0.22 },
    { id: 2, left: '24%', top: '72%', size: 3, duration: 13, delay: 1.1, driftX: -8, driftY: -18, opacity: 0.18 },
    { id: 3, left: '78%', top: '16%', size: 5, duration: 12, delay: 0.5, driftX: -12, driftY: 10, opacity: 0.24 },
    { id: 4, left: '84%', top: '74%', size: 4, duration: 14, delay: 1.8, driftX: 8, driftY: -12, opacity: 0.2 },
    { id: 5, left: '52%', top: '12%', size: 3, duration: 10, delay: 0.7, driftX: 12, driftY: 12, opacity: 0.16 },
    { id: 6, left: '10%', top: '48%', size: 2, duration: 15, delay: 1.3, driftX: 10, driftY: -8, opacity: 0.14 },
    { id: 7, left: '88%', top: '46%', size: 3, duration: 16, delay: 0.9, driftX: -10, driftY: 8, opacity: 0.17 },
    { id: 8, left: '60%', top: '82%', size: 4, duration: 12, delay: 1.5, driftX: -9, driftY: -10, opacity: 0.21 },
    { id: 9, left: '38%', top: '30%', size: 2, duration: 11, delay: 0.4, driftX: 7, driftY: -7, opacity: 0.13 },
    { id: 10, left: '68%', top: '58%', size: 3, duration: 13, delay: 1.9, driftX: -7, driftY: 9, opacity: 0.15 },
  ];
}

export default function WelcomeModal({ displayName, onEnterSalon, onDismiss }: WelcomeModalProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const ctaButtonRef = useRef<HTMLButtonElement | null>(null);
  const particlesRef = useRef<ParticleConfig[]>(createParticles());

  const safeDisplayName = useMemo(() => {
    const trimmed = displayName.trim();
    return trimmed.length > 0 ? trimmed : 'Explorer';
  }, [displayName]);

  const handleOverlayClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) onDismiss();
  }, [onDismiss]);

  const handleEscapeKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscapeKey);
    if (ctaButtonRef.current) ctaButtonRef.current.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [handleEscapeKey]);

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} tabIndex={-1} style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,5,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflow: 'hidden' }}>
      <style>{`
        @keyframes welcomeModalFadeScale { 0% { opacity: 0; transform: translateY(8px) scale(0.95); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes welcomeGoldLineExpand { 0% { width: 0px; opacity: 0; } 100% { width: 60px; opacity: 1; } }
        @keyframes welcomeButtonGlow { 0% { box-shadow: 0 0 18px rgba(201,168,76,0.10); } 50% { box-shadow: 0 0 34px rgba(201,168,76,0.22); } 100% { box-shadow: 0 0 18px rgba(201,168,76,0.10); } }
        @keyframes welcomeParticleFloat { 0% { transform: translate3d(0,0,0) scale(1); opacity: 0; } 15% { opacity: 1; } 50% { transform: translate3d(var(--drift-x), calc(var(--drift-y)*0.45), 0) scale(1.08); } 100% { transform: translate3d(calc(var(--drift-x)*0.4), var(--drift-y), 0) scale(0.96); opacity: 0; } }
      `}</style>

      {/* Floating particles */}
      {particlesRef.current.map((p) => (
        <div key={p.id} aria-hidden="true" style={{
          position: 'absolute', left: p.left, top: p.top,
          width: `${p.size}px`, height: `${p.size}px`,
          borderRadius: '999px', background: '#c9a84c',
          opacity: p.opacity, pointerEvents: 'none',
          boxShadow: '0 0 14px rgba(201,168,76,0.24)',
          ['--drift-x' as string]: `${p.driftX}px`,
          ['--drift-y' as string]: `${p.driftY}px`,
          animation: `welcomeParticleFloat ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
        }} />
      ))}

      {/* Modal card */}
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-modal-title" style={{
        width: 'calc(100% - 32px)', maxWidth: '520px',
        background: '#0d0d0d', border: '1px solid rgba(201,168,76,0.2)',
        borderRadius: '24px', padding: '40px 32px',
        boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
        position: 'relative',
        animation: 'welcomeModalFadeScale 400ms ease-out forwards',
        textAlign: 'center',
      }}>
        {/* Label */}
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.25em', color: '#c9a84c', marginBottom: '24px', textTransform: 'uppercase' }}>
          Welcome, Explorer
        </div>

        {/* Gold line */}
        <div aria-hidden="true" style={{ width: '0px', height: '1px', background: '#c9a84c', margin: '0 auto 28px', animation: 'welcomeGoldLineExpand 600ms ease-out 200ms forwards' }} />

        {/* Heading */}
        <h2 id="welcome-modal-title" style={{ margin: '0 0 16px', color: '#f5f0e8', fontFamily: 'Cinzel, serif', fontSize: 'clamp(32px, 7vw, 44px)', lineHeight: 1.05, fontWeight: 300, letterSpacing: '0.04em' }}>
          Your Salon Awaits
        </h2>

        {/* Personal greeting */}
        <div style={{ marginBottom: '8px', color: 'rgba(245,240,232,0.85)', fontFamily: 'Cormorant Garamond, serif', fontSize: '22px', lineHeight: 1.4, fontStyle: 'italic' }}>
          Socrates has been expecting you, {safeDisplayName}.
        </div>

        {/* Subtext */}
        <p style={{ margin: '0 auto 36px', maxWidth: '420px', color: '#888', fontFamily: 'Cormorant Garamond, serif', fontSize: '17px', lineHeight: 1.7 }}>
          Step inside and begin your first conversation with one of history&apos;s greatest minds. He already knows a bit about you.
        </p>

        {/* CTA */}
        <button
          ref={ctaButtonRef}
          type="button"
          autoFocus
          onClick={onEnterSalon}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#d4b45a'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#c9a84c'; }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(1px) scale(0.995)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; }}
          style={{
            width: '100%', maxWidth: '340px', height: '52px',
            background: '#c9a84c', color: '#0a0a0a', border: 'none',
            borderRadius: '14px', fontFamily: 'Cinzel, serif', fontSize: '11px',
            letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer',
            boxShadow: '0 0 30px rgba(201,168,76,0.15)',
            transition: 'background 180ms ease, transform 180ms ease',
            animation: 'welcomeButtonGlow 2.8s ease-in-out infinite',
          }}
        >
          Enter the Salon
        </button>

        {/* Dismiss */}
        <button
          type="button"
          onClick={onDismiss}
          style={{
            marginTop: '16px', background: 'transparent', border: 'none',
            padding: 0, color: '#888', fontFamily: 'Cormorant Garamond, serif',
            fontSize: '15px', cursor: 'pointer', opacity: 0.7,
            display: 'block', margin: '16px auto 0',
          }}
        >
          I&apos;ll explore on my own
        </button>
      </div>
    </div>
  );
}
