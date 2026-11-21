import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '../src/index.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'WishStock — Retail Demand & Inventory',
  description: 'Smart retail demand and inventory management',
};

export const viewport: Viewport = {
  themeColor: '#121b36',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
