import type { Metadata } from 'next';
import { currentUsername } from '@/lib/currentUsername';
import Dashboard from '@/components/Dashboard';

export const metadata: Metadata = {
  title: 'Newsy - tablica tematów',
  description:
    'Wersja 1: najważniejsze newsy wybrane przez Gemini z wyszukiwania w sieci (Google grounding).',
  alternates: { canonical: '/newsy' },
};

export default async function NewsyPage() {
  return <Dashboard username={await currentUsername()} method="search" />;
}
