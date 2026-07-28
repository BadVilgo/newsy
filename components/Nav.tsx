'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { NewsIcon, MenuIcon, CloseIcon } from './icons';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/newsy', label: 'Newsy' },
  { href: '/o-aplikacji', label: 'O aplikacji' },
  { href: '/kontakt', label: 'Kontakt' },
];

export default function Nav({ username }: { username: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
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

        <div className="user-area">
          {username && <span className="avatar">{username.charAt(0) || '?'}</span>}
          {username && <span className="user-name">{username}</span>}
          <button className="btn" onClick={signOut}>
            Wyloguj
          </button>
        </div>
      </div>
    </header>
  );
}
