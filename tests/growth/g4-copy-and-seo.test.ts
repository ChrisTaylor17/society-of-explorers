// G4: honest copy, pricing visible without JavaScript, /join metadata and
// structured data never turns a proposed offer into an available purchase.
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TIERS, FREE_SIGNUP_PATH, checkoutErrorMessage } from '../../lib/join/content';
import { membershipOffersJsonLd, serializeJsonLd } from '../../lib/join/structuredData';
import { modeFromSearch } from '../../lib/auth/loginForm';

const root = join(import.meta.dir, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mdx?)$/.test(name)) out.push(p);
  }
  return out;
}

test('G4a no unverified popularity claims in app copy', () => {
  const hits = [...walk(join(root, 'app')), ...walk(join(root, 'components')), ...walk(join(root, 'lib'))]
    .filter((f) => /most popular|best[- ]selling/i.test(readFileSync(f, 'utf8')));
  expect(hits.map((f) => f.slice(root.length))).toEqual([]);
});

test('G4b displayed prices are the intended ones', () => {
  const byId = Object.fromEntries(TIERS.map((t) => [t.id, t.price + t.period]));
  expect(byId).toEqual({ explorer: 'Free', supporter: '$10/mo' });
  expect(TIERS.flatMap(tier => tier.features).join(' ')).not.toMatch(/unlimited|forever|priority|governance|earn.*token/i);
});

test('G4c pricing and FAQ are not hidden until JavaScript runs', () => {
  const page = read('app/join/page.tsx');
  expect(page).not.toContain('data-fade');
  expect(page).not.toMatch(/opacity: 0,/);
});

test('G4d /join has its own title, description and canonical without unverified Offer JSON-LD', () => {
  const layout = read('app/join/layout.tsx');
  expect(layout).toContain("title: 'Free community and optional support'");
  expect(layout).toContain("canonical: '/join'");
  expect(layout).toContain('application/ld+json');
  const ld = membershipOffersJsonLd();
  expect(ld['@type']).toBe('WebPage');
  expect(JSON.stringify(ld)).not.toMatch(/InStock|Offer|Product|aggregateRating|review/i);
  expect(serializeJsonLd({ a: '</script>' })).not.toContain('</script>');
});

test('G4e free sign-up opens create-account mode and lands on the Daily Practice', () => {
  const u = new URL(FREE_SIGNUP_PATH, 'http://x');
  expect(u.pathname).toBe('/login');
  expect(u.searchParams.get('mode')).toBe('signup');
  expect(u.searchParams.get('next')).toBe('/practice');
  // The mode check moved into lib/auth/loginForm (G10); assert it behaviorally.
  expect(modeFromSearch(u.search)).toBe('signup');
  expect(read('app/login/page.tsx')).toContain("modeFromSearch(window.location.search) === 'signup'");
  expect(read('app/HomePageClient.tsx')).toContain('href={FREE_SIGNUP_PATH}');
});

test('G4f checkout error copy is specific and never claims a charge', () => {
  for (const status of [401, 403, 409, 429, 502, 503]) expect(checkoutErrorMessage(status)).not.toMatch(/Nothing was charged|not changed|payment went through/i);
  expect(checkoutErrorMessage(409)).toContain('Load current billing status');
  expect(checkoutErrorMessage(503, 'sales_closed')).toContain('Existing subscription management');
});

test('G4g post-checkout welcome is shown on both salon views and tracked', () => {
  const salon = read('app/salon/page.tsx');
  expect(salon.match(/<CheckoutWelcome \/>/g)?.length).toBe(2);
  expect(read('components/CheckoutWelcome.tsx')).toContain("track('checkout_welcome_view')");
});
