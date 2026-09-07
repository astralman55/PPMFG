import Link from "next/link";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { materialContent } from "@/lib/materials/content";
import { materialSwatch } from "./swatches";

const CFG = cfgJson as unknown as PricingConfig;

/**
 * The complete material list, grouped by family - deliberately no tabbed
 * "by family / by form" toggle here anymore. That was modeled too closely
 * on Nox Metals' own tabbed grid; this is the plain, complete list instead,
 * with the "Shop now" deep-link into /quote kept.
 */
export function ShopByMaterial() {
  const byFamily = new Map<string, string[]>();
  for (const [code, m] of Object.entries(CFG.materials)) {
    const list = byFamily.get(m.family) ?? [];
    list.push(code);
    byFamily.set(m.family, list);
  }

  return (
    <section className="mx-auto max-w-5xl border-t border-rule px-4 py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-amber">Catalog</p>
          <h2 className="mt-1 text-2xl font-medium tracking-tight sm:text-3xl">Shop by material</h2>
        </div>
        <Link href="/materials" className="text-sm text-amber hover:underline">
          See all materials and specs
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-8">
        {Array.from(byFamily.entries()).map(([family, codes]) => (
          <div key={family}>
            <h3 className="text-sm font-medium uppercase tracking-wide text-graphite">{family}</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {codes.map((code) => {
                const mat = CFG.materials[code];
                const content = materialContent[code];
                const namedBrands = Object.keys(mat.brands).length - 1;
                return (
                  <div key={code} className="flex flex-col gap-2 border border-rule p-4">
                    <div className="h-8 w-8 border border-rule" style={{ background: materialSwatch(code) }} aria-hidden />
                    <p className="font-medium">{mat.label}</p>
                    <p className="text-xs text-graphite">{content.hero_line}</p>
                    <div className="flex flex-wrap gap-x-4 font-mono text-xs tabular-nums text-graphite">
                      <span>{mat.density_lb_in3.toFixed(4)} lb/in³</span>
                      <span>
                        {namedBrands} brand{namedBrands === 1 ? "" : "s"}
                      </span>
                    </div>
                    <Link href={`/quote?material=${code}`} className="mt-1 text-sm font-medium text-amber hover:underline">
                      Shop now
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
