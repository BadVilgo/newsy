import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ReadOnlyBox from '@/components/ReadOnlyBox';
import { boxesWithNews, fetchDemoBoxes } from '@/lib/demo';

export const metadata: Metadata = {
  title: 'Demo',
  description:
    'Podgląd tablicy newsy.live bez logowania - prawdziwe tematy konta demo z newsami wybranymi przez AI, odświeżane codziennie o 8:00.',
  alternates: { canonical: '/demo' },
};

// Publiczny podgląd tablicy konta demo. Strona jest prerenderowana i odświeżana przez ISR
// (najwyżej raz na 15 minut), więc wejścia odwiedzających nie obciążają bazy.
export const revalidate = 900;

export default async function DemoPage() {
  // Temat bez newsów (świeżo dodany albo z cichego dnia) nic by tu nie pokazał - pomijamy go.
  const boxes = boxesWithNews(await fetchDemoBoxes());

  return (
    <main className="container">
      <Nav />

      <div className="demo-intro">
        <span className="hero-badge">
          <span className="pulse-dot" aria-hidden="true" />
          demo na żywo
        </span>
        <h1 className="demo-title">Tablica tematów konta demo</h1>
        <p className="page-note">
          To prawdziwe dane: tematy konta demo z newsami wybranymi dziś przez AI. Podgląd jest
          tylko do odczytu. Żeby dodawać własne tematy, zmieniać ich kolejność i odświeżać
          newsy,{' '}
          <Link href="/login">zaloguj się na konto demo</Link> albo załóż własne.
        </p>
      </div>

      {boxes.length > 0 ? (
        <div className="box-grid">
          {boxes.map((box) => (
            <div key={box.id} className="grid-item">
              <ReadOnlyBox box={box} />
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p className="empty-title">Podgląd jest chwilowo niedostępny</p>
          <p className="empty-sub">
            Nie udało się pobrać tablicy demo. Możesz zalogować się na konto demo i zobaczyć ją
            w pełnej wersji.
          </p>
          <Link href="/login" className="btn btn-primary btn-lg">
            Przejdź do logowania
          </Link>
        </div>
      )}

      <Footer />
    </main>
  );
}
