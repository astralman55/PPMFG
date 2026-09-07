import { HamburgerMenu } from "./HamburgerMenu";
import { Logo } from "./Logo";

/**
 * `maxWidth` should match the max-w-* on the page's own <main> below it, so
 * the logo's left edge lines up with the page content instead of sitting at
 * the wider homepage width on narrower pages (About, Terms, etc.).
 */
export function Header({ maxWidth = "max-w-5xl" }: { maxWidth?: string }) {
  return (
    <header className={`mx-auto flex items-center justify-between px-4 py-5 ${maxWidth}`}>
      <Logo className="h-14" priority />
      <HamburgerMenu />
    </header>
  );
}
