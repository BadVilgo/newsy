import type { Metadata } from 'next';

// Strona logowania jest komponentem klienckim, a ten nie może eksportować `metadata` -
// dlatego tytuł karty i opis siedzą w layoucie segmentu.
export const metadata: Metadata = {
  title: 'Logowanie',
  description: 'Zaloguj się do newsy.live albo wejdź na gotowe konto demo.',
  alternates: { canonical: '/login' },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
