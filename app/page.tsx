import { createClient } from '@/lib/supabase/server';
import { emailToUsername } from '@/lib/username';
import Dashboard from '@/components/Dashboard';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <Dashboard username={user?.email ? emailToUsername(user.email) : ''} />;
}
