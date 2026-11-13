import { describe, it, expect } from 'vitest';
import {
  usernameToEmail,
  emailToUsername,
  isValidUsername,
  USERNAME_PATTERN,
} from '@/lib/username';

describe('isValidUsername', () => {
  it('akceptuje poprawne loginy', () => {
    expect(isValidUsername('test-user')).toBe(true);
    expect(isValidUsername('adam_g.91')).toBe(true);
  });

  it('odrzuca za krótkie, za długie i ze znakami spoza dozwolonych', () => {
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(31))).toBe(false);
    expect(isValidUsername('zła spacja')).toBe(false);
    expect(isValidUsername('user@x')).toBe(false);
  });
});

// Regresja: przeglądarki kompilują atrybut `pattern` z flagą `v`, w której nieucieczony
// myślnik w klasie znaków jest błędem składni. Chrome wypisywał wtedy błąd w konsoli
// i po cichu wyłączał walidację pola logowania.
describe('USERNAME_PATTERN (atrybut pattern pola logowania)', () => {
  const asBrowser = () => new RegExp(`^(?:${USERNAME_PATTERN})$`, 'v');

  it('kompiluje się tak, jak robi to przeglądarka (flaga v)', () => {
    expect(asBrowser).not.toThrow();
  });

  it('akceptuje i odrzuca te same loginy co walidacja w kodzie', () => {
    const pattern = asBrowser();
    for (const login of ['test-user', 'adam_g.91', 'ab', 'zła spacja', 'user@x', 'a'.repeat(31)]) {
      expect(pattern.test(login)).toBe(isValidUsername(login));
    }
  });
});

describe('usernameToEmail / emailToUsername', () => {
  it('zamienia login na syntetyczny adres i z powrotem', () => {
    const email = usernameToEmail('Test-User');
    expect(email).toBe('test-user@newsy.local');
    expect(emailToUsername(email)).toBe('test-user');
  });

  it('obce adresy zwraca bez zmian', () => {
    expect(emailToUsername('ktos@gmail.com')).toBe('ktos@gmail.com');
  });
});
