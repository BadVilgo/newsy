import type { Metadata, Viewport } from 'next';
import Providers from '@/components/Providers';
import './globals.css';

const SITE_URL = 'https://newsy-nine.vercel.app';
const DESCRIPTION =
  'Dashboard, który dla wybranych tematów wybiera przez AI najważniejsze wiadomości z ostatnich 48 godzin - z własnymi opisami po polsku i linkami do źródeł, odświeżane codziennie o 8:00.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'newsy.live - tablica najważniejszych newsów',
    template: '%s · newsy.live',
  },
  description: DESCRIPTION,
  applicationName: 'newsy.live',
  keywords: [
    'newsy',
    'dashboard newsów',
    'agregator wiadomości',
    'AI',
    'Gemini',
    'Google News RSS',
    'Next.js',
    'Supabase',
    'Python',
    'FastAPI',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pl_PL',
    url: SITE_URL,
    siteName: 'newsy.live',
    title: 'newsy.live - tablica najważniejszych newsów',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'newsy.live - tablica najważniejszych newsów',
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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
