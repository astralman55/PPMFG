import { Fragment } from "react";
import type { ApplicableSpec } from "@/lib/pricing/engine";
import { verifiedSpecs } from "@/lib/pricing/verified-specs";

/**
 * CLAUDE_CODE_BRIEF.md §20.3 - collapsed by default, and hidden ENTIRELY
 * (not shown empty) when the selected material/brand has zero specs that
 * pass the verifiedSpecs() hard gate. Every brand ships with an empty
 * applicable_specs list today, so in practice this renders nothing anywhere
 * on the live site until real, sourced standard designations are added to
 * config.json.
 */
export function SpecsAccordion({ specs }: { specs: ApplicableSpec[] | undefined }) {
  const verified = verifiedSpecs(specs);
  if (verified.length === 0) return null;

  return (
    <details className="mt-2 border-t border-neutral-200 py-2 text-sm dark:border-neutral-800">
      <summary className="cursor-pointer font-medium">Applicable specs</summary>
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        {verified.map((s) => (
          <Fragment key={s.designation}>
            <span className="font-mono font-medium">{s.designation}</span>
            <span className="text-neutral-500">{s.description}</span>
          </Fragment>
        ))}
      </div>
    </details>
  );
}
