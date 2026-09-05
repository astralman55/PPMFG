"use client";

import { useEffect, useMemo, useState } from "react";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { add_business_days } from "@/lib/pricing/engine";
import {
  computeLineMinutes,
  groupKeyFor,
  runCapacityWalk,
  type CapacityLineInput,
  type CapacityQueueLine,
  type CapacityWalkResult,
} from "@/lib/capacity/model";

const CFG = cfgJson as unknown as PricingConfig;

/**
 * CLAUDE_CODE_BRIEF.md §21 (Phase 13) - read-only capacity & deadline
 * dashboard. The API route does the real database work and the fresh
 * pricing-engine recompute once per load; everything below that (the
 * available-minutes slider, the hypothetical order) runs the exact same
 * runCapacityWalk() client-side so it "recalculates everything live,
 * without touching any file."
 */

interface CapacityApiResponse {
  today: string;
  open_order_count: number;
  default_available_minutes_per_day: number;
  lines: CapacityQueueLine[];
  failures: { order_id: string; order_number: string; line_no: number; reason: string }[];
}

interface HypotheticalForm {
  materialCode: string;
  brand: string;
  certTier: string;
  length: string;
  width: string;
  thickness: number;
  qty: number;
  toleranceTier: string;
  edgeFinish: string;
  faceFinish: string;
  anneal: boolean;
  leadTier: string;
}

function defaultHypothetical(): HypotheticalForm {
  const materialCode = "PEEK_NAT";
  return {
    materialCode,
    brand: "GENERIC",
    certTier: "TIER1_TRACEABLE",
    length: "12",
    width: "12",
    thickness: 0.5,
    qty: 1,
    toleranceTier: "STANDARD",
    edgeFinish: "DEBURRED",
    faceFinish: "AS_SUPPLIED",
    anneal: false,
    leadTier: "STD",
  };
}

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "0%";
}

