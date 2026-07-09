import { createClient } from '@supabase/supabase-js';

// Klient z kluczem service_role — POMIJA RLS. Używany WYŁĄCZNIE po stronie serwera
// w zadaniu cron, które musi odświeżyć boxy wszystkich użytkowników.
// Nigdy nie eksponować tego klucza w przeglądarce.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
