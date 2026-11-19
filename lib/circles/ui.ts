import type { CSSProperties } from 'react';

// Shared look for the circles pages. Every font size here is 12px or larger.
export const gold = '#c9a84c';
export const parchment = '#f5f0e8';
export const ivory85 = 'rgba(245,240,232,0.85)';
export const muted = '#a89e88';
export const panel = '#0d0d0d';
export const page: CSSProperties = { minHeight: '100vh', background: '#0a0a0a', color: parchment, fontFamily: 'Cormorant Garamond, serif' };
export const main: CSSProperties = { maxWidth: '820px', margin: '0 auto', padding: '7.5rem 1.25rem 5rem' };
export const label: CSSProperties = { fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.2em', color: gold, textTransform: 'uppercase', margin: 0 };
export const h1: CSSProperties = { fontFamily: 'Cinzel, serif', fontSize: 'clamp(28px, 6vw, 42px)', fontWeight: 400, margin: '0.5rem 0 1rem', color: parchment, lineHeight: 1.2 };
export const h2: CSSProperties = { fontFamily: 'Cinzel, serif', fontSize: '15px', letterSpacing: '0.12em', color: gold, margin: '2.5rem 0 0.75rem', fontWeight: 400, textTransform: 'uppercase' };
export const lead: CSSProperties = { fontSize: '19px', lineHeight: 1.6, color: ivory85, margin: '0 0 1.5rem' };
export const body: CSSProperties = { fontSize: '18px', lineHeight: 1.6, color: ivory85, margin: '0 0 1rem' };
export const small: CSSProperties = { fontSize: '15px', lineHeight: 1.5, color: muted, margin: 0 };
export const card: CSSProperties = { background: panel, border: `1px solid ${gold}33`, padding: '18px' };
export const button: CSSProperties = {
  fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '0.12em', padding: '12px 20px', border: `1px solid ${gold}`,
  color: gold, background: 'transparent', textDecoration: 'none', display: 'inline-block', cursor: 'pointer', minHeight: '44px', boxSizing: 'border-box',
};
export const primary: CSSProperties = { ...button, background: gold, color: '#0a0a0a' };
export const input: CSSProperties = {
  width: '100%', background: '#111', border: `1px solid ${gold}55`, padding: '10px 12px', fontFamily: 'Cormorant Garamond, serif',
  fontSize: '17px', color: parchment, boxSizing: 'border-box', minHeight: '44px',
};
export const fieldLabel: CSSProperties = { fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '0.12em', color: gold, display: 'block', marginBottom: '6px' };
