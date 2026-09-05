import { brand } from "@/lib/brand";
import { HamburgerMenu } from "./HamburgerMenu";

export function Header() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
      <span className="font-medium tracking-tight">{brand.companyName}</span>
      <HamburgerMenu />
    </header>
  );
}
