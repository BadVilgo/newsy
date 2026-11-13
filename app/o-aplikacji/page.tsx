import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { REPO_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'O aplikacji',
  description:
    'newsy.live - osobista tablica najważniejszych wiadomości wybieranych przez AI. Zobacz, co możesz zrobić i jak to działa.',
  alternates: { canonical: '/o-aplikacji' },
};

const STACK = [
  'Next.js 15 (App Router)',
  'React 19',
  'TypeScript',
  'TanStack Query',
  'Supabase (Postgres + RLS)',
  'Python + FastAPI',
  'Gemini 2.5 Flash',
  'Vitest + Testing Library',
  'axe',
  'Lighthouse CI',
  'GitHub Actions',
];

export default function AboutPage() {
  return (
    <main className="container">
      <Nav />

      <article className="prose">
        <span className="hero-badge">O aplikacji</span>
        <h1 className="prose-title">Twój poranny briefing zamiast dziesięciu otwartych kart</h1>
        <p className="prose-lead">
          newsy.live to osobista tablica wiadomości. Wpisujesz tematy, które Cię obchodzą, a
          aplikacja codziennie o 8:00 podaje Ci ich esencję -{' '}
          <strong>tylko to, co naprawdę ważne</strong>, wybrane przez sztuczną inteligencję i
          podane z linkami do źródeł.
        </p>

        <h2 className="prose-h2">Co możesz zrobić</h2>
        <ul className="prose-list">
          <li>
            <strong>Zbudować własną tablicę tematów</strong> - dodaj tyle tematów, ile chcesz,
            i ułóż je w wygodnej kolejności strzałkami lub przeciąganiem.
          </li>
          <li>
            <strong>Dostać gotową selekcję</strong> - zamiast przewijać portale, widzisz do
            czterech najważniejszych newsów na każdy temat.
          </li>
          <li>
            <strong>Śledzić rozwój wydarzeń</strong> - przełączasz się między „Najnowsze" a
            „Poprzednie" i od razu widzisz, co doszło od ostatniego odświeżenia.
          </li>
          <li>
            <strong>Dotrzeć do źródła</strong> - każdy news ma odnośniki do oryginalnych
            artykułów, więc jednym kliknięciem czytasz więcej.
          </li>
          <li>
            <strong>Mieć pewność świeżości</strong> - nic starszego niż 48 godzin nie ma prawa
            trafić na tablicę, a pierwszeństwo zawsze mają wiadomości z ostatniej doby.
          </li>
        </ul>

        <h2 className="prose-h2">Jak to działa</h2>
        <ol className="prose-steps">
          <li>
            <span className="step-num">1</span>
            <div>
              <strong>Dodajesz temat.</strong> Cokolwiek - od „spółka Nvidia giełda" po
              „postępy nad agentami AI".
            </div>
          </li>
          <li>
            <span className="step-num">2</span>
            <div>
              <strong>AI zbiera i selekcjonuje.</strong> Aplikacja pobiera świeże doniesienia
              i wybiera z nich do czterech najważniejszych, odrzucając clickbait, poradniki
              i to, co pokazała już wczoraj.
            </div>
          </li>
          <li>
            <span className="step-num">3</span>
            <div>
              <strong>Ty czytasz esencję.</strong> Krótkie, zwięzłe opisy po polsku - z
              linkami, gdy chcesz zgłębić temat.
            </div>
          </li>
        </ol>

        <h2 className="prose-h2">Gdy polskie media milczą</h2>
        <p className="prose-text">
          Przy tematach niszowych bywa, że po polsku nie ma nic świeżego. Aplikacja wtedy nie
          zostawia Cię z pustym kafelkiem: tłumaczy temat na angielskie hasło i{' '}
          <strong>dobiera wiadomości z amerykańskiego wydania</strong> Google News, gdzie baza
          jest znacznie większa. Polskie źródła nigdy przez to nie znikają - obie pule trafiają
          do wyboru razem, a opisy zawsze dostajesz po polsku. Wiadomości z zagranicznych
          serwisów są oznaczone znacznikiem, a link prowadzi do artykułu z jego oryginalnym
          tytułem.
        </p>

        <h2 className="prose-h2">Pod maską</h2>
        <ul className="stack-list" aria-label="Użyte technologie">
          {STACK.map((tech) => (
            <li key={tech} className="stack-chip">
              {tech}
            </li>
          ))}
        </ul>
        <p className="prose-text">
          <strong>Frontend</strong> to Next.js 15 z App Routerem i TypeScript. Strony publiczne
          są prerenderowane (podgląd demo odświeża się przez ISR), a tablica korzysta z TanStack
          Query: usuwanie, edycja i zmiana kolejności tematów są optimistic, więc interfejs
          reaguje od razu i cofa zmianę, gdy serwer odmówi. Kolejność da się zmieniać z
          klawiatury, a przestawianie kafelków animuje View Transitions API. Dostępność pilnują
          testy axe na komponentach i Lighthouse CI na gotowych stronach.
        </p>
        <p className="prose-text">
          <strong>Dane</strong> pochodzą z Google News RSS, a przetwarza je osobny silnik
          napisany w <strong>Pythonie (FastAPI)</strong>: zbiera wiadomości na temat, odsiewa
          wszystko starsze niż 48 godzin, grupuje nagłówki opisujące tę samą historię i pomija
          to, co było już pokazane dzień wcześniej. Potem jednym zapytaniem do Gemini wybiera
          najważniejsze pozycje i pisze do nich własne, polskie opisy. Kontami i bazą zajmuje
          się Supabase z Row Level Security, a codzienne odświeżanie o 8:00 uruchamia GitHub
          Actions.
        </p>
        <p className="prose-text">
          Cały kod, razem z testami i opisem decyzji technicznych, jest{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            publiczny na GitHubie
          </a>
          .
        </p>

        <div className="hero-actions">
          <Link href="/demo" className="btn btn-primary btn-lg">
            Zobacz demo
          </Link>
          <Link href="/kontakt" className="btn btn-lg">
            Kontakt
          </Link>
        </div>
      </article>

      <Footer />
    </main>
  );
}
