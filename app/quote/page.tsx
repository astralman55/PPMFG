"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import cfgJson from "@/lib/pricing/config.json";
import { parse_fraction_input, DimensionInputError } from "@/lib/pricing/fractions";
import type { PricingConfig, QuoteResult, LineItemInput } from "@/lib/pricing/engine";
import type { SoloNestGroup, SoloNestResult } from "@/lib/pricing/solo-nest";
import { resolveSheetSize } from "@/lib/pricing/sheet-size";
import { SheetDiagram } from "./SheetDiagram";
import { EmptySheetOutline } from "./EmptySheetOutline";
import { SpecsAccordion } from "./SpecsAccordion";
import { Footer } from "../_marketing/Footer";
import { Logo } from "../_marketing/Logo";

const CFG = cfgJson as unknown as PricingConfig;

const LEAD_TIER_ORDER = ["SAMEDAY", "RUSH24", "RUSH48", "STD", "FLEX"] as const;

// Not offered yet - see CLAUDE_CODE_BRIEF.md §4: "Do not build FAIR until
// there is a documented inspection process and calibrated gauges."
const HIDDEN_ADD_ONS = new Set(["fair_as9102"]);

const DEFAULT_MATERIAL = "PEEK_NAT";

function defaultThickness(materialCode: string): number {
  const opts = CFG.materials[materialCode].stock_thicknesses_in;
  return opts.includes(0.5) ? 0.5 : opts[Math.floor(opts.length / 2)];
}

interface FormState {
  materialCode: string;
  brand: string;
  certTier: string;
  lengthRaw: string;
  widthRaw: string;
  thickness: number;
  qty: number;
  toleranceTier: string;
  edgeFinish: string;
  faceFinish: string;
  anneal: boolean;
  addOns: string[];
  destZip: string;
  partRef: string;
}

/**
 * Seeds the form from the landing page's hero, which hands off the line the
 * visitor already priced there via query params (?material=&length=&width=
 * &thickness=&qty=&tolerance=) so "continue to full quote" doesn't throw
 * away what they just entered - CLAUDE_CODE_BRIEF.md §11's copy rule "an
 * action keeps its name through the whole flow" applies to the data too.
 */
function initialState(params?: URLSearchParams | null): FormState {
  const material = params?.get("material");
  const materialCode = material && material in CFG.materials ? material : DEFAULT_MATERIAL;
  return {
    materialCode,
    brand: "GENERIC",
    certTier: "TIER1_TRACEABLE",
    lengthRaw: params?.get("length") || "12",
    widthRaw: params?.get("width") || "12",
    thickness: Number(params?.get("thickness")) || defaultThickness(materialCode),
    qty: Number(params?.get("qty")) || 1,
    toleranceTier: params?.get("tolerance") || "STANDARD",
    edgeFinish: "DEBURRED",
    faceFinish: "AS_SUPPLIED",
    anneal: false,
    addOns: [],
    destZip: "92020",
    partRef: "",
  };
}

