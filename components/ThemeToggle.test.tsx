import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import ThemeToggle, { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.clear();
  });

  it('przełącza motyw na <html> i zapamiętuje wybór', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: 'Przełącz motyw jasny/ciemny' });

    await user.click(button);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    await user.click(button);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  // Skrypt z <head> działa przed hydracją - przywraca zapamiętany motyw bez mignięcia.
  it('skrypt startowy przywraca zapamiętany jasny motyw', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('skrypt startowy zostawia domyślny ciemny motyw, gdy nic nie zapisano', () => {
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('nie ma naruszeń dostępności', async () => {
    const { container } = render(<ThemeToggle />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
