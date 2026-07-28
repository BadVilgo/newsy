import type { Metadata } from 'next';
import Dashboard from '@/components/Dashboard';

export const metadata: Metadata = {
  title: 'Newsy - tablica tematów',
  description:
    'Najważniejsze newsy z ostatnich 48h dla Twoich tematów - zbierane z Google News RSS i wybierane przez Gemini.',
  alternates: { canonical: '/newsy' },
};

export default function NewsyPage() {
  return <Dashboard />;
}
