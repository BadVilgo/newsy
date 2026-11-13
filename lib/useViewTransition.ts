'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

type TransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => unknown;
};

// Gdyby render z jakiegoś powodu nie nastąpił (np. zmiana niczego nie zmieniła), nie chcemy
// zamrażać strony do limitu przeglądarki - po tym czasie przejście startuje tak czy inaczej.
const COMMIT_TIMEOUT_MS = 150;

/**
 * Płynne przestawianie elementów przez View Transitions API.
 *
 * Przeglądarka robi zrzut „przed", woła funkcję zmieniającą stan i czeka na „po". React
 * renderuje jednak asynchronicznie (TanStack Query powiadamia obserwatorów w kolejnym
 * zadaniu), więc obietnica przekazana przeglądarce rozwiązuje się dopiero w
 * useLayoutEffect - czyli gdy nowy układ jest już w DOM.
 *
 * Bez wsparcia API (starsze przeglądarki, jsdom w testach) albo przy włączonym
 * „ogranicz ruch" zmiana wykonuje się od razu, bez animacji.
 */
export function useViewTransition() {
  const resolveCommit = useRef<(() => void) | null>(null);

  // Bez tablicy zależności: po KAŻDYM zatwierdzonym renderze zwalniamy czekające przejście.
  useLayoutEffect(() => {
    resolveCommit.current?.();
    resolveCommit.current = null;
  });

  return useCallback((update: () => void) => {
    const doc = document as TransitionDocument;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (typeof doc.startViewTransition !== 'function' || reduceMotion) {
      update();
      return;
    }

    doc.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          resolveCommit.current = resolve;
          update();
          setTimeout(resolve, COMMIT_TIMEOUT_MS);
        }),
    );
  }, []);
}
