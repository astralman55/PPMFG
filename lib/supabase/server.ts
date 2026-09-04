import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cookie-aware Supabase client for Server Components and route handlers
 * under /ops and /api/ops - reads the session middleware.ts already
 * verified. Anon key only; RLS still applies (see supabase/migrations for
 * why that's fine - ops pages read/write through service-role helpers for
 * actual data, this client is only for "who is signed in").
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component that can't set cookies - fine,
          // middleware.ts already refreshed the session for this request.
        }
      },
    },
  });
}

/** The signed-in ops user's email, or null if nobody is signed in. */
export async function getOpsUserEmail(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}
