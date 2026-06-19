import { createClient } from "@supabase/supabase-js";

// Verifies that `password` is the caller's current password.
// Uses an isolated supabase-js client (NOT the SSR cookie-bound one) so a
// failed sign-in attempt does not mutate the active session cookies.
export async function verifyCurrentPassword(
  email: string,
  password: string,
): Promise<boolean> {
  if (!email || !password) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}
