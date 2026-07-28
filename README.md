# Newsy - tablica tematów

[![CI](https://github.com/BadVilgo/newsy/actions/workflows/ci.yml/badge.svg)](https://github.com/BadVilgo/newsy/actions/workflows/ci.yml)

**Demo:** [newsy-nine.vercel.app](https://newsy-nine.vercel.app)

Dashboard, na którym zalogowany użytkownik dodaje dowolną liczbę "boxów". Jeden box to jeden
obserwowany temat, np. *spółka Nvidia giełda*, *status wojna Rosja-Ukraina*, *postępy nad
agentami AI*. Dla każdego tematu aplikacja zbiera wiadomości z Google News RSS, oddaje je Gemini
do selekcji i pokazuje 4 najistotniejsze jako punkty z własnymi, polskimi opisami i linkami do
źródeł. Druga zakładka w kafelku pokazuje poprzedni stan tematu, więc widać, co doszło. Boxy i
historia newsów są zapisane na koncie, więc zostają po odświeżeniu strony i są dostępne z
dowolnego urządzenia po zalogowaniu.

Na tablicę nie trafia nic starszego niż 48 godzin, a pierwszeństwo mają wiadomości z ostatniej
doby.

## Stack

- **Next.js 15 (App Router) + TypeScript** - frontend (React) i backend (API routes) w jednym
  repo, jeden deploy. Nie ma tu osobnego serwera Express do utrzymywania.
- **Python 3 + FastAPI** - osobny mikroserwis (`api/rss.py`) z całą logiką RSS i AI, wdrażany
  jako funkcja serverless na tym samym Vercelu. Warstwa TypeScript tylko go woła i zapisuje wynik.
- **Supabase (Postgres + Auth)** - relacyjna baza z Row Level Security zamiast pilnowania dostępu
  ręcznie w kodzie.
- **Google Gemini 2.5 Flash** - selekcja newsów i pisanie opisów, jedno wywołanie na temat.
- **Vercel** - deploy z GitHuba, serverless functions dla UI, akcji użytkownika i silnika Pythona.
- **GitHub Actions (scheduled workflow)** - codzienne odświeżanie newsów. Pętla po wszystkich
  boxach nie mieści się w limicie 60 s funkcji serverless na planie Hobby, więc ciężka robota
  dzieje się na runnerze GitHuba (`scripts/refresh.ts`), a nie na Vercelu.

Nie ma tu Reduxa, GraphQL ani mikroserwisów ponad ten jeden - projekt nie jest na tyle duży, żeby
to miało sens.

## Kilka rzeczy, które warto wiedzieć o implementacji

**Podział na dwa języki jest funkcjonalny, nie ozdobny.** Python (`api/rss.py`) odpowiada za
pobranie RSS, filtrowanie po czasie i rozmowę z Gemini. TypeScript odpowiada za konta, bazę i
RLS. Dzięki temu logika newsów żyje w jednym pliku, a nie jest rozsmarowana po dwóch stosach.

**Pierwotna wersja korzystała z Google Search grounding i została wycofana.** Model sam
przeszukiwał sieć, ale wyniki bywały nieprzewidywalne, źródła trzeba było odzyskiwać z offsetów
`groundingSupports`, a grounding jest rozliczany za każde zapytanie - czyli o rzędy wielkości
drożej niż wymiana samych tokenów. Wersja na RSS daje deterministyczną pulę wejściową i kosztuje
grosze miesięcznie. W historii repo widać obie.

**Selekcja to jedno wywołanie Gemini, nie trzy.** Model dostaje do 30 pozycji (nagłówek, opis,
źródło, data), wybiera 4 najważniejsze i od razu pisze do nich własne polskie opisy. Osobny krok
tłumaczenia byłby zbędny, bo model jest wielojęzyczny i angielskie nagłówki streszcza po polsku
w tym samym przebiegu - a tłumaczenie tłumaczenia tylko psułoby język.

**Gdy polskie media milczą, aplikacja sięga po wydanie amerykańskie.** Przy tematach niszowych
polski RSS potrafi zwrócić zero świeżych pozycji (sprawdzone: "UAP" w oknie 48h to 0 wyników po
polsku i 15 po angielsku). Jeśli świeżych polskich pozycji jest mniej niż 8, temat jest tłumaczony
na angielskie hasło i dobierane jest wydanie US. Kluczowe: pule są **łączone, nie zastępowane** -
inaczej pięć trafnych polskich newsów przegrałoby z zagranicznymi ogólnikami. Pozycje z zagranicy
dostają w UI znacznik `US`.

Tłumaczenie samego tematu też jest zapytaniem do modelu, ale temat kafelka jest praktycznie
stały, więc liczone jest **raz** i cache'owane w kolumnie `boxes.topic_en`. Codzienne odświeżanie
korzysta z cache, więc niezależnie od ścieżki wychodzi jedno wywołanie Gemini na temat na dzień.

**Filtr czasu nie ufa wyszukiwarce.** Google News sortuje wyniki po trafności i bez operatora
`when:` wrzuca artykuły sprzed tygodni. Zapytanie ma więc `when:1d` (z poszerzeniem do `when:2d`
przy ubogich tematach), ale niezależnie od tego każda pozycja jest jeszcze twardo odsiewana po
realnej dacie z `pubDate`. Jeśli z ostatnich 24h zbierze się co najmniej 4 pozycje, starsze w
ogóle nie trafiają do modelu - 48h to sufit awaryjny, nie domyślne okno.

**Lepiej pokazać mniej niż nic.** Gdy świeżych pozycji jest 1-3, wyświetlane są wszystkie.
Komunikat o braku wiadomości pojawia się dopiero, gdy nie ma dosłownie nic.

**Tytuły źródeł zostają w oryginale.** Opis newsa jest po polsku, ale link prowadzi do artykułu z
jego prawdziwym nagłówkiem - po przetłumaczonym tytule nikt by tego tekstu nie odnalazł.

**Druga zakładka w kafelku nie kosztuje dodatkowego zapytania.** Każde odświeżenie zapisuje nowy
wiersz w tabeli `snapshots`. UI pokazuje najnowszy snapshot jako "Najnowsze", a poprzedni jako
"Poprzednie" - wczorajsze newsy same stają się dzisiejszym starszym wiadrem.

**Dostęp do danych jest pilnowany na poziomie bazy**, nie tylko w kodzie API. Reguły w
[supabase/schema.sql](supabase/schema.sql) to polityki Row Level Security - nawet jakbym gdzieś
zapomniał dopisać filtr po `user_id`, Postgres i tak nie odda cudzych wierszy.

**Ręczne odświeżanie** ([api/refresh](app/api/refresh/route.ts)) jest limitowane do 30 żądań na
dobę na jeden adres IP. Licznik siedzi w bazie (tabela `rate_limits` + atomowa funkcja
`consume_rate_limit`), a nie w pamięci procesu, bo funkcje serverless na Vercelu są bezstanowe i
kolejne żądania trafiają na różne instancje.

**Logowanie działa na zwykłym loginie, nie na e-mailu** - Supabase Auth wymaga jednak adresu pod
spodem, więc `lib/username.ts` mapuje login na syntetyczny adres. Żaden e-mail nigdzie nie jest
wysyłany, to czysto techniczny szczegół.

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

Unit testy (Vitest) pokrywają czystą logikę, którą najłatwiej zepsuć po cichu: klienta silnika
RSS - rozwiązywanie adresu, cache tłumaczenia, mapowanie błędów i wykrywanie przekierowań
(`lib/rssEngine.test.ts`), mapowanie login na adres (`lib/username.test.ts`) oraz autoryzację
endpointu cron (`app/api/cron/refresh/route.test.ts`).

```
npm test          # uruchom testy
npm run typecheck # tsc --noEmit
```

GitHub Actions (`.github/workflows/ci.yml`) na każdy push i PR odpala typecheck, testy i build.

## Struktura

```
api/
  rss.py                      # silnik: Google News RSS + selekcja i opisy przez Gemini (FastAPI)
requirements.txt              # zależności Pythona (feedparser, google-genai, fastapi)
app/
  page.tsx                    # strona główna (landing)
  newsy/page.tsx              # dashboard z tablicą tematów
  o-aplikacji/page.tsx        # opis produktu
  kontakt/page.tsx            # kontakt
  login/page.tsx              # logowanie / rejestracja na login (nie e-mail)
  api/boxes/                  # CRUD boxów (tu liczony jest cache topic_en)
  api/refresh/                # ręczne odświeżenie jednego boxa
  api/cron/refresh/           # odświeżenie wszystkich przez HTTP (chronione CRON_SECRET, opcjonalne)
scripts/
  refresh.ts                  # codzienne odświeżenie wszystkich (uruchamiane przez GitHub Actions)
lib/
  rssEngine.ts                # klient silnika Pythona + mapowanie błędów
  username.ts                 # mapowanie login <-> syntetyczny e-mail
  supabase/                   # klienci: przeglądarka / serwer / admin (service_role)
  types.ts
components/                   # Nav, Dashboard, Box, AddBox, NewsSection, BulletItem
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
pętla po boxach nie mieści się w limicie 60 s funkcji serverless na Hobby. Workflow odpala
`scripts/refresh.ts` o 3:18 UTC (5:18 czasu polskiego latem, 4:18 zimą - harmonogram GitHub
Actions jest w UTC i nie ogarnia zmiany czasu), z dwoma ponowieniami co 20 min (03:18 / 03:38 /
03:58 UTC). Skrypt pomija boxy, które mają już świeży snapshot, więc kolejne przebiegi ponawiają
tylko te, które padły (dodatkowo każdy box ma jeszcze szybki retry w obrębie jednej próby).
Ręczne "Run workflow" wymusza pełne odświeżenie. Wymaga sekretów repo (Settings -> Secrets and
variables -> Actions): `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` oraz
`RSS_ENGINE_URL` (adres wdrożonego silnika, np. `https://newsy-nine.vercel.app/api/rss` - runner
GitHuba nie ma zmiennych Vercela, więc musi dostać go wprost).
