import Link from 'next/link';
import { currentUsername } from '@/lib/currentUsername';
import Nav from '@/components/Nav';

export default async function HomePage() {
  const username = await currentUsername();

  return (
    <main className="container">
      <Nav username={username} />

      <section className="hero">
        <span className="hero-badge">
          <span className="pulse-dot" />
          odświeżane codziennie rano
        </span>
        <h1 className="hero-title">
          Najważniejsze newsy na Twoje tematy,
          <br />
          <span className="accent">wybrane przez AI</span>
        </h1>
        <p className="hero-lead">
          Twórz własne tablice tematów, a Gemini każdego ranka wybiera 4 najważniejsze
          wiadomości z ostatnich godzin - z linkami do źródeł. Bez scrollowania dziesięciu
          portali.
        </p>
        <div className="hero-actions">
          <Link href="/newsy" className="btn btn-primary btn-lg">
            Otwórz Newsy
          </Link>
          <Link href="/newsy-2" className="btn btn-lg">
            Wypróbuj Newsy 2 (RSS)
          </Link>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <h2 className="feature-title">Tablica tematów</h2>
          <p className="feature-text">
            Dodaj dowolny temat - „giełda Nvidia", „wojna Rosja-Ukraina", „AI". Każdy trafia
            na osobny kafelek, kolejność ustawiasz przeciąganiem.
          </p>
        </article>
        <article className="feature-card">
          <h2 className="feature-title">Selekcja przez AI</h2>
          <p className="feature-text">
            Zamiast listy 50 nagłówków dostajesz 4 realnie najważniejsze pozycje - reszta to
            szum, który AI odrzuca.
          </p>
        </article>
        <article className="feature-card">
          <h2 className="feature-title">24h i dzień wcześniej</h2>
          <p className="feature-text">
            Każdy kafelek ma zakładki: co nowego w ostatniej dobie i jak wyglądało to samo
            wczoraj - łatwo śledzić rozwój tematu.
          </p>
        </article>
        <article className="feature-card">
          <h2 className="feature-title">Dwie wersje silnika</h2>
          <p className="feature-text">
            Ten sam temat w dwóch wariantach: wyszukiwanie Gemini (Newsy) oraz Google News RSS
            z silnikiem w Pythonie (Newsy 2). Porównaj sam.
          </p>
        </article>
      </section>

      <div className="footer-note">
        <span className="pulse-dot" />
        auto-odświeżanie codziennie rano
      </div>
    </main>
  );
}
