import Link from "next/link";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { getMaterialContent } from "@/lib/materials/content";
import { materialSwatch } from "@/app/_marketing/swatches";

const CFG = cfgJson as unknown as PricingConfig;

/** One card per material - CLAUDE_CODE_BRIEF.md §17.2. Used on both /materials and the homepage's featured strip. */
export function MaterialCard({ code }: { code: string }) {
  const mat = CFG.materials[code];
  const content = getMaterialContent(code);
  const namedBrands = Object.keys(mat.brands).length - 1; // exclude GENERIC

  const flags: string[] = [];
  if (mat.residual_stress_flag) flags.push("Residual stress");
  if (mat.solvent_stress_crack_sensitive) flags.push("Solvent sensitive");
  if (mat.grain_sensitive) flags.push("Grain sensitive");

  return (
    <Link href={`/materials/${content.slug}`} className="flex gap-4 border border-rule p-4 hover:border-ink">
      <div className="h-16 w-16 shrink-0 border border-rule" style={{ background: materialSwatch(code) }} aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">{mat.label}</p>
        <p className="text-xs text-graphite">{mat.family}</p>
        <p className="mt-1 text-sm text-graphite">{content.hero_line}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs tabular-nums text-graphite">
          <span>{mat.density_lb_in3.toFixed(4)} lb/in³</span>
          <span>
            {mat.stock_thicknesses_in[0]}-{mat.stock_thicknesses_in[mat.stock_thicknesses_in.length - 1]} in stock
          </span>
          <span>
            {namedBrands} brand{namedBrands === 1 ? "" : "s"}
          </span>
        </div>
        {flags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {flags.map((f) => (
              <span key={f} className="border border-rule px-1.5 py-0.5 text-[10px] text-graphite">
                {f}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
