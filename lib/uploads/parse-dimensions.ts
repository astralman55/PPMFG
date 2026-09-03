import { quote, QuoteError, type PricingConfig } from "../pricing/engine";
import type { LineItemInput } from "../pricing/engine";
import { parse_fraction_input, DimensionInputError } from "../pricing/fractions";

/**
 * Dimension-only spreadsheet upload, per CLAUDE_CODE_BRIEF.md §7.2.
 *
 * Template columns:
 *   part_ref,material_code,brand,certification_tier,length_in,width_in,
 *   thickness_in,qty,tolerance_tier,edge_finish
 *
 * Optional columns are simply left off the line item; the pricing engine's
 * own normalisation (lib/pricing/engine.ts) already applies the same
 * defaults (GENERIC brand, TIER1_TRACEABLE, STANDARD tolerance, etc.), so
 * this module doesn't duplicate that logic.
 *
 * Each row is dry-run through the engine (STD tier, default sourcing) so
 * that business-rule errors - unknown material, non-stocked thickness, a
 * tolerance the span can't hold - are caught here, with the row number,
 * rather than surfacing later as a generic pricing failure.
 */

export interface RowError {
  row: number;
  message: string;
}

export interface ParseDimensionsResult {
  lines: LineItemInput[];
  errors: RowError[];
}

function get(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function parseDim(raw: string, field: string): number {
  if (raw === "") {
    throw new Error(`${field} is required.`);
  }
  try {
    return parse_fraction_input(raw);
  } catch (e) {
    if (e instanceof DimensionInputError) {
      throw new Error(`${field} '${raw}' is not a valid dimension.`);
    }
    throw e;
  }
}

function rowToLineItem(raw: Record<string, unknown>): LineItemInput {
  const material_code = get(raw, "material_code");
  if (!material_code) throw new Error("material_code is required.");

  const line: LineItemInput = {
    material_code,
    length_in: parseDim(get(raw, "length_in"), "length_in"),
    width_in: parseDim(get(raw, "width_in"), "width_in"),
    thickness_in: parseDim(get(raw, "thickness_in"), "thickness_in"),
  };

  const part_ref = get(raw, "part_ref");
  if (part_ref) line.part_ref = part_ref.slice(0, 40);

  const brand = get(raw, "brand");
  if (brand) line.brand = brand;

  const certification_tier = get(raw, "certification_tier");
  if (certification_tier) line.certification_tier = certification_tier;

  const tolerance_tier = get(raw, "tolerance_tier");
  if (tolerance_tier) line.tolerance_tier = tolerance_tier;

  const edge_finish = get(raw, "edge_finish");
  if (edge_finish) line.edge_finish = edge_finish;

  const qtyRaw = get(raw, "qty");
  if (qtyRaw) {
    const qty = Number(qtyRaw);
    if (!Number.isInteger(qty)) {
      throw new Error(`qty '${qtyRaw}' is not a whole number.`);
    }
    line.qty = qty;
  }

  return line;
}

export function parseDimensionRows(rawRows: Record<string, unknown>[], cfg: PricingConfig): ParseDimensionsResult {
  const lines: LineItemInput[] = [];
  const errors: RowError[] = [];

  rawRows.forEach((raw, idx) => {
    const row = idx + 2; // spreadsheet row number; header occupies row 1
    try {
      const line = rowToLineItem(raw);
      // Dry-run through the engine to surface config-driven rejections
      // (unknown material, non-stocked thickness, tolerance span, etc.)
      // with this row's number attached.
      quote({ lines: [line], lead_tier: "STD", sourcing_mode: "MASTER_SHEET" }, cfg);
      lines.push(line);
    } catch (e) {
      if (e instanceof QuoteError) {
        errors.push({ row, message: e.message.replace(/^Line 1: /, "") });
      } else if (e instanceof Error) {
        errors.push({ row, message: e.message });
      } else {
        errors.push({ row, message: "Could not read this row." });
      }
    }
  });

  return { lines, errors };
}
