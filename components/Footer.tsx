import Link from 'next/link';
import { AUTHOR_NAME, GITHUB_PROFILE_URL, REPO_URL } from '@/lib/site';

/** Stopka wspólna dla wszystkich stron: kto to zbudował i gdzie jest kod. */
export default function Footer() {
  return (
    <footer className="site-footer">
      <span className="site-footer-note">
        <span className="pulse-dot" aria-hidden="true" />
        auto-odświeżanie codziennie o 8:00
      </span>
      <span className="site-footer-links">
        Zbudował{' '}
        <a href={GITHUB_PROFILE_URL} target="_blank" rel="noreferrer">
          {AUTHOR_NAME}
        </a>
        <span aria-hidden="true">·</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Kod na GitHubie
        </a>
        <span aria-hidden="true">·</span>
        <Link href="/kontakt">Kontakt</Link>
      </span>
    </footer>
  );
}
