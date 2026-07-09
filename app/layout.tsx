import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Newsy — tablica tematów',
  description: 'Dashboard z najważniejszymi wiadomościami z ostatnich 24/48h dla wybranych tematów.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
