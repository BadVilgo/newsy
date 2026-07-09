// Supabase Auth operuje na adresach e-mail, ale w tej aplikacji użytkownik loguje się
// zwykłym loginem. Zamieniamy login na syntetyczny, wewnętrzny adres — żaden e-mail nie
// jest wysyłany; domena istnieje tylko po to, by spełnić format wymagany przez Supabase.
export const USERNAME_EMAIL_DOMAIN = 'newsy.local';

export const USERNAME_PATTERN = '[a-zA-Z0-9._-]{3,30}';
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

// "adam_g" -> "adam_g@newsy.local"
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

// "adam_g@newsy.local" -> "adam_g" (do wyświetlania). Obce adresy zwraca bez zmian.
export function emailToUsername(email: string): string {
  const suffix = `@${USERNAME_EMAIL_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}
