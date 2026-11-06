'use client';

import { useRef, useState } from 'react';
import { circleInviteHref } from '@/lib/circles/invite';
import { button, small } from '@/lib/circles/ui';

export default function CircleInviteShare({ id, title, disabled }: { id: string; title: string; disabled: boolean }) {
  const sharing = useRef(false);
  const [fallback, setFallback] = useState('');
  const [notice, setNotice] = useState('');
  async function share() {
    if (disabled || sharing.current) return;
    sharing.current = true;
    setFallback('');
    setNotice('');
    const url = new URL(circleInviteHref(id), window.location.origin).href;
    try {
      if (typeof navigator.share === 'function') await navigator.share({ title, url });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setNotice('Salon invitation copied.');
      } else setFallback(url);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setFallback(url);
    } finally { sharing.current = false; }
  }
  return <>
    <button type="button" style={button} disabled={disabled} onClick={() => void share()}>Share salon invitation</button>
    {notice && <p role="status" style={small}>{notice}</p>}
    {fallback && <label style={small}>Copy the salon invitation
      <input readOnly value={fallback} onFocus={event => event.currentTarget.select()} style={{ width: '100%', minHeight: '2.75rem' }}/>
    </label>}
  </>;
}
