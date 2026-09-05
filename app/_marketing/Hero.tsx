"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import cfgJson from "@/lib/pricing/config.json";
import { parse_fraction_input, DimensionInputError } from "@/lib/pricing/fractions";
import type { PricingConfig, QuoteResult } from "@/lib/pricing/engine";
import { DimensionedBlank } from "./DimensionedBlank";
import { materialSwatch } from "./swatches";

const CFG = cfgJson as unknown as PricingConfig;
const LEAD_TIER_ORDER = ["SAMEDAY", "RUSH24", "RUSH48", "STD", "NEST"] as const;
const MATERIAL_CODES = Object.keys(CFG.materials);

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function defaultThickness(materialCode: string): number {
  const opts = CFG.materials[materialCode].stock_thicknesses_in;
  return opts.includes(0.5) ? 0.5 : opts[Math.floor(opts.length / 2)];
}

type QuoteApiResult = QuoteResult & { quote_id: string };

export function Hero() {
  const router = useRouter();
  const [materialCode, setMaterialCode] = useState("PEEK_NAT");
  const [lengthRaw, setLengthRaw] = useState("12");
  const [widthRaw, setWidthRaw] = useState("12");
  const [thickness, setThickness] = useState(defaultThickness("PEEK_NAT"));
  const [qty, setQty] = useState(1);
  const [toleranceTier, setToleranceTier] = useState("STANDARD");

  const [results, setResults] = useState<Partial<Record<string, QuoteApiResult>>>({});
  const [selectedTier, setSelectedTier] = useState("STD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawKey, setDrawKey] = useState(0);
  const hadResult = useRef(false);

  const material = CFG.materials[materialCode];
  const tol = CFG.tolerance_tiers[toleranceTier];

  let length: number | null = null;
  let width: number | null = null;
  let dimError: string | null = null;
  try {
    length = parse_fraction_input(lengthRaw);
    width = parse_fraction_input(widthRaw);
  } catch (e) {
    dimError = e instanceof DimensionInputError ? e.message : "Enter a valid dimension.";
  }

  useEffect(() => {
    setThickness((t) => (material.stock_thicknesses_in.includes(t) ? t : defaultThickness(materialCode)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialCode]);

  const payloadKey = JSON.stringify({ materialCode, length, width, thickness, qty, toleranceTier });

  useEffect(() => {
    if (length === null || width === null) {
      setResults({});
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      const line = {
        material_code: materialCode,
        length_in: length,
        width_in: width,
        thickness_in: thickness,
        qty,
        tolerance_tier: toleranceTier,
      };
      Promise.all(
        LEAD_TIER_ORDER.map(async (tier) => {
          const res = await fetch("/api/quote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lines: [line], lead_tier: tier, sourcing_mode: "MASTER_SHEET", dest_zip: "92020" }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Could not price this.");
          return [tier, data as QuoteApiResult] as const;
        })
      )
        .then((entries) => {
          if (cancelled) return;
          setResults(Object.fromEntries(entries));
          setDrawKey((k) => k + 1);
          hadResult.current = true;
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "Could not price this.");
          setResults({});
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  const selected = results[selectedTier];

  function continueToFullQuote() {
    const params = new URLSearchParams({
      material: materialCode,
      length: String(length ?? ""),
      width: String(width ?? ""),
      thickness: String(thickness),
      qty: String(qty),
      tolerance: toleranceTier,
    });
    router.push(`/quote?${params.toString()}`);
  }

  return (
    <section className="mx-auto max-w-5xl px-4 pt-14 pb-10 sm:pt-20">
      <p className="max-w-xl text-lg text-graphite sm:text-xl">
        Aerospace plastics, cut to your size. Priced in seconds, certified the same day.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start">
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-3">
              Material
              <select
                value={materialCode}
                onChange={(e) => setMaterialCode(e.target.value)}
                className="rounded border border-rule bg-paper px-3 py-2"
              >
                {MATERIAL_CODES.map((c) => (
                  <option key={c} value={c}>
                    {CFG.materials[c].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Length (in)
              <input
                value={lengthRaw}
                onChange={(e) => setLengthRaw(e.target.value)}
                className="rounded border border-rule bg-paper px-3 py-2 font-mono tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Width (in)
              <input
                value={widthRaw}
                onChange={(e) => setWidthRaw(e.target.value)}
                className="rounded border border-rule bg-paper px-3 py-2 font-mono tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Thickness
              <select
                value={thickness}
                onChange={(e) => setThickness(Number(e.target.value))}
                className="rounded border border-rule bg-paper px-3 py-2"
              >
                {material.stock_thicknesses_in.map((t) => (
                  <option key={t} value={t}>
                    {t} in
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Qty
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                className="rounded border border-rule bg-paper px-3 py-2 font-mono tabular-nums"
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-sm">
              Tolerance
              <select
                value={toleranceTier}
                onChange={(e) => setToleranceTier(e.target.value)}
                className="rounded border border-rule bg-paper px-3 py-2"
              >
                {Object.entries(CFG.tolerance_tiers).map(([code, t]) => (
                  <option key={code} value={code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {dimError ? <p className="mt-2 text-sm text-red-600">{dimError}</p> : null}

          {material.residual_stress_flag ? (
            <p className="mt-4 text-xs text-graphite">
              {material.label} carries residual stress. A cut blank can bow 0.010-0.025 in within 48 hours as that stress releases.
            </p>
          ) : null}

          <div className="mt-6 min-h-[92px]">
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {selected ? (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-4xl tabular-nums text-amber">{money(selected.totals.total_due)}</span>
                  <span className="text-sm text-graphite">{CFG.lead_tiers[selectedTier].label.toLowerCase()}, all-in</span>
                </div>
                {selected.competitive_comparison ? (
                  <p className="mt-2 max-w-md text-sm text-graphite">{selected.competitive_comparison}</p>
                ) : null}
                <button
                  onClick={continueToFullQuote}
                  className="mt-4 rounded bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:opacity-90"
                >
                  Continue to full quote
                </button>
              </>
            ) : loading ? (
              <p className="text-sm text-graphite">Pricing...</p>
            ) : (
              <p className="text-sm text-graphite">Enter dimensions for a firm price.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center">
          <DimensionedBlank
            lengthIn={length ?? 12}
            widthIn={width ?? 12}
            toleranceIn={tol.tolerance_in}
            materialLabel={material.label}
            swatch={materialSwatch(materialCode)}
            drawKey={drawKey}
          />
        </div>
      </div>

      {Object.keys(results).length > 0 ? (
        <div className="mt-10 max-w-xl">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-rule pb-2 text-xs text-graphite sm:gap-x-6">
            <span>Lead time</span>
            <span>Price</span>
            <span>Ships</span>
          </div>
          {LEAD_TIER_ORDER.map((tier) => {
            const r = results[tier];
            const isSelected = tier === selectedTier;
            return (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                className={`grid w-full grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-b border-rule py-2.5 text-left text-sm sm:gap-x-6 ${isSelected ? "bg-rule/40" : ""}`}
              >
                <span>{CFG.lead_tiers[tier].label}</span>
                <span className="font-mono tabular-nums">{r ? money(r.totals.total_due) : "—"}</span>
                <span className="font-mono tabular-nums">{r ? r.lead_time.promised_ship_date : "—"}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
