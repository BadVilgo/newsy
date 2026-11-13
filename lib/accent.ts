const ACCENTS = ['#3fb6a8', '#e2554f', '#5aa9f0', '#e0a83f', '#9b8cff', '#4fbf7b'];

/** Stały kolor akcentu kafelka wyliczany z jego id - ten sam temat ma zawsze ten sam kolor. */
export function accentFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}
