import type { MetadataRoute } from 'next';

const siteUrl = 'https://www.societyofexplorers.com';

const publicRoutes: Array<{
  path: string;
  changeFrequency: 'weekly' | 'monthly';
  priority: number;
}> = [
  { path: '', changeFrequency: 'weekly', priority: 1 },
  { path: '/join', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/92b/fund', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/92b', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/movement', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/manifesto', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/vision', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/tribekey', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/three-pillars', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/roadmap', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/transparency', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/salons', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/projects', changeFrequency: 'weekly', priority: 0.6 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
