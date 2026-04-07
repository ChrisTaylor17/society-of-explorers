import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/shared/Providers'
import ServiceWorkerRegistration from './components/ServiceWorkerRegistration'

export const metadata: Metadata = { title: 'Society of Explorers', description: 'A private salon where great minds converge.' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Cinzel:wght@400;500;600&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Playfair+Display:wght@400;500;600&display=swap" rel="stylesheet"/>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#c9a84c" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="Society of Explorers" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
