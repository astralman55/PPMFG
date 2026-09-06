import { HamburgerMenu } from "./HamburgerMenu";
import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
      <Logo className="h-9" priority />
      <HamburgerMenu />
    </header>
  );
}
