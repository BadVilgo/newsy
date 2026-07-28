import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import Nav from './Nav';

const push = vi.fn();
const signOut = vi.fn().mockResolvedValue({});
let currentUser: { email: string } | null = null;
let pathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: currentUser } }),
      signOut,
    },
  }),
}));

describe('Nav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = null;
    pathname = '/';
  });

  it('renderuje wszystkie pozycje menu', () => {
    render(<Nav />);
    for (const label of ['Home', 'Newsy', 'O aplikacji', 'Kontakt']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('oznacza aktywną stronę atrybutem aria-current', () => {
    pathname = '/o-aplikacji';
    render(<Nav />);
    expect(screen.getByRole('link', { name: 'O aplikacji' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('rozwija i zwija menu mobilne', async () => {
    const user = userEvent.setup();
    render(<Nav />);

    const toggle = screen.getByRole('button', { name: 'Otwórz menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    const opened = screen.getByRole('button', { name: 'Zamknij menu' });
    expect(opened).toHaveAttribute('aria-expanded', 'true');

    await user.click(opened);
    expect(screen.getByRole('button', { name: 'Otwórz menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('pokazuje przycisk logowania niezalogowanemu odwiedzającemu', async () => {
    render(<Nav />);
    expect(await screen.findByRole('link', { name: 'Zaloguj' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wyloguj' })).not.toBeInTheDocument();
  });

  it('pokazuje login i wylogowuje zalogowanego użytkownika', async () => {
    currentUser = { email: 'test-user@newsy.local' };
    const user = userEvent.setup();
    render(<Nav />);

    expect(await screen.findByText('test-user')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Wyloguj' }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('nie ma naruszeń dostępności', async () => {
    const { container } = render(<Nav />);
    await screen.findByRole('link', { name: 'Zaloguj' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
