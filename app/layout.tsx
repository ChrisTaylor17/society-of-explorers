import type { Metadata, Viewport } from 'next'
import { SITE_DESCRIPTION } from '@/lib/site/shareCard'
import Script from 'next/script'
import '@fontsource/cinzel/latin-400.css'
import '@fontsource/cinzel/latin-500.css'
import '@fontsource/cinzel/latin-600.css'
import '@fontsource/cormorant-garamond/latin-300.css'
import '@fontsource/cormorant-garamond/latin-300-italic.css'
import '@fontsource/cormorant-garamond/latin-400.css'
import '@fontsource/cormorant-garamond/latin-400-italic.css'
import '@fontsource/cormorant-garamond/latin-500.css'
import '@fontsource/cormorant-garamond/latin-600.css'
import '@fontsource/eb-garamond/latin-400.css'
import '@fontsource/eb-garamond/latin-400-italic.css'
import '@fontsource/eb-garamond/latin-500.css'
import '@fontsource/playfair-display/latin-400.css'
import '@fontsource/playfair-display/latin-500.css'
import '@fontsource/playfair-display/latin-600.css'
import './globals.css'
import { Providers } from '@/components/shared/Providers'
import ServiceWorkerRegistration from './components/ServiceWorkerRegistration'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.societyofexplorers.com'),
  title: {
    default: 'Society of Explorers',
    template: '%s | Society of Explorers',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'Society of Explorers',
  openGraph: {
    siteName: 'Society of Explorers',
    type: 'website',
    locale: 'en_US',
    title: 'Society of Explorers',
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Society of Explorers',
    description: SITE_DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#c9a84c',
  colorScheme: 'dark',
}

const walletExtensionErrorGuard = `
(function () {
  function isWalletExtensionEthereumError(event) {
    var message = String(event && (event.message || (event.error && event.error.message)) || '');
    var filename = String(event && event.filename || '');
    return message.indexOf('Cannot redefine property: ethereum') !== -1 && filename.indexOf('chrome-extension://') === 0;
  }

  window.addEventListener('error', function (event) {
    if (isWalletExtensionEthereumError(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return false;
    }
  }, true);
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="Society of Explorers" />
      </head>
      <body>
        {process.env.NODE_ENV === 'development' && (
          <Script
            id="wallet-extension-error-guard"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{ __html: walletExtensionErrorGuard }}
          />
        )}
        <script dangerouslySetInnerHTML={{ __html: "if(!window.location.hash){window.scrollTo(0,0)}" }} />
        <Providers>{children}</Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
