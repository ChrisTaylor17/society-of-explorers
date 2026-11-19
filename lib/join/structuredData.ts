// Describe the page without claiming that a Product or Offer is available.
export function membershipOffersJsonLd() {
  return { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Free community and optional support', url: '/join', description: 'Free source editions and reading Circles, with a separate optional supporter plan whose purchase availability must be checked.' };
}
export function serializeJsonLd(value: unknown): string { return JSON.stringify(value).replace(/</g, '\\u003c'); }
