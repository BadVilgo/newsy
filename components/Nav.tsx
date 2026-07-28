'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { emailToUsername } from '@/lib/username';
import { NewsIcon, MenuIcon, CloseIcon } from './icons';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/newsy', label: 'Newsy' },
  { href: '/o-aplikacji', label: 'O aplikacji' },
  { href: '/kontakt', label: 'Kontakt' },
];

/**
 * Sesje czytamy po stronie KLIENTA, a nie z ciasteczek na serwerze. Dzieki temu strony
 * publiczne (/, /o-aplikacji, /kontakt) nie sa dynamiczne i moga byc prerenderowane
 * statycznie - szybszy LCP i realny SEO dla niezalogowanych odwiedzajacych.
 */
export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUsername(data.user?.email ? emailToUsername(data.user.email) : null);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="app-header">
      <Link href="/" className="brand brand-link" onClick={() => setOpen(false)}>
        <span className="brand-logo">
          <NewsIcon />
        </span>
        <div>
          <div className="brand-name">
            newsy<span className="accent">.live</span>
          </div>
          <div className="brand-sub">tablica tematów</div>
        </div>
      </Link>

      <button
        type="button"
        className="nav-toggle"
        aria-label={open ? 'Zamknij menu' : 'Otwórz menu'}
        aria-expanded={open}
        aria-controls="nav-collapse"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      <div id="nav-collapse" className={`nav-collapse${open ? ' open' : ''}`}>
        <nav className="main-nav" aria-label="Menu główne">
          {LINKS.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link${active ? ' nav-link-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Dopoki nie znamy stanu sesji, nie renderujemy nic - inaczej mignelby zly przycisk. */}
        {ready && (
          <div className="user-area">
            {username ? (
              <>
                <span className="avatar">{username.charAt(0) || '?'}</span>
                <span className="user-name">{username}</span>
                <button className="btn" onClick={signOut}>
                  Wyloguj
                </button>
              </>
            ) : (
              <Link href="/login" className="btn">
                Zaloguj
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