export default function CapacityPage() {
  const [data, setData] = useState<CapacityApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableMinutes, setAvailableMinutes] = useState(450);

  const [hypo, setHypo] = useState<HypotheticalForm>(defaultHypothetical());
  const [hypoAdded, setHypoAdded] = useState(false);
  const [hypoError, setHypoError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ops/capacity")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setAvailableMinutes(d.default_available_minutes_per_day);
      })
      .catch(() => setError("Could not load the capacity queue."));
  }, []);

  const baseline: CapacityWalkResult | null = useMemo(() => {
    if (!data) return null;
    return runCapacityWalk(data.lines, { today: data.today, availableMinutesPerDay: availableMinutes }, CFG);
  }, [data, availableMinutes]);

  const hypoLine: CapacityQueueLine | null = useMemo(() => {
    if (!data || !hypoAdded) return null;
    const length = Number(hypo.length);
    const width = Number(hypo.width);
    if (!length || !width) return null;
    const row: CapacityLineInput = {
      order_id: "HYPOTHETICAL",
      order_number: "HYPOTHETICAL",
      customer_label: "Hypothetical order",
      line_no: 1,
      promised_ship_date: hypoPromisedShipDate(data.today, hypo),
      material_code: hypo.materialCode,
      brand: hypo.brand,
      thickness_nominal: hypo.thickness,
      certification_tier: hypo.certTier,
      length_in: length,
      width_in: width,
      qty: hypo.qty,
      tolerance_tier: hypo.toleranceTier,
      edge_finish: hypo.edgeFinish,
      face_finish: hypo.faceFinish,
      annealed: hypo.anneal,
      add_ons: null,
    };
    try {
      setHypoError(null);
      return {
        order_id: row.order_id,
        order_number: row.order_number,
        customer_label: row.customer_label,
        line_no: row.line_no,
        promised_ship_date: row.promised_ship_date,
        minutes: computeLineMinutes(row, CFG),
        group_key: groupKeyFor(row, CFG),
      };
    } catch (e) {
      setHypoError(e instanceof Error ? e.message : "Could not price this hypothetical part.");
      return null;
    }
  }, [data, hypoAdded, hypo]);

  const withHypothetical: CapacityWalkResult | null = useMemo(() => {
    if (!data || !hypoLine) return null;
    return runCapacityWalk([...data.lines, hypoLine], { today: data.today, availableMinutesPerDay: availableMinutes }, CFG);
  }, [data, hypoLine, availableMinutes]);

  const material = CFG.materials[hypo.materialCode];

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data || !baseline) return <p className="text-sm text-neutral-500">Loading...</p>;

  const activeWalk = withHypothetical ?? baseline;
  const nearestAtRisk = activeWalk.orders.find((o) => o.status === "at_risk");

  return (
    <div>
      <h1 className="text-xl font-semibold">Capacity &amp; deadlines</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Read-only. Recomputed fresh from today&apos;s config, not from any frozen quote - nothing here ever writes to
        the database.
      </p>

      {data.failures.length > 0 ? (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950">
          <p className="font-medium text-amber-800 dark:text-amber-400">
            {data.failures.length} line{data.failures.length === 1 ? "" : "s"} could not be recomputed against
            current config and {data.failures.length === 1 ? "is" : "are"} excluded below:
          </p>
          <ul className="mt-1 list-disc pl-5 text-amber-700 dark:text-amber-500">
            {data.failures.map((f, i) => (
              <li key={i}>
                {f.order_number} line {f.line_no}: {f.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Summary bar */}
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Open orders" value={String(data.open_order_count)} />
        <Stat label="Labor minutes remaining" value={activeWalk.total_minutes.toFixed(0)} />
        <Stat label="At risk" value={String(activeWalk.at_risk_count)} highlight={activeWalk.at_risk_count > 0} />
        <Stat label="Nearest at-risk deadline" value={nearestAtRisk?.promised_ship_date ?? "—"} highlight={Boolean(nearestAtRisk)} />
      </dl>

      {/* Editable staffing input */}
      <div className="mt-6 flex items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Available minutes per day
          <input
            type="number"
            min={0}
            value={availableMinutes}
            onChange={(e) => setAvailableMinutes(Math.max(0, Number(e.target.value)))}
            className="w-24 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <span className="text-xs text-neutral-500">A staffing input for this screen only - not stored in config.json.</span>
      </div>

      {/* Per-day table */}
      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-neutral-500">Day-by-day walk</h2>
      {activeWalk.days.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Nothing queued.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500 dark:border-neutral-800">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Orders</th>
              <th className="py-2 pr-4">Minutes consumed</th>
              <th className="py-2 pr-4">Utilisation</th>
              <th className="py-2 pr-4">Blade changes</th>
            </tr>
          </thead>
          <tbody>
            {activeWalk.days.map((d) => (
              <tr key={d.date} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-4 font-mono tabular-nums">{d.date}</td>
                <td className="py-2 pr-4">{d.order_numbers.join(", ")}</td>
                <td className="py-2 pr-4 font-mono tabular-nums">
                  {d.minutes_consumed.toFixed(0)} / {d.minutes_available}
                </td>
                <td className="py-2 pr-4 font-mono tabular-nums">{pct(d.minutes_consumed, d.minutes_available)}</td>
                <td className="py-2 pr-4 font-mono tabular-nums">{d.blade_changes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* At-risk order list */}
      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-neutral-500">At-risk orders</h2>
      {activeWalk.orders.filter((o) => o.status === "at_risk").length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">None - every open order is on track given today&apos;s queue.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500 dark:border-neutral-800">
              <th className="py-2 pr-4">Order</th>
              <th className="py-2 pr-4">Customer</th>
              <th className="py-2 pr-4">Promised ship</th>
              <th className="py-2 pr-4">Shortfall</th>
            </tr>
          </thead>
          <tbody>
            {activeWalk.orders
              .filter((o) => o.status === "at_risk")
              .map((o) => (
                <tr key={o.order_id} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-2 pr-4 font-mono text-red-700 dark:text-red-500">{o.order_number}</td>
                  <td className="py-2 pr-4">{o.customer_label}</td>
                  <td className="py-2 pr-4 font-mono tabular-nums">{o.promised_ship_date}</td>
                  <td className="py-2 pr-4 font-mono tabular-nums text-red-700 dark:text-red-500">
                    {o.shortfall_minutes.toFixed(0)} min short
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {/* Hypothetical order test */}
      <h2 className="mt-10 border-t border-neutral-200 pt-6 text-sm font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
        Test a hypothetical order
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        See what saying yes to a new order today would do to existing promises, before it&apos;s ever quoted to the
        customer.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">
          Material
          <select
            className="rounded border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
            value={hypo.materialCode}
            onChange={(e) => setHypo((h) => ({ ...h, materialCode: e.target.value, brand: "GENERIC" }))}
          >
            {Object.entries(CFG.materials).map(([code, m]) => (
              <option key={code} value={code}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Certification
          <select
            className="rounded border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
            value={hypo.certTier}
            onChange={(e) => setHypo((h) => ({ ...h, certTier: e.target.value }))}
          >
            {Object.entries(CFG.certification_tiers).map(([code, t]) => (
              <option key={code} value={code}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Length (in)
          <input
            className="rounded border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
            value={hypo.length}
            onChange={(e) => setHypo((h) => ({ ...h, length: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Width (in)
          <input
            className="rounded border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
            value={hypo.width}
            onChange={(e) => setHypo((h) => ({ ...h, width: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Thickness (in)
          <select
            className="rounded border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
            value={hypo.thickness}
            onChange={(e) => setHypo((h) => ({ ...h, thickness: Number(e.target.value) }))}
          >
            {material.stock_thicknesses_in.map((t) => (
              <option key={t} value={t}>
                {t} in
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Quantity
          <input
            type="number"
            min={1}
            className="rounded border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
            value={hypo.qty}
            onChange={(e) => setHypo((h) => ({ ...h, qty: Math.max(1, Number(e.target.value)) }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Lead tier requested
          <select
            className="rounded border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
            value={hypo.leadTier}
            onChange={(e) => setHypo((h) => ({ ...h, leadTier: e.target.value }))}
          >
            {Object.entries(CFG.lead_tiers).map(([code, t]) => (
              <option key={code} value={code}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={hypo.anneal} onChange={(e) => setHypo((h) => ({ ...h, anneal: e.target.checked }))} />
          Stress-relief anneal
        </label>
      </div>

      <button
        type="button"
        onClick={() => setHypoAdded(true)}
        className="mt-3 rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        Test this order against the queue
      </button>
      {hypoAdded ? (
        <button type="button" onClick={() => setHypoAdded(false)} className="ml-2 text-xs text-neutral-500 hover:underline">
          Clear
        </button>
      ) : null}

      {hypoError ? <p className="mt-2 text-xs text-red-600">{hypoError}</p> : null}

      {hypoAdded && withHypothetical ? (
        <HypotheticalImpact baseline={baseline} withHypo={withHypothetical} />
      ) : null}
    </div>
  );
}

function hypoPromisedShipDate(today: string, hypo: HypotheticalForm): string {
  const tier = CFG.lead_tiers[hypo.leadTier];
  let offset = tier.ship_offset_business_days;
  if (hypo.anneal && CFG.annealing.eligible_materials.includes(hypo.materialCode)) {
    offset += CFG.annealing.adds_business_days;
  }
  return add_business_days(today, offset, CFG);
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`font-mono text-lg tabular-nums ${highlight ? "text-red-600 dark:text-red-500" : ""}`}>{value}</dd>
    </div>
  );
}

function HypotheticalImpact({ baseline, withHypo }: { baseline: CapacityWalkResult; withHypo: CapacityWalkResult }) {
  const hypoOutcome = withHypo.orders.find((o) => o.order_id === "HYPOTHETICAL");
  const baselineByOrder = new Map(baseline.orders.map((o) => [o.order_id, o]));
  const newlyAtRisk = withHypo.orders.filter((o) => {
    if (o.order_id === "HYPOTHETICAL") return false;
    const before = baselineByOrder.get(o.order_id);
    return o.status === "at_risk" && (!before || before.status === "on_track");
  });
  const worseShortfall = withHypo.orders.filter((o) => {
    if (o.order_id === "HYPOTHETICAL") return false;
    const before = baselineByOrder.get(o.order_id);
    return before && before.status === "at_risk" && o.shortfall_minutes > before.shortfall_minutes;
  });

  return (
    <div className="mt-4 rounded border border-neutral-300 p-4 text-sm dark:border-neutral-700">
      <p className="font-medium">
        This hypothetical order would ship {hypoOutcome?.promised_ship_date} -{" "}
        {hypoOutcome?.status === "at_risk" ? (
          <span className="text-red-700 dark:text-red-500">at risk, {hypoOutcome.shortfall_minutes.toFixed(0)} min short</span>
        ) : (
          <span className="text-green-700 dark:text-green-500">on track</span>
        )}
        .
      </p>

      {newlyAtRisk.length === 0 && worseShortfall.length === 0 ? (
        <p className="mt-2 text-neutral-500">No existing promise would slip by adding this order.</p>
      ) : (
        <>
          {newlyAtRisk.length > 0 ? (
            <p className="mt-2 text-red-700 dark:text-red-500">
              Would newly put {newlyAtRisk.map((o) => o.order_number).join(", ")} at risk.
            </p>
          ) : null}
          {worseShortfall.length > 0 ? (
            <p className="mt-1 text-amber-700 dark:text-amber-500">
              Would worsen the shortfall on {worseShortfall.map((o) => o.order_number).join(", ")}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
