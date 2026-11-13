import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import Footer from './Footer';

describe('Footer', () => {
  it('podaje autora, link do kodu i do kontaktu', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'Adam Gnatowski' })).toHaveAttribute(
      'href',
      'https://github.com/BadVilgo',
    );
    expect(screen.getByRole('link', { name: 'Kod na GitHubie' })).toHaveAttribute(
      'href',
      'https://github.com/BadVilgo/newsy',
    );
    expect(screen.getByRole('link', { name: 'Kontakt' })).toHaveAttribute('href', '/kontakt');
  });

  it('nie ma naruszeń dostępności', async () => {
    const { container } = render(<Footer />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
