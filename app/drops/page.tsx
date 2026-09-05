"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { materialSwatch } from "@/app/_marketing/swatches";
import { brand } from "@/lib/brand";

const CFG = cfgJson as unknown as PricingConfig;
const MATERIAL_CODES = Object.keys(CFG.materials);
const SIZE_BUCKETS = [
  { label: "Any size", value: "" },
  { label: "6 in or larger", value: "6" },
  { label: "12 in or larger", value: "12" },
  { label: "24 in or larger", value: "24" },
];

interface Drop {
  id: string;
  length_in: number;
  width_in: number;
  thickness_nominal: number;
  material_code: string | null;
  brand: string | null;
  certification_tier: string | null;
  lot_number: string | null;
}

function emptyFilter() {
  return { material_code: "", brand: "", certification_tier: "", min_size: "" };
}

function isSet(value: string): boolean {
  return value.length > 0 && !value.startsWith("REPLACE_WITH_");
}

export default function DropsPage() {
  const [filter, setFilter] = useState(emptyFilter());
  const [drops, setDrops] = useState<Drop[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function search() {
    setError(null);
    const params = new URLSearchParams();
    if (filter.material_code) params.set("material_code", filter.material_code);
    if (filter.brand) params.set("brand", filter.brand);
    if (filter.certification_tier) params.set("certification_tier", filter.certification_tier);
    if (filter.min_size) {
      params.set("min_length_in", filter.min_size);
      params.set("min_width_in", filter.min_size);
    }
    fetch(`/api/drops?${params}`)
      .then((r) => r.json())
      .then((d) => setDrops(d.drops))
      .catch(() => setError("Could not load drops right now."));
  }
  useEffect(search, []); // eslint-disable-line react-hooks/exhaustive-deps

  const material = filter.material_code ? CFG.materials[filter.material_code] : null;
  const brandOptions = material ? Object.entries(material.brands).filter(([code]) => code !== "GENERIC") : [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-14 text-ink">
      <p className="text-sm">
        <Link href="/" className="text-graphite hover:underline">
          {brand.companyName}
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">Drops</h1>
      <p className="mt-2 max-w-2xl text-graphite">
        Real offcuts from real orders, still square and still certified to the same lot they came from - at a fraction of a
        fresh cut. First come, first served.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <select
          value={filter.material_code}
          onChange={(e) => setFilter({ ...filter, material_code: e.target.value, brand: "" })}
          className="rounded border border-rule bg-paper px-3 py-2 text-sm"
        >
          <option value="">Any material</option>
          {MATERIAL_CODES.map((c) => (
            <option key={c} value={c}>
              {CFG.materials[c].label}
            </option>
          ))}
        </select>
        <select
          value={filter.brand}
          onChange={(e) => setFilter({ ...filter, brand: e.target.value })}
          disabled={!material}
          className="rounded border border-rule bg-paper px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Any brand</option>
          {brandOptions.map(([code, b]) => (
            <option key={code} value={code}>
              {b.label}
            </option>
          ))}
        </select>
        <select
          value={filter.certification_tier}
          onChange={(e) => setFilter({ ...filter, certification_tier: e.target.value })}
          className="rounded border border-rule bg-paper px-3 py-2 text-sm"
        >
          <option value="">Any tier</option>
          {Object.entries(CFG.certification_tiers).map(([code, t]) => (
            <option key={code} value={code}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={filter.min_size}
          onChange={(e) => setFilter({ ...filter, min_size: e.target.value })}
          className="rounded border border-rule bg-paper px-3 py-2 text-sm"
        >
          {SIZE_BUCKETS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <div className="col-span-2 flex gap-3 sm:col-span-4">
          <button onClick={search} className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
            Search
          </button>
          <button
            onClick={() => {
              setFilter(emptyFilter());
              setTimeout(search, 0);
            }}
            className="text-sm text-graphite hover:underline"
          >
            Clear
          </button>
        </div>
      </div>

      {error ? <p className="mt-8 text-sm text-red-600">{error}</p> : null}
      {!drops && !error ? <p className="mt-8 text-sm text-graphite">Loading...</p> : null}
      {drops && drops.length === 0 ? (
        <p className="mt-8 text-sm text-graphite">No drops match right now - check back soon, or widen your filters.</p>
      ) : null}

      {drops && drops.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drops.map((d) => (
            <div key={d.id} className="flex flex-col gap-2 border border-rule p-4">
              <div className="h-8 w-8 border border-rule" style={{ background: d.material_code ? materialSwatch(d.material_code) : undefined }} aria-hidden />
              <p className="font-mono text-lg tabular-nums">
                {d.length_in} x {d.width_in} x {d.thickness_nominal} in
              </p>
              <p className="text-sm">{d.material_code ? CFG.materials[d.material_code]?.label : "Material on file"}</p>
              <p className="text-xs text-graphite">
                {[
                  d.brand ? (CFG.materials[d.material_code ?? ""]?.brands?.[d.brand]?.label ?? d.brand) : null,
                  d.certification_tier ? CFG.certification_tiers[d.certification_tier]?.label : null,
                ]
                  .filter(Boolean)
                  .join(" / ")}
              </p>
              {d.lot_number ? <p className="font-mono text-xs text-graphite">Lot {d.lot_number}</p> : null}
              {isSet(brand.email) ? (
                <a
                  href={`mailto:${brand.email}?subject=${encodeURIComponent(`Drop inquiry - lot ${d.lot_number ?? d.id}`)}`}
                  className="mt-1 text-sm font-medium text-amber hover:underline"
                >
                  Ask about this piece
                </a>
              ) : (
                <p className="mt-1 text-sm text-graphite">Contact us to purchase this piece.</p>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
