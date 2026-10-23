// lib/join/structuredData.ts
// schema.org data for /join, built only from the prices shown on the page.
import { TIERS } from './content';

export function membershipOffersJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Society of Explorers membership',
    description: 'Membership in the Society of Explorers: AI thinker councils, seven-week salons and a daily practice.',
    brand: { '@type': 'Organization', name: 'Society of Explorers' },
    offers: TIERS.map((tier) => {
      const amount = tier.price === 'Free' ? '0' : tier.price.replace(/[^0-9.]/g, '');
      const offer: Record<string, unknown> = {
        '@type': 'Offer',
        name: tier.name,
        price: amount,
        priceCurrency: 'USD',
        url: `/join#${tier.id}`,
        availability: 'https://schema.org/InStock',
      };
      if (tier.period === '/mo') {
        offer.priceSpecification = {
          '@type': 'UnitPriceSpecification',
          price: amount,
          priceCurrency: 'USD',
          billingDuration: 'P1M',
          unitText: 'MONTH',
        };
      }
      return offer;
    }),
  };
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so it cannot close the tag. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