function parseDim(raw: string): { value: number | null; error: string | null } {
  try {
    return { value: parse_fraction_input(raw), error: null };
  } catch (e) {
    return { value: null, error: e instanceof DimensionInputError ? e.message : "Invalid dimension." };
  }
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** What /api/quote returns: the engine's result plus persistence fields. */
type QuoteApiResult = QuoteResult & { quote_id: string; expires_at: string; solo_nest: SoloNestResult | null };

export default function QuotePage() {
  return (
    <>
      <Suspense fallback={null}>
        <QuoteForm />
      </Suspense>
      <Footer />
    </>
  );
}

function QuoteForm() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(() => initialState(searchParams));
  const [brandExpanded, setBrandExpanded] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("STD");
  const [results, setResults] = useState<Partial<Record<string, QuoteApiResult>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [uploadLines, setUploadLines] = useState<LineItemInput[]>([]);
  const [uploadErrors, setUploadErrors] = useState<{ row: number; message: string }[]>([]);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutCompany, setCheckoutCompany] = useState("");
  const [checkoutPo, setCheckoutPo] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [emailQuoteStatus, setEmailQuoteStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailQuoteError, setEmailQuoteError] = useState<string | null>(null);

  const [poUploadStatus, setPoUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [poUploadError, setPoUploadError] = useState<string | null>(null);

  const material = CFG.materials[form.materialCode];
  const { value: length, error: lengthError } = parseDim(form.lengthRaw);
  const { value: width, error: widthError } = parseDim(form.widthRaw);
  const annealEligible = CFG.annealing.eligible_materials.includes(form.materialCode);
  const certTierSpec = CFG.certification_tiers[form.certTier];

  // Keep brand and thickness valid whenever the material changes.
  useEffect(() => {
    setForm((f) => {
      const mat = CFG.materials[f.materialCode];
      const brandValid = f.brand in mat.brands;
      const thicknessValid = mat.stock_thicknesses_in.includes(f.thickness);
      const annealValid = !f.anneal || CFG.annealing.eligible_materials.includes(f.materialCode);
      if (brandValid && thicknessValid && annealValid) return f;
      return {
        ...f,
        brand: brandValid ? f.brand : "GENERIC",
        thickness: thicknessValid ? f.thickness : defaultThickness(f.materialCode),
        anneal: annealValid ? f.anneal : false,
      };
    });
  }, [form.materialCode]);

  const payloadKey = JSON.stringify({
    m: form.materialCode,
    b: form.brand,
    c: form.certTier,
    l: length,
    w: width,
    t: form.thickness,
    q: form.qty,
    tol: form.toleranceTier,
    ef: form.edgeFinish,
    ff: form.faceFinish,
    an: form.anneal,
    ao: form.addOns,
    z: form.destZip,
    pr: form.partRef,
  });

  useEffect(() => {
    if (length === null || width === null) {
      setResults({});
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      setApiError(null);

      const line = {
        material_code: form.materialCode,
        length_in: length,
        width_in: width,
        thickness_in: form.thickness,
        qty: form.qty,
        brand: form.brand,
        certification_tier: form.certTier,
        tolerance_tier: form.toleranceTier,
        edge_finish: form.edgeFinish,
        face_finish: form.faceFinish,
        anneal: form.anneal,
        add_ons: form.addOns,
        part_ref: form.partRef.trim() || undefined,
      };

      Promise.all(
        LEAD_TIER_ORDER.map(async (tier) => {
          const res = await fetch("/api/quote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lines: [line],
              lead_tier: tier,
              dest_zip: form.destZip,
              sourcing_mode: "MASTER_SHEET",
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `Pricing failed (${res.status}).`);
          return [tier, data as QuoteApiResult] as const;
        })
      )
        .then((entries) => {
          if (cancelled) return;
          setResults(Object.fromEntries(entries));
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setApiError(e instanceof Error ? e.message : "Could not price this quote.");
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
    // payloadKey mirrors every field below that affects price; form/length/
    // width are read from this render's closure for their current values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  const selected = results[selectedTier];

  // §19's solo_nest is identical across all 5 lead tiers (it depends only on
  // the physical lines, not lead_tier), so the live diagram (§20.1) can use
  // whichever tier's fetch has resolved first rather than waiting on the
  // currently-selected radio button specifically.
  //
  // But the fetched results lag the form by one debounce cycle - so if the
  // resolved solo_nest was computed for a DIFFERENT material or thickness
  // than what's currently selected, showing it would violate §20.2's
  // "changes the sheet outline size... immediately": the customer would
  // briefly see the previous material's sheet. Falling back to the empty
  // outline in that gap keeps the outline in sync with the dropdown even
  // while the real diagram is still catching up.
  const anyResult = Object.values(results).find((r): r is QuoteApiResult => Boolean(r));
  const resultMatchesCurrentSheet =
    anyResult !== undefined &&
    anyResult.lines[0]?.material_code === form.materialCode &&
    anyResult.lines[0]?.thickness_nominal_in === form.thickness;
  const soloGroups: SoloNestGroup[] | null = resultMatchesCurrentSheet ? (anyResult.solo_nest?.groups ?? null) : null;
  const emptySheetSize = resolveSheetSize(material, form.thickness);

  // A fresh price (new quote_id) makes any earlier "quote emailed" / "PO
  // attached" confirmation stale - reset so the customer isn't shown a
  // leftover success message for a quote that no longer matches the screen.
  useEffect(() => {
    setEmailQuoteStatus("idle");
    setEmailQuoteError(null);
    setPoUploadStatus("idle");
    setPoUploadError(null);
  }, [selected?.quote_id]);

  async function handleEmailQuote() {
    if (!selected || !checkoutEmail) return;
    setEmailQuoteStatus("sending");
    setEmailQuoteError(null);
    try {
      const res = await fetch("/api/quote/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quote_id: selected.quote_id, email: checkoutEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailQuoteError(data.error ?? `Could not email that quote (${res.status}).`);
        setEmailQuoteStatus("error");
        return;
      }
      setEmailQuoteStatus("sent");
    } catch {
      setEmailQuoteError("Could not reach the server.");
      setEmailQuoteStatus("error");
    }
  }

  async function handlePoUpload(file: File) {
    if (!selected) return;
    setPoUploadStatus("uploading");
    setPoUploadError(null);
    const body = new FormData();
    body.append("quote_id", selected.quote_id);
    body.append("file", file);
    try {
      const res = await fetch("/api/quote/po-upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setPoUploadError(data.error ?? "Could not upload that file.");
        setPoUploadStatus("error");
        return;
      }
      setPoUploadStatus("done");
    } catch {
      setPoUploadError("Could not reach the server.");
      setPoUploadStatus("error");
    }
  }

  async function handleCheckout() {
    if (!selected) return;
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quote_id: selected.quote_id,
          email: checkoutEmail,
          company: checkoutCompany || null,
          customer_po: checkoutPo || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCheckoutError(data.error ?? `Could not start checkout (${res.status}).`);
        return;
      }
      window.location.href = data.url;
    } catch {
      setCheckoutError("Could not reach the payment server.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleUpload(file: File) {
    setUploadNotice(null);
    setUploadErrors([]);
    setUploadLines([]);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/quote/upload", { method: "POST", body });
    const data = await res.json();
    if (!res.ok) {
      setUploadNotice(data.error ?? "Could not read that file.");
      return;
    }
    setUploadLines(data.lines);
    setUploadErrors(data.errors);
    setUploadNotice(
      `${data.lines.length} row${data.lines.length === 1 ? "" : "s"} parsed` +
        (data.errors.length ? `, ${data.errors.length} with problems.` : ".")
    );
  }

  function loadUploadedLine(line: LineItemInput) {
    setForm((f) => ({
      ...f,
      materialCode: line.material_code,
      brand: line.brand ?? "GENERIC",
      certTier: line.certification_tier ?? "TIER1_TRACEABLE",
      lengthRaw: String(line.length_in),
      widthRaw: String(line.width_in),
      thickness: line.thickness_in,
      qty: line.qty ?? 1,
      toleranceTier: line.tolerance_tier ?? "STANDARD",
      edgeFinish: line.edge_finish ?? "DEBURRED",
      partRef: line.part_ref ?? "",
    }));
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-neutral-900 dark:text-neutral-100">
      <Logo className="h-10" priority />
      <h1 className="mt-4 text-2xl font-semibold">Get a price</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Enter one blank below. Price updates automatically as you type.
      </p>

      <section className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Material
          <select
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={form.materialCode}
            onChange={(e) => setForm((f) => ({ ...f, materialCode: e.target.value }))}
          >
            {Object.entries(CFG.materials).map(([code, m]) => (
              <option key={code} value={code}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Certification
          <select
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={form.certTier}
            onChange={(e) => setForm((f) => ({ ...f, certTier: e.target.value }))}
          >
            {Object.entries(CFG.certification_tiers).map(([code, t]) => (
              <option key={code} value={code}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-neutral-500">{certTierSpec.description}</span>
        </label>

        <div className="sm:col-span-2">
          {!brandExpanded ? (
            <button
              type="button"
              className="text-sm text-amber-700 underline decoration-dotted underline-offset-4 dark:text-amber-500"
              onClick={() => setBrandExpanded(true)}
            >
              Need a specific mill brand? (any approved source is used by default)
            </button>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              Brand
              <select
                className="max-w-sm rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              >
                {Object.entries(material.brands).map(([code, b]) => (
                  <option key={code} value={code}>
                    {b.label}
                  </option>
                ))}
              </select>
              {form.brand !== "GENERIC" && certTierSpec && !certTierSpec.brand_selection_allowed && (
                <span className="text-xs text-red-600">
                  A named brand requires the Tier 1 traceable option.
                </span>
              )}
            </label>
          )}
          <SpecsAccordion specs={material.brands[form.brand]?.applicable_specs} />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Length (in)
          <input
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={form.lengthRaw}
            placeholder='12 or 12 1/2'
            onChange={(e) => setForm((f) => ({ ...f, lengthRaw: e.target.value }))}
          />
          {lengthError && <span className="text-xs text-red-600">{lengthError}</span>}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Width (in)
          <input
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={form.widthRaw}
            placeholder="12 or 12 1/2"
            onChange={(e) => setForm((f) => ({ ...f, widthRaw: e.target.value }))}
          />
          {widthError && <span className="text-xs text-red-600">{widthError}</span>}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Thickness (in)
          <select
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={form.thickness}
            onChange={(e) => setForm((f) => ({ ...f, thickness: Number(e.target.value) }))}
          >
            {material.stock_thicknesses_in.map((t) => (
              <option key={t} value={t}>
                {t} in
              </option>
            ))}
          </select>
          <span className="text-xs text-neutral-500">
            As-supplied by the mill, not machined. Ships roughly {material.thickness_oversize_in}
            in over nominal.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Quantity
          <input
            type="number"
            min={CFG.geometry_limits.min_qty}
            max={CFG.geometry_limits.max_qty_per_line}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={form.qty}
            onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Tolerance
          <select
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={form.toleranceTier}
            onChange={(e) => setForm((f) => ({ ...f, toleranceTier: e.target.value }))}
          >
            {Object.entries(CFG.tolerance_tiers).map(([code, t]) => (
              <option key={code} value={code}>
                {t.label} (up to {t.max_dim_in} in)
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Edge finish
          <select
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={form.edgeFinish}
            onChange={(e) => setForm((f) => ({ ...f, edgeFinish: e.target.value }))}
          >
            {Object.entries(CFG.edge_finish).map(([code, f]) => (
              <option key={code} value={code}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Face finish
          <select
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={form.faceFinish}
            onChange={(e) => setForm((f) => ({ ...f, faceFinish: e.target.value }))}
          >
            {Object.entries(CFG.face_finish).map(([code, f]) => (
              <option key={code} value={code}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            disabled={!annealEligible}
            checked={form.anneal}
            onChange={(e) => setForm((f) => ({ ...f, anneal: e.target.checked }))}
          />
          Stress-relief anneal
          {!annealEligible && <span className="text-xs text-neutral-500">(not offered for this material)</span>}
        </label>

        {material.residual_stress_flag && (
          <p className="text-xs text-neutral-500 sm:col-span-2">
            {material.label} carries residual stress. A cut blank can bow 0.010-0.025 in within 48 hours as that
            stress releases - annealing above relaxes it before it ships.
          </p>
        )}

        <div className="sm:col-span-2">
          <div className="text-sm font-medium">Add-ons</div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(CFG.add_ons)
              .filter(([code]) => !HIDDEN_ADD_ONS.has(code))
              .map(([code, spec]) => {
                const blocked = certTierSpec.blocked_addons.includes(code);
                const checked = form.addOns.includes(code);
                return (
                  <label key={code} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={blocked}
                      checked={checked}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          addOns: e.target.checked ? [...f.addOns, code] : f.addOns.filter((c) => c !== code),
                        }))
                      }
                    />
                    {spec.label}
                    {blocked && <span className="text-xs text-neutral-500">(Tier 1 only)</span>}
                  </label>
                );
              })}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Ship to ZIP
          <input
            className="w-32 rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            value={form.destZip}
            onChange={(e) => setForm((f) => ({ ...f, destZip: e.target.value }))}
          />
        </label>

        <details className="sm:col-span-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <summary className="cursor-pointer text-sm font-medium">Internal part reference (optional)</summary>
          <label className="mt-2 flex flex-col gap-1 text-sm">
            <input
              maxLength={40}
              className="max-w-sm rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              value={form.partRef}
              placeholder="e.g. your drawing or part number"
              onChange={(e) => setForm((f) => ({ ...f, partRef: e.target.value }))}
            />
            <span className="text-xs text-neutral-500">
              Internal reference only, shown on your paperwork - not used for pricing. Up to 40 characters.
            </span>
          </label>
        </details>
      </section>

      {/* CLAUDE_CODE_BRIEF.md §20.1 - lives right under the input fields,
          updating on the same debounce as the price above, not gated behind
          a results screen. Shows an empty outline before a price exists. */}
      {soloGroups && soloGroups.length > 0 ? (
        soloGroups.map((g, i) => (
          <SheetDiagram key={`${g.material_code}-${g.brand}-${g.thickness_nominal}-${g.certification_tier}-${i}`} group={g} />
        ))
      ) : (
        <EmptySheetOutline lengthIn={emptySheetSize.sheet_length_in} widthIn={emptySheetSize.sheet_width_in} materialLabel={material.label} />
      )}

      <section className="mt-6 rounded border border-neutral-300 p-4 dark:border-neutral-700">
        <div className="text-sm font-medium">Upload dimensions instead</div>
        <p className="mt-1 text-xs text-neutral-500">
          Accepts .csv of dimensions only.{" "}
          <a className="underline" href="/templates/dimension-upload-template.csv" download>
            Download the template
          </a>
          . We don&apos;t accept drawings or 3D models - dimensions only, deliberately.
        </p>
        <input
          type="file"
          accept=".csv"
          aria-label="Upload a CSV file of dimensions"
          className="mt-2 text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        {uploadNotice && <p className="mt-2 text-sm">{uploadNotice}</p>}
        {uploadErrors.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-red-600">
            {uploadErrors.map((err) => (
              <li key={err.row}>
                Row {err.row}: {err.message}
              </li>
            ))}
          </ul>
        )}
        {uploadLines.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {uploadLines.map((line, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>
                  {line.material_code} {line.length_in}x{line.width_in}x{line.thickness_in} in x{" "}
                  {line.qty ?? 1}
                </span>
                <button
                  type="button"
                  className="text-xs text-amber-700 underline dark:text-amber-500"
                  onClick={() => loadUploadedLine(line)}
                >
                  Load into form
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="lead-time-table" className="mt-8">
        <h2 className="text-lg font-medium">Lead time and price</h2>
        {apiError && <p className="mt-2 text-sm text-red-600">{apiError}</p>}
        {loading && <p className="mt-2 text-sm text-neutral-500">Pricing...</p>}

        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
                <th scope="col" className="py-2 pr-4">
                  <span className="sr-only">Select</span>
                </th>
                <th scope="col" className="py-2 pr-4">Lead time</th>
                <th scope="col" className="py-2 pr-4">Price</th>
                <th scope="col" className="py-2 pr-4">Ship date</th>
              </tr>
            </thead>
            <tbody>
              {LEAD_TIER_ORDER.map((tier) => {
                const r = results[tier];
                const unavailable = r ? !r.lead_time.available : false;
                return (
                  <tr
                    key={tier}
                    className={`border-b border-neutral-200 dark:border-neutral-800 ${
                      unavailable ? "text-neutral-400 dark:text-neutral-600" : ""
                    }`}
                  >
                    <td className="py-2 pr-4">
                      <input
                        type="radio"
                        name="lead_tier"
                        aria-label={CFG.lead_tiers[tier].label}
                        disabled={unavailable}
                        checked={selectedTier === tier}
                        onChange={() => setSelectedTier(tier)}
                      />
                    </td>
                    <td className="py-2 pr-4">{CFG.lead_tiers[tier].label}</td>
                    {unavailable ? (
                      <td className="py-2 pr-4 text-xs" colSpan={2}>
                        Unavailable today - shop is closed
                      </td>
                    ) : (
                      <>
                        <td className="py-2 pr-4 font-mono tabular-nums">
                          {r ? money(r.totals.total_due) : "—"}
                        </td>
                        <td className="py-2 pr-4 font-mono tabular-nums whitespace-nowrap">
                          {r ? r.lead_time.promised_ship_date : "—"}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="mt-6 space-y-3 rounded border border-neutral-300 p-4 dark:border-neutral-700">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{money(selected.totals.subtotal_goods)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Shipping</span>
              <span className="font-mono tabular-nums">{money(selected.totals.shipping)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="font-mono tabular-nums">{money(selected.totals.total_due)}</span>
            </div>

            {/* CLAUDE_CODE_BRIEF.md §20.5 - near the price, visible without
                scrolling once a valid price has resolved. Shares the same
                email field the checkout form below uses. */}
            <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <input
                type="email"
                className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                value={checkoutEmail}
                onChange={(e) => setCheckoutEmail(e.target.value)}
                placeholder="you@yourshop.com"
              />
              <button
                type="button"
                disabled={!checkoutEmail || emailQuoteStatus === "sending"}
                onClick={() => void handleEmailQuote()}
                className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700"
              >
                {emailQuoteStatus === "sending" ? "Sending..." : "Email me this quote"}
              </button>
              {emailQuoteStatus === "sent" && <span className="text-xs text-green-700 dark:text-green-500">Sent - check your inbox.</span>}
              {emailQuoteStatus === "error" && emailQuoteError && <span className="text-xs text-red-600">{emailQuoteError}</span>}
            </div>

            <p className="text-xs text-neutral-500">{selected.spec_statement}</p>

            {selected.competitive_comparison && (
              <p className="text-xs text-neutral-600 dark:text-neutral-400">{selected.competitive_comparison}</p>
            )}

            <div className="mt-4 space-y-3 border-t border-neutral-300 pt-4 dark:border-neutral-700">
              <label className="flex flex-col gap-1 text-sm">
                Email
                <input
                  type="email"
                  required
                  className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                  value={checkoutEmail}
                  onChange={(e) => setCheckoutEmail(e.target.value)}
                  placeholder="you@yourshop.com"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  Company (optional)
                  <input
                    className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                    value={checkoutCompany}
                    onChange={(e) => setCheckoutCompany(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Purchase order number (optional)
                  <input
                    className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                    value={checkoutPo}
                    onChange={(e) => setCheckoutPo(e.target.value)}
                  />
                </label>
              </div>
              <details className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
                <summary className="cursor-pointer text-sm font-medium">Attach a purchase order (optional)</summary>
                <p className="mt-2 text-xs text-neutral-500">
                  PDF only, up to 5 MB. Kept on file as a reference for fulfilment - never read or parsed
                  automatically.
                </p>
                <input
                  type="file"
                  accept=".pdf"
                  className="mt-2 text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePoUpload(file);
                  }}
                />
                {poUploadStatus === "uploading" && <p className="mt-1 text-xs text-neutral-500">Uploading...</p>}
                {poUploadStatus === "done" && <p className="mt-1 text-xs text-green-700 dark:text-green-500">Attached.</p>}
                {poUploadStatus === "error" && poUploadError && <p className="mt-1 text-xs text-red-600">{poUploadError}</p>}
              </details>

              {checkoutError && <p className="text-sm text-red-600">{checkoutError}</p>}
              <button
                type="button"
                disabled={!checkoutEmail || checkoutLoading}
                onClick={() => void handleCheckout()}
                className="rounded bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-600"
              >
                {checkoutLoading ? "Starting checkout..." : "Continue to payment"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
