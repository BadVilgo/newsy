import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import * as axeMatchers from 'vitest-axe/matchers';

// Matchery do asercji na DOM (toBeInTheDocument) i do audytu dostepnosci (toHaveNoViolations).
expect.extend(axeMatchers);

// Bez `globals: true` automatyczne sprzatanie RTL sie nie rejestruje - inaczej kolejne
// testy renderowalyby sie do tego samego DOM i zapytania znajdowalyby duplikaty.
afterEach(() => cleanup());
