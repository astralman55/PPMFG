"use client";

import { useEffect, useState } from "react";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";

const CFG = cfgJson as unknown as PricingConfig;
const MATERIAL_CODES = Object.keys(CFG.materials);

interface Remnant {
  id: string;
  length_in: number;
  width_in: number;
  thickness_nominal: number;
  location_tag: string | null;
  created_at: string;
  consumed_at: string | null;
  lot: { material_code: string; brand: string; certification_tier: string; lot_number: string; manufacturer: string } | null;
}

function emptyFilter() {
  return { material_code: "", brand: "", certification_tier: "", min_length_in: "", min_width_in: "" };
}

export default function RemnantRegisterPage() {
  const [filter, setFilter] = useState(emptyFilter());
  const [remnants, setRemnants] = useState<Remnant[] | null>(null);

  function search() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v) params.set(k, v);
    fetch(`/api/ops/remnants?${params}`)
      .then((r) => r.json())
      .then((d) => setRemnants(d.remnants));
  }
  useEffect(search, []); // eslint-disable-line react-hooks/exhaustive-deps

  const material = filter.material_code ? CFG.materials[filter.material_code] : null;
  const brandOptions = material ? Object.entries(material.brands).filter(([code]) => code !== "GENERIC") : [];

  return (
    <div>
      <h1 className="text-xl font-semibold">Remnant register</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Search by material, brand, tier and minimum size to see whether a remnant can satisfy an order before cutting a fresh sheet.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 rounded border border-neutral-200 p-4 sm:grid-cols-5 dark:border-neutral-800">
        <select
          value={filter.material_code}
          onChange={(e) => setFilter({ ...filter, material_code: e.target.value, brand: "" })}
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
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
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
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
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">Any tier</option>
          {Object.entries(CFG.certification_tiers).map(([code, t]) => (
            <option key={code} value={code}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="Min length (in)"
          value={filter.min_length_in}
          onChange={(e) => setFilter({ ...filter, min_length_in: e.target.value })}
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          type="number"
          step="0.01"
          placeholder="Min width (in)"
          value={filter.min_width_in}
          onChange={(e) => setFilter({ ...filter, min_width_in: e.target.value })}
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="col-span-2 flex gap-2 sm:col-span-5">
          <button onClick={search} className="rounded bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
            Search
          </button>
          <button
            onClick={() => {
              setFilter(emptyFilter());
              setTimeout(search, 0);
            }}
            className="text-sm text-neutral-500 hover:underline"
          >
            Clear
          </button>
        </div>
      </div>

      {!remnants ? (
        <p className="mt-6 text-sm text-neutral-500">Loading...</p>
      ) : remnants.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">No remnants match.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500 dark:border-neutral-800">
              <th className="py-2 pr-4">Size</th>
              <th className="py-2 pr-4">Material</th>
              <th className="py-2 pr-4">Brand / lot</th>
              <th className="py-2 pr-4">Tier</th>
              <th className="py-2 pr-4">Location</th>
              <th className="py-2 pr-4">Logged</th>
            </tr>
          </thead>
          <tbody>
            {remnants.map((r) => (
              <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-4 font-mono tabular-nums">
                  {r.length_in} x {r.width_in} x {r.thickness_nominal} in
                </td>
                <td className="py-2 pr-4">{r.lot ? (CFG.materials[r.lot.material_code]?.label ?? r.lot.material_code) : "—"}</td>
                <td className="py-2 pr-4">
                  {r.lot?.brand} / {r.lot?.lot_number}
                </td>
                <td className="py-2 pr-4">{r.lot ? CFG.certification_tiers[r.lot.certification_tier]?.label : "—"}</td>
                <td className="py-2 pr-4">{r.location_tag ?? "—"}</td>
                <td className="py-2 pr-4 text-xs text-neutral-500">{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
