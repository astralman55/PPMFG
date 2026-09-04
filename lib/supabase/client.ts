"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client, used only by the /ops login page to sign in.
 * Anon key only - never the service-role key. createBrowserClient (not
 * plain createClient from @supabase/supabase-js) is what writes the session
 * into cookies rather than localStorage, which is what lets middleware.ts
 * read it on the server to gate every other /ops request.
 */
export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
