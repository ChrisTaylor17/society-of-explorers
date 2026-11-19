'use client';
// lib/analytics/client.ts
// Fire-and-forget funnel tracking. Never throws, never blocks navigation.
import { isAnalyticsEvent, sanitizeProps, type AnalyticsEventName, type AnalyticsProps } from './events';

export function track(event: AnalyticsEventName, props: AnalyticsProps = {}): void {
  try {
    if (typeof window === 'undefined' || !isAnalyticsEvent(event)) return;
    const payload = JSON.stringify({ event, props: sanitizeProps({ path: window.location.pathname, ...props }) });
    const blob = new Blob([payload], { type: 'application/json' });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/events', blob)) return;
    void fetch('/api/events', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true, credentials: 'omit' }).catch(() => {});
  } catch {
    // analytics must never break the page
  }
}
