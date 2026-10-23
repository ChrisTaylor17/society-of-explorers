// G4: honest copy, pricing visible without JavaScript, /join metadata and
// structured data built from the same prices the page shows.
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TIERS, FREE_SIGNUP_PATH, checkoutErrorMessage } from '../../lib/join/content';
import { membershipOffersJsonLd, serializeJsonLd } from '../../lib/join/structuredData';

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
  expect(byId).toEqual({ explorer: 'Free', seeker: '$19/mo', scholar: '$49/mo', philosopher: '$99/mo', oracle: '$499 lifetime' });
});

test('G4c pricing and FAQ are not hidden until JavaScript runs', () => {
  const page = read('app/join/page.tsx');
  expect(page).not.toContain('data-fade');
  expect(page).not.toMatch(/opacity: 0,/);
});

test('G4d /join has its own title, description, canonical and Offer JSON-LD', () => {
  const layout = read('app/join/layout.tsx');
  expect(layout).toContain("title: 'Membership and Pricing'");
  expect(layout).toContain("canonical: '/join'");
  expect(layout).toContain('application/ld+json');
  const ld = membershipOffersJsonLd();
  expect(ld.offers.map((o: any) => [o.name, o.price])).toEqual([
    ['Explorer', '0'], ['Seeker', '19'], ['Scholar', '49'], ['Philosopher', '99'], ['Oracle', '499'],
  ]);
  expect(ld.offers.filter((o: any) => o.priceSpecification).length).toBe(3);
  expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|review/i);
  expect(serializeJsonLd({ a: '</script>' })).not.toContain('</script>');
});

test('G4e free sign-up opens create-account mode and lands on the Daily Practice', () => {
  const u = new URL(FREE_SIGNUP_PATH, 'http://x');
  expect(u.pathname).toBe('/login');
  expect(u.searchParams.get('mode')).toBe('signup');
  expect(u.searchParams.get('next')).toBe('/practice');
  expect(read('app/login/page.tsx')).toContain("get('mode') === 'signup'");
  expect(read('app/page.tsx')).toContain('href={FREE_SIGNUP_PATH}');
});

test('G4f checkout error copy is specific and never claims a charge', () => {
  expect(checkoutErrorMessage(503, 'checkout_unconfigured')).toContain('Nothing was charged');
  expect(checkoutErrorMessage(409, 'email_required')).toContain('email');
  expect(checkoutErrorMessage(502, 'checkout_failed')).toContain('not changed');
});

test('G4g post-checkout welcome is shown on both salon views and tracked', () => {
  const salon = read('app/salon/page.tsx');
  expect(salon.match(/<CheckoutWelcome \/>/g)?.length).toBe(2);
  expect(read('components/CheckoutWelcome.tsx')).toContain("track('checkout_welcome_view')");
});
