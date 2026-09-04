"use client";

import { useEffect, useState } from "react";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";

const CFG = cfgJson as unknown as PricingConfig;
const MATERIAL_CODES = Object.keys(CFG.materials);

interface Lot {
  id: string;
  lot_number: string;
  material_code: string;
  brand: string;
  certification_tier: string;
  manufacturer: string;
  thickness_nominal: number;
  received_date: string;
  mtr_path: string | null;
  resin_cert_path: string | null;
}

function emptyForm() {
  return {
    lot_number: "",
    material_code: MATERIAL_CODES[0],
    brand: "",
    certification_tier: "TIER1_TRACEABLE",
    manufacturer: "",
    distributor: "",
    distributor_po: "",
    country_of_origin: "",
    thickness_nominal: "",
    received_date: new Date().toISOString().slice(0, 10),
    qty_received_in2: "",
    notes: "",
  };
}

export default function LotLibraryPage() {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [mtrFile, setMtrFile] = useState<File | null>(null);
  const [resinCertFile, setResinCertFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    fetch("/api/ops/lots")
      .then((r) => r.json())
      .then((d) => setLots(d.lots));
  }
  useEffect(refresh, []);

  const material = CFG.materials[form.material_code];
  const brandOptions = Object.entries(material.brands).filter(([code]) => code !== "GENERIC");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.set(k, v);
    if (mtrFile) fd.set("mtr", mtrFile);
    if (resinCertFile) fd.set("resin_cert", resinCertFile);

    const res = await fetch("/api/ops/lots", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setForm(emptyForm());
    setMtrFile(null);
    setResinCertFile(null);
    refresh();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Lot library</h1>
      <p className="mt-1 text-sm text-neutral-500">Real material batches on hand - what a Material Test Report and Certificate of Conformance actually name.</p>

      <form onSubmit={handleSubmit} className="mt-8 grid grid-cols-1 gap-4 rounded border border-neutral-200 p-4 sm:grid-cols-2 dark:border-neutral-800">
        <label className="flex flex-col gap-1 text-sm">
          Material
          <select
            value={form.material_code}
            onChange={(e) => setForm({ ...form, material_code: e.target.value, brand: "" })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {MATERIAL_CODES.map((code) => (
              <option key={code} value={code}>
                {CFG.materials[code].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Brand (actual manufacturer)
          <select
            required
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="" disabled>
              Select a brand
            </option>
            {brandOptions.map(([code, b]) => (
              <option key={code} value={code}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Certification tier
          <select
            value={form.certification_tier}
            onChange={(e) => setForm({ ...form, certification_tier: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {Object.entries(CFG.certification_tiers).map(([code, t]) => (
              <option key={code} value={code}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Nominal thickness (in)
          <select
            required
            value={form.thickness_nominal}
            onChange={(e) => setForm({ ...form, thickness_nominal: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="" disabled>
              Select a thickness
            </option>
            {material.stock_thicknesses_in.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Lot number
          <input
            required
            value={form.lot_number}
            onChange={(e) => setForm({ ...form, lot_number: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Manufacturer
          <input
            required
            value={form.manufacturer}
            onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Distributor
          <input
            value={form.distributor}
            onChange={(e) => setForm({ ...form, distributor: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Distributor PO
          <input
            value={form.distributor_po}
            onChange={(e) => setForm({ ...form, distributor_po: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Country of origin
          <input
            required
            value={form.country_of_origin}
            onChange={(e) => setForm({ ...form, country_of_origin: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Received date
          <input
            type="date"
            required
            value={form.received_date}
            onChange={(e) => setForm({ ...form, received_date: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Qty received (in²)
          <input
            type="number"
            step="0.01"
            value={form.qty_received_in2}
            onChange={(e) => setForm({ ...form, qty_received_in2: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Notes
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Material Test Report (PDF)
          <input type="file" accept="application/pdf" onChange={(e) => setMtrFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Resin batch certificate (PDF, optional)
          <input type="file" accept="application/pdf" onChange={(e) => setResinCertFile(e.target.files?.[0] ?? null)} />
        </label>

        {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {busy ? "Adding..." : "Add lot"}
          </button>
        </div>
      </form>

      <h2 className="mt-10 text-sm font-medium text-neutral-500">On hand</h2>
      {!lots ? (
        <p className="mt-3 text-sm text-neutral-500">Loading...</p>
      ) : lots.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No lots yet.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500 dark:border-neutral-800">
              <th className="py-2 pr-4">Lot</th>
              <th className="py-2 pr-4">Material</th>
              <th className="py-2 pr-4">Brand</th>
              <th className="py-2 pr-4">Tier</th>
              <th className="py-2 pr-4">Thk.</th>
              <th className="py-2 pr-4">MTR</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-4 font-mono">{l.lot_number}</td>
                <td className="py-2 pr-4">{CFG.materials[l.material_code]?.label ?? l.material_code}</td>
                <td className="py-2 pr-4">{l.brand}</td>
                <td className="py-2 pr-4">{CFG.certification_tiers[l.certification_tier]?.label ?? l.certification_tier}</td>
                <td className="py-2 pr-4 tabular-nums">{l.thickness_nominal} in</td>
                <td className="py-2 pr-4">
                  {l.mtr_path ? <span className="text-green-700 dark:text-green-500">On file</span> : <span className="text-red-600">Missing</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
