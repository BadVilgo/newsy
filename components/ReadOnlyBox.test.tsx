import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import ReadOnlyBox from './ReadOnlyBox';
import type { Box } from '@/lib/types';

const box: Box = {
  id: 'box-1',
  topic: 'Nvidia',
  position: 0,
  created_at: '2026-07-26T10:00:00Z',
  snapshots: [
    {
      id: 's-new',
      fetched_at: '2026-07-26T06:05:00Z',
      items: [
        {
          text: 'Dzisiejszy news o Nvidii.',
          sources: [{ title: 'Artykuł źródłowy', url: 'https://example.com/a' }],
          published: '2026-07-26T04:00:00+00:00',
        },
      ],
    },
    {
      id: 's-old',
      fetched_at: '2026-07-25T06:05:00Z',
      items: [{ text: 'Wczorajszy news o Nvidii.', sources: [] }],
    },
  ],
};

describe('ReadOnlyBox (publiczny podgląd kafelka)', () => {
  it('pokazuje temat, czas odświeżenia i najnowsze newsy', () => {
    render(<ReadOnlyBox box={box} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Nvidia' })).toBeInTheDocument();
    expect(screen.getByText('Dzisiejszy news o Nvidii.')).toBeInTheDocument();
    // 06:05 UTC to 08:05 czasu polskiego latem - niezależnie od strefy środowiska testów.
    expect(screen.getByText('26.07, 08:05')).toBeInTheDocument();
  });

  it('nie ma żadnych akcji edycji - to podgląd tylko do odczytu', () => {
    render(<ReadOnlyBox box={box} />);
    for (const name of [/Usuń/, /Edytuj/, /Odśwież/, /Przenieś/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('pozwala przełączyć zakładkę i rozwinąć źródła', async () => {
    const user = userEvent.setup();
    render(<ReadOnlyBox box={box} />);

    await user.click(screen.getByRole('button', { name: /Źródła \(1\)/ }));
    expect(screen.getByRole('link', { name: /Artykuł źródłowy/ })).toHaveAttribute(
      'href',
      'https://example.com/a',
    );

    await user.click(screen.getByRole('tab', { name: 'Poprzednie' }));
    expect(screen.getByText('Wczorajszy news o Nvidii.')).toBeInTheDocument();
    expect(screen.queryByText('Dzisiejszy news o Nvidii.')).not.toBeInTheDocument();
  });

  // Lista wjeżdża animacją dopiero po zmianie - treść prerenderowana ma być widoczna od razu.
  it('animuje listę po zmianie zakładki, ale nie przy pierwszym renderze', async () => {
    const user = userEvent.setup();
    render(<ReadOnlyBox box={box} />);
    expect(screen.getByRole('tabpanel')).not.toHaveClass('news-fade');

    await user.click(screen.getByRole('tab', { name: 'Poprzednie' }));
    expect(screen.getByRole('tabpanel')).toHaveClass('news-fade');
  });

  it('używa nagłówka h3, gdy kafelek stoi pod nagłówkiem sekcji', () => {
    render(<ReadOnlyBox box={box} headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Nvidia' })).toBeInTheDocument();
  });

  it('nie ma naruszeń dostępności', async () => {
    const { container } = render(<ReadOnlyBox box={box} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
