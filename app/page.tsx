import Link from 'next/link';
import Nav from '@/components/Nav';

// Strona wizytowkowa - w pelni statyczna (brak dostepu do ciasteczek), wiec Next
// prerenderuje ja na etapie builda: szybki LCP i tresc widoczna dla crawlerow.
export default function HomePage() {
  return (
    <main className="container">
      <Nav />

      <section className="hero">
        <span className="hero-badge">
          <span className="pulse-dot" />
          odświeżane codziennie o 8:00
        </span>
        <h1 className="hero-title">
          Najważniejsze newsy na Twoje tematy,
          <br />
          <span className="accent">wybrane przez AI</span>
        </h1>
        <p className="hero-lead">
          Twórz własne tablice tematów, a Gemini każdego ranka wybiera do czterech
          najważniejszych wiadomości z ostatnich 48 godzin - z linkami do źródeł. Bez
          scrollowania dziesięciu portali.
        </p>
        <div className="hero-actions">
          <Link href="/newsy" className="btn btn-primary btn-lg">
            Otwórz Newsy
          </Link>
          <Link href="/o-aplikacji" className="btn btn-lg">
            Jak to działa
          </Link>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <h2 className="feature-title">Tablica tematów</h2>
          <p className="feature-text">
            Dodaj dowolny temat - „giełda Nvidia", „wojna Rosja-Ukraina", „AI". Każdy trafia
            na osobny kafelek, a kolejność ustawiasz strzałkami albo przeciąganiem.
          </p>
        </article>
        <article className="feature-card">
          <h2 className="feature-title">Selekcja przez AI</h2>
          <p className="feature-text">
            Zamiast listy trzydziestu nagłówków dostajesz cztery realnie najważniejsze pozycje
            - reszta to szum, który AI odrzuca.
          </p>
        </article>
        <article className="feature-card">
          <h2 className="feature-title">Zawsze świeże</h2>
          <p className="feature-text">
            Twarde odcięcie: żadnych wiadomości starszych niż 48h, z priorytetem dla ostatniej
            doby. Zakładka „Poprzednie" pokazuje stan tematu z poprzedniego odświeżenia.
          </p>
        </article>
        <article className="feature-card">
          <h2 className="feature-title">Także źródła zagraniczne</h2>
          <p className="feature-text">
            Gdy o niszowym temacie milczą polskie media, aplikacja sięga po wydanie
            amerykańskie - a opisy i tak dostajesz po polsku.
          </p>
        </article>
      </section>

      <div className="footer-note">
        <span className="pulse-dot" />
        auto-odświeżanie codziennie o 8:00
      </div>
    </main>
  );
}
