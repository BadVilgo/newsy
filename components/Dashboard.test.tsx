import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './Dashboard';
import type { Box as BoxType } from '@/lib/types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/newsy',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }), signOut: vi.fn() },
  }),
}));

const boxes: BoxType[] = [
  {
    id: 'box-1',
    topic: 'UAP',
    position: 0,
    created_at: '2026-07-26T10:00:00Z',
    snapshots: [
      { id: 's1', fetched_at: '2026-07-26T18:00:00Z', items: [{ text: 'News o UAP.', sources: [] }] },
    ],
  },
  {
    id: 'box-2',
    topic: 'Polska',
    position: 1,
    created_at: '2026-07-26T10:00:00Z',
    snapshots: [],
  },
];

const realFetch = global.fetch;

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

/** Prosty router odpowiedzi - domyślnie zwraca listę boxów. */
function mockApi(handler: (url: string, init?: RequestInit) => unknown) {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const result = await handler(String(url), init);
    return result as Response;
  }) as unknown as typeof fetch;
}

const ok = (body: unknown) => ({ ok: true, json: async () => body });

describe('Dashboard', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('pokazuje kafelki pobrane z API', async () => {
    mockApi(() => ok({ boxes }));
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'UAP' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Polska' })).toBeInTheDocument();
    expect(screen.getByText('News o UAP.')).toBeInTheDocument();
  });

  it('pokazuje stan pusty, gdy nie ma tematów', async () => {
    mockApi(() => ok({ boxes: [] }));
    renderDashboard();

    expect(await screen.findByText(/Zacznij od pierwszego tematu/)).toBeInTheDocument();
  });

  it('pokazuje błąd pobierania', async () => {
    mockApi(() => ({ ok: false, json: async () => ({ error: 'Niezalogowany.' }) }));
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Niezalogowany.');
  });

  // Optimistic update: kafelek znika od razu, mimo że żądanie DELETE nigdy się nie kończy.
  it('usuwa kafelek natychmiast, nie czekając na serwer', async () => {
    const user = userEvent.setup();
    mockApi((url, init) => {
      if (init?.method === 'DELETE') return new Promise(() => {});
      return ok({ boxes });
    });
    renderDashboard();

    await screen.findByRole('heading', { name: 'UAP' });
    await user.click(screen.getByRole('button', { name: /Usuń temat "UAP"/ }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'UAP' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Polska' })).toBeInTheDocument();
  });

  it('zapisuje nową kolejność po użyciu strzałek', async () => {
    const user = userEvent.setup();
    const calls: string[][] = [];
    mockApi((url, init) => {
      if (url.includes('/api/boxes/reorder')) {
        calls.push(JSON.parse(String(init?.body)).ids);
        return ok({ ok: true });
      }
      return ok({ boxes });
    });
    renderDashboard();

    await screen.findByRole('heading', { name: 'UAP' });
    await user.click(screen.getByRole('button', { name: /Przenieś temat "UAP" niżej/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual(['box-2', 'box-1']);
  });
});
