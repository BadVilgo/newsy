'use client';

import { MoonIcon, SunIcon } from './icons';

export const THEME_STORAGE_KEY = 'theme';
const THEME_COLORS = { dark: '#0e131f', light: '#f5f7fb' } as const;

type Theme = keyof typeof THEME_COLORS;

/**
 * Skrypt wykonywany w <head> PRZED pierwszym malowaniem: ustawia zapamiętany motyw na <html>,
 * żeby strona nie mignęła ciemnym tłem u kogoś, kto wybrał jasny. Domyślny jest motyw ciemny.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'){document.documentElement.dataset.theme='light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','${THEME_COLORS.light}')}}catch(e){}`;

/**
 * Przełącznik jasny/ciemny. Stan żyje w atrybucie data-theme na <html> (i w localStorage),
 * a nie w stanie Reacta - obie ikony są w DOM, a widoczną wybiera CSS. Dzięki temu serwer
 * i przeglądarka renderują to samo i nie ma błędu hydracji ani mignięcia złej ikony.
 */
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next: Theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[next]);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* tryb prywatny / zablokowany storage - motyw działa do przeładowania strony */
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label="Przełącz motyw jasny/ciemny"
      title="Przełącz motyw jasny/ciemny"
    >
      <span className="theme-icon-dark">
        <SunIcon />
      </span>
      <span className="theme-icon-light">
        <MoonIcon />
      </span>
    </button>
  );
}
