"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const MENU_ITEMS = [
  { label: "Get quote", href: "/quote" },
  { label: "Shop", href: "/materials" },
  { label: "Drops", href: "/drops" },
  { label: "Guides", href: "/learn" },
  { label: "About / News", href: "/about" },
  { label: "Log in", href: "/ops/login" },
];

/** The homepage's only nav chrome besides the logo - a stackable menu button, top right. */
export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 border border-rule"
      >
        <span className={`h-px w-4 bg-ink transition-transform ${open ? "translate-y-2 rotate-45" : ""}`} />
        <span className={`h-px w-4 bg-ink transition-opacity ${open ? "opacity-0" : ""}`} />
        <span className={`h-px w-4 bg-ink transition-transform ${open ? "-translate-y-2 -rotate-45" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-10 flex w-48 flex-col border border-rule bg-paper py-2 shadow-sm">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm hover:bg-rule/30"
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
