import type { LineResult, PricingConfig } from "./engine";
import { expand_to_parts, group_queue, nest, type QueueRow } from "./nesting";

/**
 * CLAUDE_CODE_BRIEF.md §19 (Phase 11) - the SOLO nest preview shown at quote
 * time. This calls the exact same nester used for real fulfilment (Phase 7),
 * but only against the current request's own lines, with a synthetic
 * "SOLO" order id. It is read-only: no nest_runs row, no remnant register
 * entry, no effect on pricing. It exists to answer "what would my own parts
 * look like, alone, on a sheet" - never "what will actually get cut," since
 * the real cut may batch with orders that don't exist yet.
 */

export interface SoloPlacementView {
  x: number;
  y: number;
  length_in: number;
  width_in: number;
  rotated: boolean;
  strip_index: number;
  line_no: number;
  label: string;
}

export interface SoloRemnantView {
  x: number;
  y: number;
  length_in: number;
  width_in: number;
  source: "strip_tail" | "sheet_tail";
  keepable: boolean;
}

export interface SoloSheetView {
  index: number;
  length_in: number;
  width_in: number;
  placements: SoloPlacementView[];
  remnants: SoloRemnantView[];
}

export interface SoloNestGroup {
  material_code: string;
  brand: string;
  thickness_nominal: number;
  certification_tier: string;
  sheets: SoloSheetView[];
  sheet_count: number;
  utilisation: number;
  recoverable_fraction: number;
}

export interface SoloNestResult {
  groups: SoloNestGroup[];
}

const SOLO_ORDER_ID = "SOLO";

/**
 * expand_to_parts() builds part_id as `${order_id}-L${line_no}-${i+1}`
 * (see lib/pricing/nesting.ts). Parsing it back out here - rather than
 * threading a separate lookup through the packer - keeps expand_to_parts
 * itself untouched, since fulfilment (Phase 7) depends on its exact
 * behaviour too.
 */
function lineNoFromPartId(part_id: string): number {
  const m = /^SOLO-L(\d+)-\d+$/.exec(part_id);
  return m ? Number(m[1]) : 1;
}

/** Builds the read-only solo nest preview for one priced quote's lines. */
export function buildSoloNest(lines: LineResult[], cfg: PricingConfig): SoloNestResult {
  const labelByLineNo = new Map<number, string>();
  const queueRows: QueueRow[] = lines.map((ln, idx) => {
    const line_no = idx + 1;
    labelByLineNo.set(line_no, ln.part_ref.trim() || `Line ${line_no}`);
    return {
      order_id: SOLO_ORDER_ID,
      line_no,
      material_code: ln.material_code,
      brand: ln.brand,
      thickness_nominal: ln.thickness_nominal_in,
      certification_tier: ln.certification_tier,
      length_in: ln.length_in,
      width_in: ln.width_in,
      qty: ln.qty,
    };
  });

  const groups = group_queue(queueRows, cfg).map(({ rows }): SoloNestGroup => {
    const material_code = rows[0].material_code;
    const mat = cfg.materials[material_code];
    const parts = expand_to_parts(rows, cfg);
    const result = nest(parts, mat.sheet_length_in, mat.sheet_width_in, cfg);

    return {
      material_code,
      brand: rows[0].brand,
      thickness_nominal: rows[0].thickness_nominal,
      certification_tier: rows[0].certification_tier,
      sheets: result.sheets.map((sh) => ({
        index: sh.index,
        length_in: sh.length_in,
        width_in: sh.width_in,
        placements: sh.placements.map((p) => {
          const line_no = lineNoFromPartId(p.part_id);
          return {
            x: p.x,
            y: p.y,
            length_in: p.length_in,
            width_in: p.width_in,
            rotated: p.rotated,
            strip_index: p.strip_index,
            line_no,
            label: labelByLineNo.get(line_no) ?? `Line ${line_no}`,
          };
        }),
        remnants: sh.remnants.map((r) => ({
          x: r.x,
          y: r.y,
          length_in: r.length_in,
          width_in: r.width_in,
          source: r.source,
          keepable: r.keepable,
        })),
      })),
      sheet_count: result.summary.sheet_count,
      utilisation: result.summary.utilisation,
      recoverable_fraction: result.summary.recoverable_fraction,
    };
  });

  return { groups };
}
