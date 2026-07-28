import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import BoxCard from './Box';
import type { Box as BoxType } from '@/lib/types';

const box: BoxType = {
  id: 'box-1',
  topic: 'UAP',
  position: 0,
  created_at: '2026-07-26T10:00:00Z',
  snapshots: [
    {
      id: 's-new',
      fetched_at: '2026-07-26T18:00:00Z',
      items: [{ text: 'Najnowszy news o UAP.', sources: [] }],
    },
    {
      id: 's-old',
      fetched_at: '2026-07-25T18:00:00Z',
      items: [{ text: 'Wczorajszy news o UAP.', sources: [] }],
    },
  ],
};

function renderBox(props: Partial<React.ComponentProps<typeof BoxCard>> = {}) {
  const defaults = {
    box,
    onDelete: vi.fn(),
    onEdit: vi.fn().mockResolvedValue(undefined),
    onRefresh: vi.fn().mockResolvedValue({ ok: true }),
    onDragHandleDown: vi.fn(),
    onMove: vi.fn(),
    isFirst: false,
    isLast: false,
  };
  const merged = { ...defaults, ...props };
  return { ...render(<BoxCard {...merged} />), props: merged };
}

describe('BoxCard', () => {
  it('pokazuje temat i najnowszy snapshot', () => {
    renderBox();
    expect(screen.getByRole('heading', { name: 'UAP' })).toBeInTheDocument();
    expect(screen.getByText('Najnowszy news o UAP.')).toBeInTheDocument();
  });

  it('przełącza zakładkę na poprzedni snapshot', async () => {
    const user = userEvent.setup();
    renderBox();

    await user.click(screen.getByRole('tab', { name: 'Poprzednie' }));

    expect(screen.getByText('Wczorajszy news o UAP.')).toBeInTheDocument();
    expect(screen.queryByText('Najnowszy news o UAP.')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Poprzednie' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  // Regresja: strzałki były kiedyś ukryte na desktopie (klasa mobile-only), przez co
  // zmiana kolejności działała wyłącznie myszą (drag & drop) - naruszenie WCAG 2.1.1.
  it('udostępnia zmianę kolejności z klawiatury', async () => {
    const user = userEvent.setup();
    const { props } = renderBox();

    await user.click(screen.getByRole('button', { name: /Przenieś temat "UAP" niżej/ }));

    expect(props.onMove).toHaveBeenCalledWith('box-1', 1);
  });

  it('blokuje strzałki na krańcach listy', () => {
    renderBox({ isFirst: true, isLast: true });
    expect(screen.getByRole('button', { name: /wyżej/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /niżej/ })).toBeDisabled();
  });

  it('pokazuje komunikat, gdy odświeżenie się nie powiedzie', async () => {
    const user = userEvent.setup();
    renderBox({
      onRefresh: vi.fn().mockResolvedValue({
        ok: false,
        error: 'Nie znaleziono istotnych wiadomości dla tego tematu z ostatnich 48h.',
      }),
    });

    await user.click(screen.getByRole('button', { name: /Odśwież temat/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ostatnich 48h/);
  });

  it('pokazuje podpowiedź, gdy brak danych w zakładce', async () => {
    const user = userEvent.setup();
    renderBox({ box: { ...box, snapshots: [box.snapshots[0]] } });

    await user.click(screen.getByRole('tab', { name: 'Poprzednie' }));

    expect(screen.getByText(/Brak danych/)).toBeInTheDocument();
  });

  it('nie ma naruszeń dostępności', async () => {
    const { container } = renderBox();
    expect(await axe(container)).toHaveNoViolations();
  });
});
