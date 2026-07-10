'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usernameToEmail, isValidUsername, USERNAME_PATTERN } from '@/lib/username';
import { NewsIcon, EyeIcon, EyeOffIcon } from '@/components/icons';

const DEMO_USER = 'test-user';
const DEMO_PASSWORD = 'test-password';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [username, setUsername] = useState(DEMO_USER);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const login = username.trim();
    if (!isValidUsername(login)) {
      setMessage('Login: 3-30 znaków, dozwolone litery, cyfry oraz . _ -');
      return;
    }
    setBusy(true);
    setMessage('');

    const email = usernameToEmail(login);
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-logo">
            <NewsIcon />
          </span>
          <div className="brand-name">
            newsy<span className="accent">.live</span>
          </div>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 16px' }}>
          {mode === 'signin' ? 'Zaloguj się' : 'Załóż konto'}
        </h1>

        {mode === 'signin' && (
          <p className="demo-hint">
            Konto demo jest już wpisane — kliknij <strong>Zaloguj</strong>.<br />
            login <code>{DEMO_USER}</code> · hasło <code>{DEMO_PASSWORD}</code>
          </p>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            className="input"
            type="text"
            placeholder="login"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            pattern={USERNAME_PATTERN}
            title="3-30 znaków: litery, cyfry oraz . _ -"
            autoComplete="username"
            required
          />
          <div className="field">
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              placeholder="hasło"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
            />
            <button
              type="button"
              className="field-toggle"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
              title={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Chwila…' : mode === 'signin' ? 'Zaloguj' : 'Zarejestruj'}
          </button>
        </form>

        {message && <p className="error" style={{ marginTop: 12 }}>{message}</p>}

        <button
          type="button"
          className="link-btn"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? 'Nie masz konta? Zarejestruj się' : 'Masz już konto? Zaloguj się'}
        </button>
      </div>
    </main>
  );
}
