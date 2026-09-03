import { NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { checkForRejectedDrawing } from "@/lib/uploads/reject-drawings";
import { parseDimensionRows } from "@/lib/uploads/parse-dimensions";
import type { PricingConfig } from "@/lib/pricing/engine";
import cfgJson from "@/lib/pricing/config.json";

const CFG = cfgJson as unknown as PricingConfig;

/**
 * Parses an uploaded dimensions spreadsheet (.csv, .xlsx, .xls) into line
 * items. Hard-rejects drawings and 3D models by extension AND magic bytes
 * before anything else runs - see lib/uploads/reject-drawings.ts. This
 * endpoint never prices anything; it only returns structured rows (plus
 * per-row errors) for the quote builder to review before pricing.
 */
export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const drawingCheck = checkForRejectedDrawing(file.name, bytes);
  if (drawingCheck.rejected) {
    return NextResponse.json({ error: drawingCheck.reason }, { status: 415 });
  }

  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  let rawRows: Record<string, unknown>[];

  try {
    if (ext === "csv") {
      const text = new TextDecoder("utf-8").decode(bytes);
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      rawRows = parsed.data;
    } else if (ext === "xlsx" || ext === "xls") {
      const wb = XLSX.read(bytes, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    } else {
      return NextResponse.json({ error: "Upload a .csv, .xlsx or .xls file of dimensions." }, { status: 415 });
    }
  } catch {
    return NextResponse.json({ error: "Could not read that file. Is it a valid spreadsheet?" }, { status: 400 });
  }

  const { lines, errors } = parseDimensionRows(rawRows, CFG);
  return NextResponse.json({ lines, errors });
}
