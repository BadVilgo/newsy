import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUsername } from '@/lib/currentUsername';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'O aplikacji',
  description:
    'newsy.live - osobista tablica najważniejszych wiadomości wybieranych przez AI. Zobacz, co możesz zrobić i jak to działa.',
  alternates: { canonical: '/o-aplikacji' },
};

export default async function AboutPage() {
  const username = await currentUsername();

  return (
    <main className="container">
      <Nav username={username} />

      <article className="prose">
        <span className="hero-badge">O aplikacji</span>
        <h1 className="prose-title">Twój poranny briefing zamiast dziesięciu otwartych kart</h1>
        <p className="prose-lead">
          newsy.live to osobista tablica wiadomości. Wpisujesz tematy, które Cię obchodzą, a
          aplikacja każdego ranka podaje Ci ich esencję - <strong>tylko to, co naprawdę ważne</strong>,
          wybrane przez sztuczną inteligencję i podane z linkami do źródeł.
        </p>

        <h2 className="prose-h2">Co możesz zrobić</h2>
        <ul className="prose-list">
          <li>
            <strong>Zbudować własną tablicę tematów</strong> - dodaj tyle tematów, ile chcesz,
            i ułóż je w wygodnej kolejności.
          </li>
          <li>
            <strong>Dostać gotową selekcję</strong> - zamiast przewijać portale, widzisz 4
            najważniejsze newsy na każdy temat.
          </li>
          <li>
            <strong>Śledzić rozwój wydarzeń</strong> - przełączasz się między „ostatnie 24h" a
            „dzień wcześniej" i od razu widzisz, co się zmieniło.
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
              <strong>AI zbiera i selekcjonuje.</strong> Aplikacja pobiera kilkadziesiąt
              doniesień i wybiera 4 najważniejsze, odrzucając clickbait i powtórki.
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
        <p className="prose-text">
          Wiadomości pochodzą z Google News RSS, a przetwarza je osobny silnik napisany w{' '}
          <strong>Pythonie (FastAPI)</strong>: zbiera do 30 newsów na temat, odsiewa wszystko
          starsze niż 48 godzin i jednym zapytaniem do Gemini wybiera najważniejsze pozycje oraz
          pisze do nich własne, polskie opisy. Resztą - kontami, bazą i codziennym odświeżaniem -
          zajmuje się aplikacja Next.js.
        </p>

        <div className="hero-actions">
          <Link href="/newsy" className="btn btn-primary btn-lg">
            Przejdź do Newsów
          </Link>
          <Link href="/kontakt" className="btn btn-lg">
            Kontakt
          </Link>
        </div>
      </article>
    </main>
  );
}
