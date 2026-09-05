import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { plan_nest, type QueueRow } from "@/lib/pricing/nesting";

const CFG = cfgJson as unknown as PricingConfig;

/**
 * CLAUDE_CODE_BRIEF.md §18, section 4. Wired to real output from
 * lib/pricing/nesting.ts - the same fixture shape used in
 * lib/pricing/__tests__/nesting.test.ts's "cross-order batching" case - not
 * fabricated numbers. Explicitly labeled illustrative: there is no live
 * order flow yet, and this is a deterministic guillotine-packing algorithm -
 * see CLAUDE_CODE_BRIEF.md §18 on why that description matters and which
 * two buzzwords must never appear on this page describing it.
 */
const singleOrder: QueueRow[] = [
  { order_id: "A", line_no: 1, material_code: "PEEK_NAT", brand: "GENERIC", thickness_nominal: 0.5, certification_tier: "TIER1_TRACEABLE", length_in: 11.0, width_in: 7.0, qty: 2 },
];
const threeOrders: QueueRow[] = [
  ...singleOrder,
  { order_id: "B", line_no: 1, material_code: "PEEK_NAT", brand: "GENERIC", thickness_nominal: 0.5, certification_tier: "TIER1_TRACEABLE", length_in: 9.0, width_in: 6.5, qty: 3 },
  { order_id: "C", line_no: 1, material_code: "PEEK_NAT", brand: "GENERIC", thickness_nominal: 0.5, certification_tier: "TIER1_TRACEABLE", length_in: 14.0, width_in: 4.0, qty: 4 },
];

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export function NestingExplainer() {
  const solo = plan_nest(singleOrder, CFG)[0].summary;
  const batched = plan_nest(threeOrders, CFG)[0].summary;

  return (
    <section className="mx-auto max-w-5xl border-t border-rule px-4 py-14">
      <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Every cut is a decision</h2>
      <p className="mt-4 max-w-2xl text-graphite">
        On a sliding table saw, a single order alone often uses well under half the sheet. Batch it with other orders cutting
        the same material and thickness, and the same sheet clears most of its area for parts instead of scrap.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="border border-rule p-5">
          <p className="text-xs uppercase tracking-wide text-graphite">One order alone</p>
          <p className="mt-1 font-mono text-3xl tabular-nums">{pct(solo.utilisation)}</p>
          <p className="mt-1 text-sm text-graphite">of the sheet used</p>
        </div>
        <div className="border border-rule p-5">
          <p className="text-xs uppercase tracking-wide text-graphite">Three orders, batched</p>
          <p className="mt-1 font-mono text-3xl tabular-nums text-amber">{pct(batched.utilisation)}</p>
          <p className="mt-1 text-sm text-graphite">of the same sheet used</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-graphite">
        Illustrative, computed from our real nesting engine on a representative order mix - not a live feed of current orders.
        The engine is a deterministic guillotine-cut packing algorithm: the same order always produces the same layout, which
        is the correct and honest tool for a single sliding table saw.
      </p>
    </section>
  );
}
