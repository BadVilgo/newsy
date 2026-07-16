import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL = 'https://newsy-nine.vercel.app';
const DESCRIPTION =
  'Dashboard, który dla wybranych tematów zbiera przez AI najważniejsze wiadomości z ostatnich 24 i 48 godzin — z linkami do źródeł, odświeżane codziennie rano.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'newsy.live — tablica najważniejszych newsów',
    template: '%s · newsy.live',
  },
  description: DESCRIPTION,
  applicationName: 'newsy.live',
  keywords: ['newsy', 'dashboard newsów', 'agregator wiadomości', 'AI', 'Gemini', 'Next.js', 'Supabase'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pl_PL',
    url: SITE_URL,
    siteName: 'newsy.live',
    title: 'newsy.live — tablica najważniejszych newsów',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'newsy.live — tablica najważniejszych newsów',
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0e131f',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
