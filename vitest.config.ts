import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // tsconfig Nexta ma jsx: "preserve" (transformacją zajmuje się Next), więc dla testów
  // trzeba włączyć automatyczny transform JSX - inaczej "React is not defined".
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    // Logika serwerowa dziala w node; testy komponentow (.test.tsx) potrzebuja DOM.
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
  },
});
