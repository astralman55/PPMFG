import type { Metadata } from "next";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { MaterialCard } from "./MaterialCard";
import { Footer } from "../_marketing/Footer";
import { Logo } from "../_marketing/Logo";

const CFG = cfgJson as unknown as PricingConfig;

export const metadata: Metadata = {
  title: "Materials | Precision Plastics Manufacturing",
  description: "PEEK, Ultem, Delrin, PTFE, PPS, Torlon and G10/FR4 - specs, brands and thicknesses in stock, cut to your size.",
};

export default function MaterialsIndexPage() {
  const byFamily = new Map<string, string[]>();
  for (const [code, m] of Object.entries(CFG.materials)) {
    const list = byFamily.get(m.family) ?? [];
    list.push(code);
    byFamily.set(m.family, list);
  }

  return (
    <>
    <main className="mx-auto max-w-5xl px-4 py-14 text-ink">
      <Logo className="h-10" priority />
      <h1 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">Materials</h1>
      <p className="mt-2 max-w-2xl text-graphite">Specs, brands and stock thicknesses for every material we cut. Pick one to see the full detail page and get a price.</p>

      <div className="mt-10 flex flex-col gap-10">
        {Array.from(byFamily.entries()).map(([family, codes]) => (
          <div key={family}>
            <h2 className="text-sm font-medium uppercase tracking-wide text-graphite">{family}</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {codes.map((code) => (
                <MaterialCard key={code} code={code} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
    <Footer />
    </>
  );
}
