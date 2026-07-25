'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { NewsIcon } from './icons';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/newsy', label: 'Newsy' },
  { href: '/newsy-2', label: 'Newsy 2' },
  { href: '/o-aplikacji', label: 'O aplikacji' },
  { href: '/kontakt', label: 'Kontakt' },
];

export default function Nav({ username }: { username: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="app-header">
      <Link href="/" className="brand brand-link">
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
    </header>
  );
}
