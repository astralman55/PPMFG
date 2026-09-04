import type { ReactNode } from "react";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";
// This layout intentionally lives under app/ops/(console)/ - a route group
// so app/ops/login (a sibling of the group, not a child) doesn't inherit
// this signed-in nav chrome.

export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen text-neutral-900 dark:text-neutral-100">
      <nav className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-5 text-sm">
          <span className="font-semibold">Polly Plastics ops</span>
          <Link href="/ops" className="hover:underline">
            Queue
          </Link>
          <Link href="/ops/lots" className="hover:underline">
            Lot library
          </Link>
        </div>
        <SignOutButton />
      </nav>
      <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}
