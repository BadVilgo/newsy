import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import BulletItem from './BulletItem';
import type { Bullet } from '@/lib/types';

const bullet: Bullet = {
  text: 'Prezydent ogłosił nowy program inwestycyjny.',
  sources: [{ title: 'Nowy program inwestycyjny', url: 'https://example.com/a' }],
  published: '2026-07-26T16:15:00+00:00',
};

function renderBullet(overrides: Partial<Bullet> = {}) {
  return render(
    <ul>
      <BulletItem bullet={{ ...bullet, ...overrides }} />
    </ul>,
  );
}

describe('BulletItem', () => {
  it('pokazuje treść newsa i datę publikacji', () => {
    renderBullet();
    expect(screen.getByText(bullet.text)).toBeInTheDocument();
    // Data renderowana jest w czasie lokalnym, więc sprawdzamy element <time>, nie dosłowny tekst.
    const time = screen.getByRole('time');
    expect(time).toHaveAttribute('dateTime', bullet.published);
  });

  it('ukrywa źródła do czasu kliknięcia i przełącza je z powrotem', async () => {
    const user = userEvent.setup();
    renderBullet();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /Źródła \(1\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(screen.getByRole('link', { name: /Nowy program/ })).toHaveAttribute(
      'href',
      'https://example.com/a',
    );
    expect(screen.getByRole('button', { name: /Ukryj źródła/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByRole('button', { name: /Ukryj źródła/ }));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('oznacza źródła zagraniczne znacznikiem US', () => {
    renderBullet({ foreign: true });
    expect(screen.getByText('US')).toBeInTheDocument();
  });

  it('nie renderuje daty, gdy jej brak', () => {
    renderBullet({ published: undefined });
    expect(screen.queryByRole('time')).not.toBeInTheDocument();
  });

  it('nie ma naruszeń dostępności', async () => {
    const { container } = renderBullet({ foreign: true });
    expect(await axe(container)).toHaveNoViolations();
  });
});
