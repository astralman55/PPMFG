import Link from "next/link";
import { brand } from "@/lib/brand";
import { Logo } from "./Logo";

/** True placeholder values (see lib/brand.ts) never render - showing "REPLACE_WITH_PHONE" to a customer would be worse than showing nothing. */
function isSet(value: string): boolean {
  return value.length > 0 && !value.startsWith("REPLACE_WITH_");
}

const NAV_LINKS = [
  { href: "/quote", label: "Get a price" },
  { href: "/materials", label: "Materials" },
  { href: "/learn", label: "Learn" },
  { href: "/drops", label: "Drops" },
  { href: "/about", label: "About" },
];

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Sale" },
  { href: "/returns", label: "Returns & Refunds" },
  { href: "/privacy", label: "Privacy Policy" },
];

export function Footer() {
  return (
    <footer className="mx-auto max-w-5xl border-t border-rule px-4 py-10 text-sm text-graphite">
      <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
        <div>
          <Logo className="h-7" />
          <p className="mt-3">
            {isSet(brand.address.line1) ? `${brand.address.line1}, ` : ""}
            {brand.address.city}, {brand.address.state}
            {isSet(brand.address.zip) ? ` ${brand.address.zip}` : ""}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4">
            {isSet(brand.phone) ? <span>{brand.phone}</span> : null}
            {isSet(brand.email) ? (
              <a href={`mailto:${brand.email}`} className="hover:underline">
                {brand.email}
              </a>
            ) : null}
            {brand.qualityPolicyUrl ? (
              <a href={brand.qualityPolicyUrl} className="hover:underline">
                Quality policy
              </a>
            ) : null}
          </p>
        </div>

        <nav aria-label="Site" className="flex flex-col gap-1">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-rule pt-6 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-1">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-graphite">
          &copy; {new Date().getFullYear()} {brand.companyName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
