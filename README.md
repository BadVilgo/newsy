# Newsy - tablica tematów

[![CI](https://github.com/BadVilgo/newsy/actions/workflows/ci.yml/badge.svg)](https://github.com/BadVilgo/newsy/actions/workflows/ci.yml)
[![Lighthouse CI](https://github.com/BadVilgo/newsy/actions/workflows/lighthouse.yml/badge.svg)](https://github.com/BadVilgo/newsy/actions/workflows/lighthouse.yml)
![Lighthouse 100 / 100 / 100 / 100](https://img.shields.io/badge/Lighthouse-100%20%2F%20100%20%2F%20100%20%2F%20100-brightgreen)

**Demo bez logowania: [newsy-nine.vercel.app/demo](https://newsy-nine.vercel.app/demo)**
(pełna aplikacja: [newsy-nine.vercel.app](https://newsy-nine.vercel.app), konto pokazowe
`test-user` / `test-password`)

Dashboard, na którym użytkownik dodaje "boxy" z obserwowanymi tematami, np. *spółka Nvidia
giełda* albo *postępy nad agentami AI*. Codziennie o 8:00 aplikacja zbiera dla każdego tematu
nagłówki z Google News RSS, a Gemini wybiera z nich 4 najistotniejsze i opisuje je po polsku,
z linkami do źródeł. Nic starszego niż 48 godzin nie trafia na tablicę.

## W skrócie

1. **Full stack w dwóch językach, z sensownym podziałem.** Next.js 15 + TypeScript obsługuje
   UI, konta i bazę, a osobny mikroserwis w Pythonie (FastAPI) całą logikę RSS i AI.
2. **AI liczone co do zapytania.** Jedno wywołanie Gemini na temat na dzień, a często zero:
   odświeżanie pomija tematy bez nowych wiadomości i konta, na które nikt nie zagląda.
3. **Selekcja, która nie powtarza wczorajszego dnia.** Silnik pamięta poprzedni zestaw newsów,
   skleja nagłówki o tym samym wydarzeniu i mówi modelowi, ile redakcji je relacjonuje.
4. **Dostępność i wydajność mierzone automatycznie.** Lighthouse 100/100/100/100 na stronach
   publicznych, audyt axe w testach, pełna obsługa z klawiatury, motyw jasny i ciemny.
5. **142 testy i CI na każdy push.** 100 po stronie TypeScriptu (Vitest, React Testing Library,
   axe) i 42 po stronie Pythona (pytest), do tego typecheck, build i Lighthouse CI.

## Stack

- **Next.js 15 (App Router) + React 19 + TypeScript** - frontend i backend (API routes) w
  jednym repo, jeden deploy. Strony publiczne są prerenderowane statycznie, a `/` i `/demo`
  odświeżają dane przez ISR. Dashboard renderuje się po stronie klienta.
- **TanStack Query** - warstwa danych w dashboardzie: cache, ponowienia i optimistic updates
  przy usuwaniu, edycji i zmianie kolejności tematów.
- **Python 3 + FastAPI** - mikroserwis (`api/rss.py`) z logiką RSS i AI, wdrażany jako funkcja
  serverless na tym samym Vercelu. Warstwa TypeScript tylko go woła i zapisuje wynik.
- **Supabase (Postgres + Auth)** - relacyjna baza z Row Level Security zamiast pilnowania
  dostępu ręcznie w kodzie.
- **Google Gemini 2.5 Flash** - selekcja newsów i opisy. Tłumaczenie samego tematu robi tańszy
  Flash-Lite.
- **Vercel** - deploy z GitHuba, serverless functions dla UI, akcji użytkownika i silnika.
- **GitHub Actions** - codzienne odświeżanie newsów (`scripts/refresh.ts`). Pętla po wszystkich
  boxach nie mieści się w limicie 60 s funkcji serverless na planie Hobby, więc ciężka robota
  dzieje się na runnerze GitHuba.
- **CSS bez frameworka** - zmienne CSS dla dwóch motywów, View Transitions API do animacji.

Nie ma tu Reduxa, GraphQL ani mikroserwisów ponad ten jeden - projekt nie jest na tyle duży,
żeby to miało sens.

## Jak działa silnik newsów

**Podział na dwa języki jest funkcjonalny, nie ozdobny.** Python (`api/rss.py`) odpowiada za
pobranie RSS, filtrowanie, grupowanie i rozmowę z Gemini. TypeScript odpowiada za konta, bazę
i RLS. Logika newsów żyje w jednym pliku, a nie jest rozsmarowana po dwóch stosach.

**Selekcja to jedno wywołanie Gemini.** Model dostaje do 30 wydarzeń (nagłówek, źródło, data,
liczba redakcji), wybiera do 4 najważniejszych i od razu pisze własne polskie opisy. Prompt
wymaga konkretu (kto, co, liczba, data), zakazuje ogólników i każe odrzucać poradniki oraz
zestawienia. Model opiera się wyłącznie na nagłówku: opis z Google News RSS tylko powtarza
tytuł, więc wypadł z promptu i wejście jest krótsze.

**Silnik pamięta poprzedni dzień.** Razem z tematem dostaje wczorajsze newsy. Linki, które
użytkownik już widział, wypadają z puli przed selekcją, a wczorajsze opisy trafiają do promptu
z instrukcją, żeby nie wybierać tego samego wydarzenia bez nowego faktu. Pamięć pochodzi z
tabeli `snapshots`, więc nie wymagała żadnej zmiany w bazie.

**Podobne nagłówki są sklejane w Pythonie, nie przez model.** Ten sam news z pięciu redakcji
zajmowałby pięć z 30 miejsc. Nagłówki są normalizowane (bez znaków diakrytycznych, rdzenie
słów, bez słów pustych) i łączone, gdy mają co najmniej 3 wspólne słowa i podobieństwo
Jaccarda od 0,5. Model widzi jedną linię z dopiskiem "relacjonuje: N źródeł", co jest tanim,
deterministycznym sygnałem wagi, a punkt na tablicy dostaje do 3 źródeł.

**Gdy polskie media milczą, aplikacja sięga po wydanie amerykańskie.** Jeśli świeżych polskich
pozycji jest mniej niż 8, temat jest tłumaczony na angielskie hasło i dobierane jest wydanie
US. Pule są **łączone, nie zastępowane**, a pozycje z zagranicy dostają w UI znacznik `US`.
Tłumaczenie tematu jest liczone raz (tańszym modelem Flash-Lite, z zapasowym przejściem na
główny) i cache'owane w kolumnie `boxes.topic_en`.

**Filtr czasu nie ufa wyszukiwarce.** Google News sortuje po trafności i bez operatora `when:`
wrzuca artykuły sprzed tygodni. Zapytanie ma więc `when:1d` (z poszerzeniem do `when:2d`), a
każda pozycja jest jeszcze twardo odsiewana po realnej dacie z `pubDate`. Jeśli z ostatnich
24h zbierze się co najmniej 4 pozycje, starsze w ogóle nie trafiają do modelu.

**Lepiej pokazać mniej niż nic.** Gdy świeżych pozycji jest 1-3, wyświetlane są wszystkie.
Komunikat o braku wiadomości pojawia się dopiero, gdy nie ma dosłownie nic.

**Model ma wyłączone "myślenie" - i to była naprawa realnego błędu.** Codzienne odświeżanie co
kilka dni wywalało się na jednym losowym temacie z komunikatem "Gemini zwrócił niepoprawny JSON".
Gemini 2.5 Flash jest modelem rozumującym, a tokeny myślenia zjadają **ten sam budżet wyjścia co
odpowiedź**. Pomiary na jednym temacie: od 954 do 3800 tokenów myślenia przy stale ~200 tokenach
odpowiedzi. Gdy myślenie strzelało wysoko, odpowiedź kończyła się na `finish_reason=MAX_TOKENS`,
czyli ucięta w połowie JSON-a - stąd błąd parsowania i pozorna losowość. Wybór 4 pozycji z gotowej
listy nie wymaga rozumowania, więc myślenie jest wyłączone (`thinking_budget: 0`), doszedł
`response_schema` wymuszający strukturę, jawny limit tokenów i jedno ponowienie. Efekt uboczny:
kilkukrotnie mniejsze zużycie tokenów. Komunikat błędu niesie teraz `finish_reason` i fragment
odpowiedzi - bez tego pierwsze wystąpienie trzeba było odtwarzać ręcznie.

**Pierwotna wersja korzystała z Google Search grounding i została wycofana.** Wyniki bywały
nieprzewidywalne, źródła trzeba było odzyskiwać z offsetów `groundingSupports`, a grounding
jest rozliczany za każde zapytanie, czyli o rzędy wielkości drożej niż same tokeny. Wersja na
RSS daje deterministyczną pulę wejściową. W historii repo widać obie.

## Koszt pod kontrolą

Codzienne odświeżanie to jedyne miejsce, gdzie koszt rośnie razem z liczbą użytkowników,
dlatego ma trzy bezpieczniki:

- **Temat bez nowych wiadomości nie woła modelu.** Skrypt przekazuje silnikowi czas ostatniego
  snapshotu. Jeśli od tamtej pory w RSS nie pojawiło się nic nowego, silnik kończy przed
  wywołaniem Gemini, a kafelek zachowuje dotychczasowe newsy.
- **Konta nieaktywne od 7 dni są pomijane.** Przy publicznym demo i jednorazowych rejestracjach
  porzucone tematy kosztowałyby zapytanie dziennie bez końca. Aktywność to znacznik
  `last_seen_at` w metadanych konta Supabase Auth, zapisywany przy wejściu na tablicę najwyżej
  raz na dobę (`lib/activeUsers.ts`). Samo `last_sign_in_at` nie wystarcza, bo sesja odnawia
  się tokenem tygodniami. Konto demo odświeża się zawsze.
- **Ręczne odświeżanie** ([api/refresh](app/api/refresh/route.ts)) ma limit 30 żądań na dobę
  na adres IP. Licznik siedzi w bazie (tabela `rate_limits` + atomowa funkcja
  `consume_rate_limit`), bo funkcje serverless są bezstanowe.

Trzy ścieżki odświeżania (skrypt dzienny, endpoint cron, przycisk w UI) korzystają z jednej
funkcji `refreshBoxNews` w `lib/refreshBox.ts`.

## Frontend

**Publiczne demo bez logowania.** `/demo` i podgląd na stronie głównej pokazują tablicę konta
pokazowego w trybie tylko do odczytu. Dane czyta serwer, logując się na to konto publicznym
kluczem (anon), więc odczyt przechodzi przez te same polityki RLS co zwykła sesja i nie wymaga
klucza `service_role`. Wynik jest cache'owany na 15 minut (ISR), więc ruch odwiedzających nie
obciąża bazy. Gdy baza nie odpowiada, strona renderuje się bez podglądu.

**Optimistic updates.** Usunięcie, edycja i zmiana kolejności tematu są widoczne natychmiast,
a przy błędzie serwera stan wraca do poprzedniego (TanStack Query).

**Animacje przez View Transitions API.** Kafelki płynnie zamieniają się miejscami przy zmianie
kolejności, dodaniu i usunięciu. Przeglądarki bez wsparcia i użytkownicy z
`prefers-reduced-motion` dostają zmianę bez animacji (`lib/useViewTransition.ts`).

**Motyw jasny i ciemny bez mignięcia.** Wybór siedzi w `localStorage`, a krótki skrypt w
`<head>` ustawia motyw przed pierwszym malowaniem. Obie ikony przełącznika są w HTML i wybiera
je CSS, więc nie ma błędu hydracji ani stanu w Reakcie.

**Druga zakładka w kafelku nie kosztuje dodatkowego zapytania.** Każde odświeżenie zapisuje
nowy wiersz w tabeli `snapshots`. UI pokazuje najnowszy jako "Najnowsze", a poprzedni jako
"Poprzednie".

**Tytuły źródeł zostają w oryginale.** Opis newsa jest po polsku, ale link prowadzi do
artykułu z jego prawdziwym nagłówkiem.

### Dostępność i wydajność

Zmiana kolejności tematów działa **z klawiatury**. Drag & drop to dodatek dla myszy, a
strzałki góra/dół są dostępne na każdej szerokości ekranu (WCAG 2.1.1). Test w
`components/Box.test.tsx` pilnuje, żeby to nie wróciło.

Etykiety akcji zawierają nazwę tematu (`Odśwież temat "UAP"`), bo przy kilkunastu kafelkach
czytnik ekranu odczytywałby kilkanaście identycznych "Odśwież".

Audyt dostępności jest zautomatyzowany dwutorowo: **axe** działa na renderowanych komponentach
w testach jednostkowych, a **Lighthouse CI** mierzy gotowe strony w prawdziwej przeglądarce
(axe pod jsdom nie liczy kontrastu, Lighthouse tak).

Wyniki Lighthouse dla stron publicznych (preset desktop, lokalny build produkcyjny, mediana z 3
przebiegów):

| Strona | Performance | Accessibility | Best practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| `/` | 100 | 100 | 100 | 100 | 475 ms | 0.001 |
| `/demo` | 100 | 100 | 100 | 100 | 454 ms | 0.001 |
| `/o-aplikacji` | 100 | 100 | 100 | 100 | 460 ms | 0.001 |
| `/login` | 100 | 100 | 100 | 100 | 460 ms | 0.000 |

Strony publiczne (`/`, `/demo`, `/o-aplikacji`, `/kontakt`) middleware przepuszcza bez
odpytywania Supabase, więc nie ma zbędnego roundtripu do bazy, a treść widzą crawlery.

## Bezpieczeństwo danych

**Dostęp jest pilnowany na poziomie bazy**, nie tylko w kodzie API. Reguły w
[supabase/schema.sql](supabase/schema.sql) to polityki Row Level Security: nawet gdyby w API
zabrakło filtra po `user_id`, Postgres nie odda cudzych wierszy.

**Logowanie działa na zwykłym loginie, nie na e-mailu.** Supabase Auth wymaga adresu pod
spodem, więc `lib/username.ts` mapuje login na syntetyczny adres. Żaden e-mail nie jest
wysyłany.

### Dwie pułapki, które kosztowały najwięcej czasu

Obie dotyczą wołania własnej funkcji Pythona z własnego backendu i obie objawiały się tym samym:
`500` i bezużyteczne `[object Object]` w UI.

1. **Middleware przechwytywało `/api/rss`.** Wywołanie server-to-server nie ma ciasteczka sesji,
   więc dostawało `307` na `/login` zamiast newsów. Ścieżka musi być wyłączona z matchera
   middleware, tak jak `api/cron`.
2. **`VERCEL_URL` wskazuje na adres konkretnego deploya**, który przy włączonej Vercel Deployment
   Protection odpowiada `401 Protected deployment`. Trzeba używać `VERCEL_PROJECT_PRODUCTION_URL`
   (stabilny adres produkcyjny) - patrz `rssEngineUrl()` w [lib/rssEngine.ts](lib/rssEngine.ts).

Przy okazji obu: obsługa błędów w kliencie silnika wyciąga teraz komunikat z `detail`, `error`
albo `message` i serializuje obiekty, więc w UI widać przyczynę, a nie `[object Object]`.

## Testy i CI

**100 testów po stronie TypeScriptu** (Vitest):

- logika serwerowa - klient silnika RSS (`lib/rssEngine.test.ts`), pamięć poprzedniego dnia i
  wspólna ścieżka odświeżania (`lib/refreshBox.test.ts`), wykrywanie nieaktywnych kont
  (`lib/activeUsers.test.ts`), bramka godzinowa (`lib/schedule.test.ts`), mapowanie loginu
  (`lib/username.test.ts`), autoryzacja endpointu cron (`app/api/cron/refresh/route.test.ts`),
- komponenty (React Testing Library) - zakładki i dostępność reorderu (`Box.test.tsx`), źródła
  i data publikacji (`BulletItem.test.tsx`), menu i stan sesji (`Nav.test.tsx`), kafelek tylko
  do odczytu (`ReadOnlyBox.test.tsx`), przełącznik motywu (`ThemeToggle.test.tsx`), integracja
  z TanStack Query wraz z dowodem, że usuwanie jest optimistic (`Dashboard.test.tsx`),
- **axe** - audyt dostępności renderowanych komponentów, wpięty w te same testy.

**42 testy po stronie Pythona** (pytest, `tests/test_rss.py`) - tam siedzi logika biznesowa
silnika: twarde odcięcie 48h, priorytet ostatnich 24h, łączenie pul PL + US, grupowanie
podobnych nagłówków, pamięć poprzedniego dnia, pomijanie tematu bez zmian, cache i zapasowy
model tłumaczenia, a także konfiguracja modelu i ponowienie przy uciętej odpowiedzi.

```
npm test          # testy TypeScriptu (Vitest + RTL + axe)
npm run test:py   # testy silnika (pytest)
npm run typecheck # tsc --noEmit
npm run lighthouse # audyt Lighthouse na lokalnym buildzie
```

GitHub Actions odpala na każdy push i PR: typecheck, testy TS, build i testy Pythona
(`.github/workflows/ci.yml`) oraz audyt Lighthouse z budżetami wydajności
(`.github/workflows/lighthouse.yml`). Progi są w `lighthouserc.json` - dostępność i SEO blokują
build, wydajność ostrzega (wyniki w CI bywają zmienne).

## Struktura

```
api/
  rss.py                      # silnik: RSS, grupowanie, pamięć, selekcja przez Gemini (FastAPI)
requirements.txt              # zależności Pythona (feedparser, google-genai, fastapi)
requirements-dev.txt          # + pytest
tests/test_rss.py             # testy logiki silnika (pytest)
app/
  page.tsx                    # strona główna z podglądem dzisiejszych newsów (ISR)
  demo/page.tsx               # publiczna tablica tylko do odczytu (ISR)
  newsy/page.tsx              # dashboard z tablicą tematów
  o-aplikacji/page.tsx        # opis produktu i stack
  kontakt/page.tsx            # kontakt
  login/page.tsx              # logowanie / rejestracja na login (nie e-mail)
  api/boxes/                  # CRUD boxów (tu liczony jest cache topic_en)
  api/refresh/                # ręczne odświeżenie jednego boxa
  api/cron/refresh/           # odświeżenie wszystkich przez HTTP (chronione CRON_SECRET, opcjonalne)
scripts/
  refresh.ts                  # codzienne odświeżenie wszystkich (uruchamiane przez GitHub Actions)
lib/
  rssEngine.ts                # klient silnika Pythona + mapowanie błędów
  refreshBox.ts               # wspólna logika odświeżenia boxa + pamięć poprzedniego dnia
  activeUsers.ts              # znacznik aktywności i lista kont nieaktywnych
  demo.ts                     # dane publicznego podglądu (konto demo, cache 15 min)
  schedule.ts                 # bramka godzinowa 8:00 Europe/Warsaw
  username.ts                 # mapowanie login <-> syntetyczny e-mail
  useViewTransition.ts        # animacje zmian układu (View Transitions API)
  supabase/                   # klienci: przeglądarka / serwer / admin (service_role)
  types.ts
components/                   # Nav, Dashboard, Box, BoxNews, ReadOnlyBox, AddBox, BulletItem,
                              # ThemeToggle, Footer (+ testy .test.tsx obok komponentów)
supabase/schema.sql           # tabele + polityki RLS
middleware.ts                 # ochrona tras (strony publiczne przepuszczane bez Supabase)
lighthouserc.json             # progi Core Web Vitals, dostępności i SEO
.github/workflows/refresh.yml # harmonogram codziennego odświeżania (GitHub Actions)
```

## Uruchomienie lokalne

Wymagany **Node 22+** (jsdom 30 i `@testing-library/jest-dom` 7, na których stoją testy
komponentów, nie działają na Node 20) oraz Python 3.12+ do testów silnika.

1. `npm install`
2. Załóż projekt na [supabase.com](https://supabase.com), w SQL Editor uruchom
   `supabase/schema.sql`.
3. Supabase -> Authentication -> Providers -> Email: wyłącz "Confirm email" (logowanie idzie na
   syntetyczny adres, więc mail potwierdzający i tak by nie dotarł).
4. Skopiuj `.env.example` do `.env.local`, uzupełnij klucze Gemini + Supabase + `CRON_SECRET`.
5. `npm run dev`, potem http://localhost:3000

Uwaga: pod `npm run dev` działa tylko warstwa Next. Funkcja Pythona to runtime Vercela, więc
`/api/rss` lokalnie zwróci 404 - żeby odpalić całość na maszynie, użyj `vercel dev`, albo
wskaż `RSS_ENGINE_URL` na wdrożony silnik.

## Deploy

Repo podpięte pod Vercel, push na `main` buduje i wdraża - Vercel sam wykrywa `requirements.txt`
i buduje funkcję Pythona obok aplikacji Next. Te same zmienne środowiskowe co lokalnie trzeba
dodać w ustawieniach projektu na Vercel.

Opcjonalnie warto ustawić `RSS_ENGINE_SECRET` (po stronie Vercela i w sekretach repo) - endpoint
silnika musi być poza middleware, więc bez sekretu jest publiczny, a każde wywołanie kosztuje
zapytanie do Gemini.

Codzienne odświeżanie robi GitHub Actions (`.github/workflows/refresh.yml`), a nie Vercel Cron -
pętla po boxach nie mieści się w limicie 60 s funkcji serverless na Hobby.

Newsy mają być gotowe o **8:00 czasu polskiego przez cały rok**, a harmonogram GitHub Actions
jest w UTC i nie ogarnia zmiany czasu - jeden wpis cron trafiałby więc w 8:00 tylko przez pół
roku. Dlatego workflow odpala się w **dwóch oknach godzinowych** (6:xx i 7:xx UTC), a o tym,
które z nich faktycznie zrobi robotę, decyduje bramka w kodzie: `lib/schedule.ts` sprawdza
godzinę w strefie `Europe/Warsaw` i kończy natychmiast, jeśli jest przed 8:00. Latem robotę
wykonuje okno 6:xx, zimą 7:xx - drugie kończy się w kilka sekund. Logika jest pokryta testami
(`lib/schedule.test.ts`) dla obu pór roku.

W każdym oknie są 3 próby co 20 min. Skrypt pomija boxy, które mają już świeży snapshot, więc
kolejne przebiegi ponawiają tylko te, które padły (dodatkowo każdy box ma jeszcze szybki retry
w obrębie jednej próby).
Temat, dla którego nie ma nic z ostatnich 48h, jest **pomijany, a nie raportowany jako błąd** -
inaczej spokojny dzień w niszowym temacie czerwieniłby cały workflow i czerwony status przestałby
cokolwiek znaczyć. Box zachowuje wtedy poprzedni snapshot.

Z tego samego powodu błędem nie jest temat, w którym od ostatniego snapshotu nic nie doszło
(silnik kończy bez wołania Gemini), ani box konta nieaktywnego od 7 dni. Podsumowanie przebiegu
podaje osobno liczbę odświeżonych, niezmienionych i pominiętych.

Ręczne "Run workflow" wymusza pełne odświeżenie. Wymaga sekretów repo (Settings -> Secrets and
variables -> Actions): `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` oraz
`RSS_ENGINE_URL` (adres wdrożonego silnika, np. `https://newsy-nine.vercel.app/api/rss` - runner
GitHuba nie ma zmiennych Vercela, więc musi dostać go wprost).
