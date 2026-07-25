import { createClient } from '@/lib/supabase/server';
import { emailToUsername } from '@/lib/username';

/** Nazwa uzytkownika do naglowka (Nav) - wyliczana z e-maila zalogowanej osoby. */
export async function currentUsername(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ? emailToUsername(user.email) : '';
}
