import { brand } from "@/lib/brand";

/**
 * CLAUDE_CODE_BRIEF.md §18, section 2: "There are no customers yet. Do not
 * create a placeholder logo strip, do not use stock company logos, and do
 * not invent names." This renders nothing until brand.certifications has
 * real, earned entries (AS9100, ISO, etc.) - never client logos, since no
 * customer has agreed to be named. Activate a client-logo version of this
 * component only after the first 5-10 real customers agree to be named, and
 * only with logos they've actually provided for that use.
 */
export function TrustStrip() {
  if (brand.certifications.length === 0) return null;

  return (
    <div className="mx-auto flex max-w-5xl flex-wrap gap-3 border-t border-rule px-4 py-6 text-xs text-graphite">
      {brand.certifications.map((cert) => (
        <span key={cert} className="border border-rule px-2 py-1">
          {cert}
        </span>
      ))}
    </div>
  );
}
