'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export default function Providers({ children }: { children: React.ReactNode }) {
  // QueryClient tworzymy w stanie, a nie w module - inaczej przy SSR wszyscy uzytkownicy
  // dzieliliby jedna instancje cache'a.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Newsy odswiezaja sie raz dziennie, wiec agresywny refetch nic nie wnosi.
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
