import type { AxeMatchers } from 'vitest-axe/matchers';

// vitest-axe rozszerza globalna przestrzen `Vi`, ktorej Vitest 2 juz nie uzywa do typowania
// asercji - bez tego `expect(...).toHaveNoViolations()` dziala w runtime, ale tsc go nie widzi.
declare module 'vitest' {
  interface Assertion<T = unknown> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
