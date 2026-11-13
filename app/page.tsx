import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ReadOnlyBox from '@/components/ReadOnlyBox';
import { ArrowRightIcon } from '@/components/icons';
import { boxesWithNews, fetchDemoBoxes } from '@/lib/demo';

// Strona wizytówkowa jest prerenderowana (brak dostępu do ciasteczek): szybki LCP i treść
// widoczna dla crawlerów. Podgląd kafelków pochodzi z konta demo i odświeża się przez ISR -
// najwyżej raz na 15 minut, niezależnie od liczby wejść.
export const revalidate = 900;

// Ile kafelków z tablicy demo pokazujemy na stronie głównej.
const PREVIEW_COUNT = 2;

export default async function HomePage() {
  const preview = boxesWithNews(await fetchDemoBoxes()).slice(0, PREVIEW_COUNT);

  return (
    <main className="container">
      <Nav />

      <section className="hero">
        <span className="hero-badge">
          <span className="pulse-dot" aria-hidden="true" />
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
          <Link href="/demo" className="btn btn-primary btn-lg">
            Zobacz demo
          </Link>
          <Link href="/o-aplikacji" className="btn btn-lg">
            Jak to działa
          </Link>
        </div>
      </section>

      {/* Prawdziwe kafelki z konta demo. Gdy danych nie da się pobrać, sekcja po prostu znika. */}
      {preview.length > 0 && (
        <section className="preview" aria-labelledby="preview-title">
          <div className="preview-head">
            <div>
              <h2 id="preview-title" className="preview-title">
                Tak wygląda tablica dziś
              </h2>
              <p className="preview-sub">
                Prawdziwe dane z konta demo, bez logowania. Kliknij „Źródła", żeby przejść do
                artykułów.
              </p>
            </div>
            <Link href="/demo" className="preview-link">
              Cała tablica demo
              <ArrowRightIcon />
            </Link>
          </div>
          <div className="preview-grid">
            {preview.map((box) => (
              <ReadOnlyBox key={box.id} box={box} headingLevel={3} />
            ))}
          </div>
        </section>
      )}

      <section className="feature-grid" aria-label="Najważniejsze funkcje">
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

      <Footer />
    </main>
  );
}
