/**
 * Bramka pory dnia dla codziennego odswiezania.
 *
 * GitHub Actions liczy harmonogram w UTC i nie ogarnia czasu letniego/zimowego, wiec sam
 * cron nie utrzyma stalej godziny lokalnej. Workflow odpala sie w dwoch oknach (6:xx i
 * 7:xx UTC), a o tym, ktore z nich faktycznie zrobi robote, decyduje ta funkcja.
 */
export const START_HOUR_PL = 8;

/** Aktualna godzina w strefie Europe/Warsaw - CET/CEST bez wlasnej arytmetyki na offsetach. */
export function warsawHour(now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  // Czesc wersji ICU zwraca "24" zamiast "00" o polnocy.
  return Number(hour) % 24;
}

/** Czy jest jeszcze za wczesnie, zeby odswiezac newsy? */
export function isBeforeStartHour(now: Date = new Date()): boolean {
  return warsawHour(now) < START_HOUR_PL;
}
