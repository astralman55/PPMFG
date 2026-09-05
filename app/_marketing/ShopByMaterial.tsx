"use client";

import { useState } from "react";
import Link from "next/link";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { materialContent } from "@/lib/materials/content";
import { materialSwatch } from "./swatches";

const CFG = cfgJson as unknown as PricingConfig;

/**
 * CLAUDE_CODE_BRIEF.md §18, section 3 - the one section worth replicating
 * closely from Nox. Two tabs: by material family, and by form. Only "sheet"
 * exists as a form today, but the tab structure is built so rod or tube can
 * be added later without a rework - see the FORM_TABS map below.
 */
const FORM_TABS: Record<string, string[]> = {
  Sheet: Object.keys(CFG.materials),
};

export function ShopByMaterial() {
  const [tab, setTab] = useState<"family" | "form">("family");

  const byFamily = new Map<string, string[]>();
  for (const [code, m] of Object.entries(CFG.materials)) {
    const list = byFamily.get(m.family) ?? [];
    list.push(code);
    byFamily.set(m.family, list);
  }
  const groups = tab === "family" ? Array.from(byFamily.entries()) : Object.entries(FORM_TABS);

  return (
    <section className="mx-auto max-w-5xl border-t border-rule px-4 py-14">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Shop by material</h2>
        <Link href="/materials" className="text-sm text-amber hover:underline">
          See all materials and specs
        </Link>
      </div>

      <div className="mt-4 flex gap-4 border-b border-rule text-sm">
        <button
          onClick={() => setTab("family")}
          className={`border-b-2 pb-2 ${tab === "family" ? "border-ink font-medium" : "border-transparent text-graphite"}`}
        >
          By material family
        </button>
        <button
          onClick={() => setTab("form")}
          className={`border-b-2 pb-2 ${tab === "form" ? "border-ink font-medium" : "border-transparent text-graphite"}`}
        >
          By form
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-8">
        {groups.map(([label, codes]) => (
          <div key={label}>
            <h3 className="text-sm font-medium uppercase tracking-wide text-graphite">{label}</h3>
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
