import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { getPublicShopStats } from "@/lib/orders/store";

const CFG = cfgJson as unknown as PricingConfig;

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="font-mono text-3xl font-semibold tabular-nums text-paper sm:text-4xl">{value}</span>
      <span className="text-xs uppercase tracking-wide text-blueprint-tint/70">{label}</span>
    </div>
  );
}

/**
 * Two real, live counts and two real capability facts - CLAUDE_CODE_BRIEF.md
 * §11 "no fabricated numbers." Deliberately not a claimed historical
 * average: sheet utilisation is config's engineered ceiling
 * (shop.eta_effective_cap), not an average of executed nest runs, which
 * would be misleadingly thin at this order volume. Recomputed on every
 * request (see app/page.tsx's `dynamic = "force-dynamic"`) so the two live
 * counts are never stale.
 */
export async function Stats() {
  const stats = await getPublicShopStats();
  const materialCount = Object.keys(CFG.materials).length;
  const utilisationPct = Math.round(CFG.shop.eta_effective_cap * 100);

  return (
    <div className="bg-blueprint py-10">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 sm:grid-cols-4">
        <Stat value={String(stats.orders_fulfilled)} label="Orders fulfilled" />
        <Stat value={String(stats.customers_served)} label="Customers served" />
        <Stat value={`${utilisationPct}%`} label="Engineered sheet utilisation" />
        <Stat value={String(materialCount)} label="Materials stocked" />
      </div>
    </div>
  );
}
