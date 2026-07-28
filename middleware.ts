import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Trasy dostępne bez logowania (wizytówka projektu). Reszta wymaga sesji.
const PUBLIC_PAGES = new Set(['/', '/o-aplikacji', '/kontakt']);

export async function middleware(request: NextRequest) {
  // Strony wizytówkowe przepuszczamy od razu, BEZ odpytywania Supabase. Nie potrzebują
  // sesji (Nav sprawdza ją po stronie klienta), więc odpada zbędny roundtrip przy każdym
  // wejściu - a strony statyczne serwują się bez zależności od backendu.
  if (PUBLIC_PAGES.has(request.nextUrl.pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith('/login');

  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/newsy';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Wyklucz zasoby publiczne/SEO - inaczej middleware przekierowałby je na /login dla
  // niezalogowanych (crawler po og:image/robots/sitemap i favicona dla wylogowanych).
  // api/rss = silnik Pythona wołany server-to-server z /api/refresh (bez ciasteczek), więc
  // musi być poza middleware, inaczej dostaje 307 -> /login zamiast liczyć newsy.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|opengraph-image|robots.txt|sitemap.xml|api/cron|api/rss).*)',
  ],
};
