import type { Metadata } from 'next';
import { currentUsername } from '@/lib/currentUsername';
import Dashboard from '@/components/Dashboard';

export const metadata: Metadata = {
  title: 'Newsy - tablica tematów',
  description:
    'Najważniejsze newsy z ostatnich 48h dla Twoich tematów - zbierane z Google News RSS i wybierane przez Gemini.',
  alternates: { canonical: '/newsy' },
};

export default async function NewsyPage() {
  return <Dashboard username={await currentUsername()} />;
}
