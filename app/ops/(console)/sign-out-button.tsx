"use client";

import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await getSupabaseBrowserClient().auth.signOut();
        router.push("/ops/login");
        router.refresh();
      }}
      className="text-sm text-neutral-500 hover:underline"
    >
      Sign out
    </button>
  );
}
