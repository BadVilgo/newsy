# Newsy - tablica tematów

[![CI](https://github.com/BadVilgo/newsy/actions/workflows/ci.yml/badge.svg)](https://github.com/BadVilgo/newsy/actions/workflows/ci.yml)

**Demo:** [newsy-nine.vercel.app](https://newsy-nine.vercel.app)

Dashboard, na którym zalogowany użytkownik dodaje dowolną liczbę "boxów". Jeden box to jeden
obserwowany temat, np. *spółka Nvidia giełda*, *status wojna Rosja-Ukraina*, *postępy nad
agentami AI*. Dla każdego tematu aplikacja zbiera przez Gemini najważniejsze wiadomości z
ostatnich 24h, wybiera z nich 4 najistotniejsze i pokazuje jako punkty z linkami do źródeł. Pod
spodem jest druga sekcja z tym samym, ale dla okna 24-48h wstecz. Boxy i historia newsów są
zapisane na koncie, więc zostają po odświeżeniu strony i są dostępne z dowolnego urządzenia po
zalogowaniu.

## Stack

- **Next.js 15 (App Router) + TypeScript** - frontend (React) i backend (API routes) w jednym
  repo, jeden deploy. Nie ma tu osobnego serwera Express do utrzymywania.
- **Supabase (Postgres + Auth)** - relacyjna baza z Row Level Security zamiast pilnowania dostępu
  ręcznie w kodzie.
- **Google Gemini 2.5 Flash + Google Search grounding** - do zbierania i selekcji newsów.
- **Vercel** - deploy z GitHuba, serverless functions dla UI i akcji użytkownika.
- **GitHub Actions (scheduled workflow)** - codzienne odświeżanie newsów. Pętla po wszystkich
  boxach nie mieści się w limicie 60 s funkcji serverless na planie Hobby, więc ciężka robota
  dzieje się na runnerze GitHuba (`scripts/refresh.ts`), a nie na Vercelu.

Nie ma tu Reduxa, GraphQL ani mikroserwisów - projekt nie jest na tyle duży, żeby to miało sens.

## Kilka rzeczy, które warto wiedzieć o implementacji

Pipeline newsów w [lib/gemini.ts](lib/gemini.ts) to dwa osobne wywołania Gemini, nie jedno.
Pierwsze (z Google Search) zbiera 20-25 surowych wyników z 24h. Drugie dostaje gotową listę i
wybiera z niej 4 pozycje, odrzucając duplikaty tego samego wydarzenia i mniej istotne wzmianki.
Jedno zapytanie "znajdź i wybierz najważniejsze" dawało gorsze, bardziej przypadkowe wyniki niż
rozbicie tego na krok zbierania i krok redakcji.

Źródła do newsów trzeba było odzyskać ręcznie. Gemini z groundingiem zwraca `groundingSupports`
jako segmenty tekstu (offsety znakowe) powiązane z indeksami chunków źródłowych, nie jako gotowe
przypisanie do numeru pozycji na liście. `parseNumberedItems` i `mapSourcesToItems` w
`lib/gemini.ts` robią to mapowanie po zachodzeniu na siebie zakresów offsetów.

Sekcja 24-48h nie wymaga drugiego zapytania do modelu o historyczne okno czasowe (czego
wyszukiwanie i tak nie potrafi wiarygodnie ograniczyć). Każde odświeżenie zapisuje nowy wiersz w
tabeli `snapshots`. UI pokazuje najnowszy snapshot jako "24h", a poprzedni jako "24-48h" -
wczorajsze "aktualne" newsy same stają się dzisiejszym starszym wiadrem. Rozwiązuje to
jednocześnie trwałość danych i drugie okno czasowe, bez dodatkowej logiki.

Dostęp do danych jest pilnowany na poziomie bazy, nie tylko w kodzie API. Reguły w
[supabase/schema.sql](supabase/schema.sql) to polityki Row Level Security - nawet jakbym gdzieś
zapomniał dopisać filtr po `user_id` w zapytaniu, Postgres i tak nie odda cudzych wierszy.

Logowanie działa na zwykłym loginie, nie na e-mailu - Supabase Auth wymaga jednak adresu e-mail
pod spodem, więc `lib/username.ts` mapuje login na syntetyczny adres. Żaden e-mail nigdzie nie
jest wysyłany, to czysto techniczny szczegół.

## Czego tu świadomie nie ma

- Warstwy wizualnej - inline style, brak design systemu. Najpierw dopiąłem funkcjonalność (CRUD,
  auth, cron, cały pipeline AI), UI dochodzi w kolejnym kroku.
- Równoległego odświeżania w cyklu dziennym - boxy odświeżają się jeden po drugim, żeby nie walić
  w darmowy limit zapytań Gemini seriami równoległych żądań. Runner GitHuba nie ma limitu 60 s, więc
  czas wykonania nie jest problemem.
- Testów automatycznych - na tym etapie priorytetem była działająca integracja z realnymi API
  (Gemini, Supabase), nie pokrycie testami.

## Testy i CI

Unit testy (Vitest) pokrywają czystą logikę, którą najłatwiej zepsuć po cichu: parsowanie
ponumerowanej listy i mapowanie źródeł z groundingu (`lib/gemini.test.ts`), mapowanie login
na adres (`lib/username.test.ts`) oraz autoryzację endpointu cron (`app/api/cron/refresh/route.test.ts`).

```
npm test          # uruchom testy
npm run typecheck # tsc --noEmit
```

GitHub Actions (`.github/workflows/ci.yml`) na każdy push i PR odpala typecheck, testy i build.

## Struktura

```
app/
  page.tsx                  # dashboard, trasa chroniona przez middleware
  login/page.tsx            # logowanie / rejestracja na login (nie e-mail)
  api/boxes/                 # CRUD boxów
  api/refresh/                # ręczne odświeżenie jednego boxa
  api/cron/refresh/           # odświeżenie wszystkich przez HTTP (chronione CRON_SECRET, opcjonalne)
scripts/
  refresh.ts                  # codzienne odświeżenie wszystkich (uruchamiane przez GitHub Actions)
lib/
  gemini.ts                  # zbieranie i selekcja newsów
  username.ts                 # mapowanie login <-> syntetyczny e-mail
  supabase/                   # klienci: przeglądarka / serwer / admin (service_role)
  types.ts
components/                   # Dashboard, Box, AddBox, NewsSection
supabase/schema.sql           # tabele + polityki RLS
middleware.ts                 # odświeżanie sesji Supabase + ochrona tras
.github/workflows/refresh.yml # harmonogram codziennego odświeżania (GitHub Actions)
```

## Uruchomienie lokalne

1. `npm install`
2. Załóż projekt na [supabase.com](https://supabase.com), w SQL Editor uruchom
   `supabase/schema.sql`.
3. Supabase -> Authentication -> Providers -> Email: wyłącz "Confirm email" (logowanie idzie na
   syntetyczny adres, więc mail potwierdzający i tak by nie dotarł).
4. Skopiuj `.env.example` do `.env.local`, uzupełnij klucze Gemini + Supabase + `CRON_SECRET`.
5. `npm run dev`, potem http://localhost:3000

## Deploy

Repo podpięte pod Vercel, push na `main` buduje i wdraża. Te same zmienne środowiskowe co
lokalnie trzeba dodać w ustawieniach projektu na Vercel.

Codzienne odświeżanie robi GitHub Actions (`.github/workflows/refresh.yml`), a nie Vercel Cron -
pętla po boxach nie mieści się w limicie 60 s funkcji serverless na Hobby. Workflow odpala
`scripts/refresh.ts` codziennie o 7:00 UTC (9:00 czasu polskiego latem, 8:00 zimą - harmonogram
GitHub Actions jest w UTC i nie ogarnia zmiany czasu). Wymaga sekretów repo (Settings -> Secrets
and variables -> Actions): `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
