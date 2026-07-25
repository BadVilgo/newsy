import type { Metadata } from 'next';
import { currentUsername } from '@/lib/currentUsername';
import Dashboard from '@/components/Dashboard';

export const metadata: Metadata = {
  title: 'Newsy 2 - wersja RSS',
  description:
    'Wersja 2: newsy z Google News RSS, selekcja 4 najważniejszych i własne opisy przez Gemini. Silnik w Pythonie (FastAPI).',
  alternates: { canonical: '/newsy-2' },
};

export default async function Newsy2Page() {
  return <Dashboard username={await currentUsername()} method="rss" />;
}
