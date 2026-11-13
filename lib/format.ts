/**
 * "26.07, 18:15" w czasie polskim. Strefa jest ustawiona jawnie, bo te same daty renderują
 * się na serwerze (prerender /demo i strony głównej, UTC) i w przeglądarce - bez tego serwer
 * i klient wypisałyby inną godzinę, a React zgłosiłby błąd hydracji.
 * Niepoprawna data nie wywraca renderu - zwracamy null.
 */
export function formatDateTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
