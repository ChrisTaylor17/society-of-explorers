import type { MetadataRoute } from 'next';

const siteUrl = 'https://www.societyofexplorers.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/auth/',
        '/book/',
        '/capital/',
        '/dashboard/',
        '/login',
        '/members/',
        '/movement/',
        '/practice/',
        '/salon/',
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
