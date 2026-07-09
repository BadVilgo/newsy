'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usernameToEmail, isValidUsername, USERNAME_PATTERN } from '@/lib/username';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
    <main style={{ maxWidth: 360, margin: '80px auto' }}>
      <h1>{mode === 'signin' ? 'Zaloguj się' : 'Załóż konto'}</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="text"
          placeholder="login"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          pattern={USERNAME_PATTERN}
          title="3-30 znaków: litery, cyfry oraz . _ -"
          autoComplete="username"
          required
        />
        <input
          type="password"
          placeholder="hasło (min. 6 znaków)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? '...' : mode === 'signin' ? 'Zaloguj' : 'Zarejestruj'}
        </button>
      </form>

      {message && <p style={{ color: '#b91c1c' }}>{message}</p>}

      <button
        type="button"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        style={{ marginTop: 12, background: 'none', border: 'none', color: '#2563eb', padding: 0 }}
      >
        {mode === 'signin' ? 'Nie masz konta? Zarejestruj się' : 'Masz już konto? Zaloguj się'}
      </button>
    </main>
  );
}
