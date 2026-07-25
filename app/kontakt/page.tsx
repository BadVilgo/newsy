import type { Metadata } from 'next';
import { currentUsername } from '@/lib/currentUsername';
import Nav from '@/components/Nav';
import { LinkIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Kontakt',
  description: 'Skontaktuj się z autorem newsy.live - e-mail i GitHub.',
  alternates: { canonical: '/kontakt' },
};

const EMAIL = 'gnatowski.adam.biz@gmail.com';
const GITHUB = 'https://github.com/BadVilgo';

export default async function ContactPage() {
  const username = await currentUsername();

  return (
    <main className="container">
      <Nav username={username} />

      <article className="prose prose-narrow">
        <span className="hero-badge">Kontakt</span>
        <h1 className="prose-title">Masz pytanie lub feedback?</h1>
        <p className="prose-lead">
          Chętnie porozmawiam o projekcie, współpracy albo Twoich uwagach. Najszybciej złapiesz
          mnie mailowo lub na GitHubie.
        </p>

        <div className="contact-card">
          <a className="contact-row" href={`mailto:${EMAIL}`}>
            <span className="contact-label">E-mail</span>
            <span className="contact-value">
              <LinkIcon />
              {EMAIL}
            </span>
          </a>
          <a className="contact-row" href={GITHUB} target="_blank" rel="noreferrer">
            <span className="contact-label">GitHub</span>
            <span className="contact-value">
              <LinkIcon />
              github.com/BadVilgo
            </span>
          </a>
        </div>

        <p className="prose-text">
          <a className="btn btn-primary btn-lg" href={`mailto:${EMAIL}`}>
            Napisz e-mail
          </a>
        </p>
      </article>
    </main>
  );
}
