import { brand } from "@/lib/brand";

/** True placeholder values (see lib/brand.ts) never render - showing "REPLACE_WITH_PHONE" to a customer would be worse than showing nothing. */
function isSet(value: string): boolean {
  return value.length > 0 && !value.startsWith("REPLACE_WITH_");
}

export function Footer() {
  return (
    <footer className="mx-auto max-w-5xl border-t border-rule px-4 py-10 text-sm text-graphite">
      <p>
        {brand.companyName}
        {isSet(brand.address.line1) ? `, ${brand.address.line1}` : ""} - {brand.address.city}, {brand.address.state}
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
    </footer>
  );
}
