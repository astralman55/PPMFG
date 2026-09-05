import Link from "next/link";
import { brand } from "@/lib/brand";
import { HamburgerMenu } from "./HamburgerMenu";

export function Header() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
      <Link href="/" className="font-medium tracking-tight hover:opacity-80">
        {brand.companyName}
      </Link>
      <HamburgerMenu />
    </header>
  );
}
