import { NextResponse } from "next/server";
import { createLot, listLots, updateLotDocuments, DuplicateLotError } from "@/lib/lots/store";
import { uploadPrivateFile } from "@/lib/supabase/storage";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";

const CFG = cfgJson as unknown as PricingConfig;

export async function GET(): Promise<Response> {
  const lots = await listLots();
  return NextResponse.json({ lots });
}

function requireString(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function readPdfFile(form: FormData, key: string): Promise<{ name: string; bytes: Buffer } | null> {
  const file = form.get(key);
  if (!(file instanceof File) || file.size === 0) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const looksLikePdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!looksLikePdf) {
    throw new Error(`${key === "mtr" ? "The Material Test Report" : "The resin certificate"} must be a PDF file.`);
  }
  return { name: file.name, bytes };
}

/** Adds a lot to the library - see CLAUDE_CODE_BRIEF.md §10 "Lot library." */
export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();

  const lot_number = requireString(form, "lot_number");
  const material_code = requireString(form, "material_code");
  const brand = requireString(form, "brand");
  const certification_tier = requireString(form, "certification_tier");
  const manufacturer = requireString(form, "manufacturer");
  const thicknessRaw = requireString(form, "thickness_nominal");
  const received_date = requireString(form, "received_date");

  const missing = [
    !lot_number && "lot number",
    !material_code && "material",
    !brand && "brand",
    !certification_tier && "certification tier",
    !manufacturer && "manufacturer",
    !thicknessRaw && "nominal thickness",
    !received_date && "received date",
  ].filter(Boolean);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing required field(s): ${missing.join(", ")}.` }, { status: 400 });
  }

  const mat = CFG.materials[material_code!];
  if (!mat) {
    return NextResponse.json({ error: `"${material_code}" is not a known material code.` }, { status: 400 });
  }
  if (brand === "GENERIC" || !mat.brands[brand!]) {
    return NextResponse.json(
      { error: `"${brand}" is not a real brand for ${mat.label}. A lot must name the actual manufacturer's brand, not "any approved source".` },
      { status: 400 }
    );
  }
  if (!CFG.certification_tiers[certification_tier!]) {
    return NextResponse.json({ error: `"${certification_tier}" is not a known certification tier.` }, { status: 400 });
  }
  const thickness_nominal = Number(thicknessRaw);
  if (!Number.isFinite(thickness_nominal) || !mat.stock_thicknesses_in.includes(thickness_nominal)) {
    return NextResponse.json(
      { error: `${thickness_nominal} in is not a stocked thickness for ${mat.label}. Available: ${mat.stock_thicknesses_in.join(", ")} in.` },
      { status: 400 }
    );
  }

  let mtrFile: { name: string; bytes: Buffer } | null;
  let resinCertFile: { name: string; bytes: Buffer } | null;
  try {
    mtrFile = await readPdfFile(form, "mtr");
    resinCertFile = await readPdfFile(form, "resin_cert");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 415 });
  }

  const distributor = requireString(form, "distributor");
  const distributor_po = requireString(form, "distributor_po");
  const country_of_origin = requireString(form, "country_of_origin");
  const qty_received_raw = requireString(form, "qty_received_in2");
  const notes = requireString(form, "notes");

  let lot;
  try {
    lot = await createLot({
      lot_number: lot_number!,
      material_code: material_code!,
      brand: brand!,
      certification_tier: certification_tier!,
      manufacturer: manufacturer!,
      distributor,
      distributor_po,
      country_of_origin,
      thickness_nominal,
      received_date: received_date!,
      qty_received_in2: qty_received_raw ? Number(qty_received_raw) : null,
      qty_remaining_in2: qty_received_raw ? Number(qty_received_raw) : null,
      notes,
    });
  } catch (err) {
    if (err instanceof DuplicateLotError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const docPatch: { mtr_path?: string; mtr_uploaded_at?: string; resin_cert_path?: string } = {};
  if (mtrFile) {
    const path = `${lot.id}/${mtrFile.name}`;
    await uploadPrivateFile("mtr", path, mtrFile.bytes, "application/pdf");
    docPatch.mtr_path = path;
    docPatch.mtr_uploaded_at = new Date().toISOString();
  }
  if (resinCertFile) {
    const path = `${lot.id}/${resinCertFile.name}`;
    await uploadPrivateFile("resin-certs", path, resinCertFile.bytes, "application/pdf");
    docPatch.resin_cert_path = path;
  }
  if (Object.keys(docPatch).length > 0) {
    lot = await updateLotDocuments(lot.id, docPatch);
  }

  return NextResponse.json({ lot });
}
