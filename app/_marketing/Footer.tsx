import { brand } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="mx-auto max-w-5xl border-t border-rule px-4 py-10 text-sm text-graphite">
      <p>
        {brand.companyName} - {brand.address.city}, {brand.address.state}
      </p>
    </footer>
  );
}
