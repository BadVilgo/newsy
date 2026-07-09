

# Newsy — tablica tematów

Dashboard, na którym dodajesz „boxy" — każdy box to jeden temat (np. *spółka Nvidia giełda*,
*status wojna Rosja–Ukraina*). Dla każdego tematu aplikacja codziennie zaciąga przez Gemini
najważniejsze wiadomości z ostatnich 24h i pokazuje je jako punkty z linkami do źródeł. Osobno
widać wiadomości z okna 24–48h (dzień wcześniej). Ustawienia i newsy zapisują się na koncie,
więc są dostępne po zalogowaniu z dowolnego komputera.

## Stack

- **Next.js (App Router) + TypeScript** — frontend (React) i backend (API routes) w jednym repo.
- **Supabase** — Postgres (dane) + Auth (logowanie e-mail). Row Level Security = każdy widzi
  tylko swoje dane.
- **Google Gemini 2.5 Flash** — z Google Search grounding zbiera newsy i wybiera najważniejsze.
- **Vercel** — hosting + Vercel Cron (codzienne odświeżanie).

## Jak działa pipeline newsów (`lib/gemini.ts`)

Dwa wywołania Gemini Flash:
1. **Zbieranie** — Flash + Google Search zwraca 20–25 surowych newsów z 24h.
2. **Redakcja** — drugi Flash (bez wyszukiwania) wybiera 4 najważniejsze, odrzuca clickbait
   i duplikaty.

Do każdego wybranego newsa dopinane są źródła: `groundingSupports` (segmenty tekstu → indeksy
źródeł) mapowane są na pozycje listy po zachodzeniu offsetów znakowych.

## Sekcja 24h vs 24–48h — trik na trwałość

Każde odświeżenie zapisuje nowy **snapshot** w bazie. UI pokazuje najnowszy snapshot jako
„24h", a poprzedni jako „24–48h". Dzięki temu nie prosimy Gemini o precyzyjne okno historyczne
(Google Search tego nie umie wiarygodnie) — wczorajsze „24h" samo staje się dzisiejszym
starszym wiadrem. To rozwiązuje jednocześnie trwałość (dane w bazie nie znikają po odświeżeniu
strony) i drugą sekcję.

## Uruchomienie lokalne

1. `npm install`
2. Utwórz projekt na [supabase.com](https://supabase.com), w SQL Editor uruchom
   `supabase/schema.sql`.
3. W Supabase → Authentication → Providers → Email: na czas developmentu wyłącz „Confirm email"
   (logowanie od razu po rejestracji).
4. Skopiuj `.env.example` → `.env.local` i uzupełnij klucze (Gemini + Supabase + `CRON_SECRET`).
5. `npm run dev` → http://localhost:3000

## Deploy (Vercel, darmowy tier)

1. Wypchnij repo na GitHub, zaimportuj w Vercel.
2. Dodaj te same zmienne środowiskowe w ustawieniach projektu Vercel.
3. `vercel.json` konfiguruje cron `0 7 * * *` (**UTC!** = 9:00 czasu PL latem; zimą użyj `0 8 * * *`).
   Gdy `CRON_SECRET` jest ustawiony, Vercel sam dołącza nagłówek autoryzacji do wywołania cron.

## Struktura

```
app/
  page.tsx                 # dashboard (chroniony logowaniem)
  login/page.tsx           # logowanie / rejestracja
  api/boxes/               # CRUD boxów
  api/refresh/             # ręczne odświeżenie jednego boxa
  api/cron/refresh/        # codzienne odświeżenie wszystkich (Vercel Cron)
lib/
  gemini.ts                # pipeline newsów
  supabase/                # klienci: przeglądarka / serwer / admin (cron)
  types.ts
components/                 # Dashboard, Box, AddBox, NewsSection
supabase/schema.sql        # tabele + RLS
middleware.ts              # odświeżanie sesji + ochrona tras
```
