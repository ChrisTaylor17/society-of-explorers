'use client';
import { useState } from 'react';

interface Thinker {
  id: string;
  name: string;
  symbol: string;
  color: string;
  title: string;
  greeting: string;
}

const COUNCIL: Thinker[] = [
  { id: 'socrates', name: 'Socrates', symbol: 'Σ', color: '#C9A94E', title: 'The Questioner', greeting: 'I find the assumption you\'re afraid to test — then we dismantle it together.' },
  { id: 'plato', name: 'Plato', symbol: 'Π', color: '#7B68EE', title: 'The Architect', greeting: 'I see the ideal form of what you\'re building — and help you close the gap.' },
  { id: 'nietzsche', name: 'Nietzsche', symbol: 'N', color: '#DC143C', title: 'The Provocateur', greeting: 'I name the bold version you\'re afraid to commit to — then offer to build it.' },
  { id: 'aurelius', name: 'Marcus Aurelius', symbol: 'M', color: '#8B7355', title: 'The Commander', greeting: 'I cut everything that doesn\'t matter and hand you the one thing that does.' },
  { id: 'einstein', name: 'Einstein', symbol: 'E', color: '#4169E1', title: 'The Reframer', greeting: 'I look at your problem from a direction you haven\'t tried — and it becomes simple.' },
  { id: 'steve-jobs', name: 'Steve Jobs', symbol: 'J', color: '#A0A0A0', title: 'The Editor', greeting: 'I tell you what to cut. Then I make what remains insanely great.' },
];

interface SalonOnboardingProps {
  onSelectThinker: (thinkerId: string) => void;
  memberName?: string;
}

export default function SalonOnboarding({ onSelectThinker, memberName }: SalonOnboardingProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);

  const gold = '#c9a84c';

  function handleSelect(id: string) {
    setSelectedId(id);
    setExiting(true);
    // Store that they've completed onboarding
    if (typeof window !== 'undefined') {
      localStorage.setItem('soe_onboarding_complete', 'true');
    }
    setTimeout(() => onSelectThinker(id), 1200);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: '#000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: exiting ? 0 : 1,
      transition: 'opacity 1s ease-out',
      overflow: 'auto',
      padding: '2rem',
    }}>
      {/* Subtle radial glow */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '600px',
        background: `radial-gradient(circle, ${gold}08 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem', position: 'relative', zIndex: 1 }}>
        <div style={{
          fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.4em',
          color: gold, opacity: 0.5, marginBottom: '1.5rem',
        }}>
          SOCIETY OF EXPLORERS
        </div>
        <h1 style={{
          fontFamily: 'Cinzel, serif', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
          fontWeight: 300, letterSpacing: '0.12em', color: '#f5f0e8',
          marginBottom: '1.5rem', lineHeight: 1.3,
        }}>
          {memberName && !memberName.startsWith('0x')
            ? `Welcome, ${memberName}`
            : 'You Have Entered'}
        </h1>
        <p style={{
          fontFamily: 'Cormorant Garamond, serif', fontSize: '1.15rem',
          color: '#9a8f7a', lineHeight: 1.8, maxWidth: '500px', margin: '0 auto',
        }}>
          Six minds await your counsel. Each sees the world through a different lens.
          Choose the one you need most right now.
        </p>
      </div>

      {/* Thinker Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1px',
        maxWidth: '900px',
        width: '100%',
        background: `${gold}15`,
        position: 'relative', zIndex: 1,
      }}>
        {COUNCIL.map((t) => {
          const isHovered = hoveredId === t.id;
          const isSelected = selectedId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              onMouseEnter={() => setHoveredId(t.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                background: isSelected ? `${t.color}18` : (isHovered ? '#0d0d0d' : '#080808'),
                border: 'none',
                padding: '2rem 1.8rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.4s ease',
                outline: 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Symbol */}
              <div style={{
                fontFamily: 'Cinzel, serif', fontSize: '1.8rem',
                color: t.color, opacity: isHovered ? 0.9 : 0.35,
                transition: 'opacity 0.4s ease',
                marginBottom: '0.8rem',
              }}>
                {t.symbol}
              </div>

              {/* Name + Title */}
              <div style={{
                fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.2em',
                color: isHovered ? t.color : '#f5f0e8',
                transition: 'color 0.4s ease',
                marginBottom: '0.3rem',
              }}>
                {t.name.toUpperCase()}
              </div>
              <div style={{
                fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em',
                color: '#6a6050', marginBottom: '1rem',
              }}>
                {t.title.toUpperCase()}
              </div>

              {/* Greeting */}
              <p style={{
                fontFamily: 'Cormorant Garamond, serif', fontSize: '14px',
                color: isHovered ? '#d4c9a8' : '#7a7060',
                lineHeight: 1.7, transition: 'color 0.4s ease',
                margin: 0,
              }}>
                {t.greeting}
              </p>

              {/* Hover accent line */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0,
                width: isHovered ? '100%' : '0%',
                height: '1px', background: t.color,
                transition: 'width 0.5s ease',
              }} />
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <div style={{
        marginTop: '2.5rem',
        fontFamily: 'Cormorant Garamond, serif', fontSize: '0.85rem',
        color: '#5a5040', fontStyle: 'italic',
        position: 'relative', zIndex: 1,
      }}>
        You can speak with all six at any time. This is simply where you begin.
      </div>
    </div>
  );
}
