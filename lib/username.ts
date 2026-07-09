export const USERNAME_EMAIL_DOMAIN = 'newsy.local';

export const USERNAME_PATTERN = '[a-zA-Z0-9._-]{3,30}';
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

export function emailToUsername(email: string): string {
  const suffix = `@${USERNAME_EMAIL_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}
