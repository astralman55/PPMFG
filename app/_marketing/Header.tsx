import Link from "next/link";
import { brand } from "@/lib/brand";

export function Header() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
      <span className="font-medium tracking-tight">{brand.companyName}</span>
      <Link href="/quote" className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
        Get price
      </Link>
    </header>
  );
}
