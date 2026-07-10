import { describe, it, expect } from 'vitest';
import { usernameToEmail, emailToUsername, isValidUsername } from '@/lib/username';

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
